use super::*;

pub(crate) async fn collect_service_runtime_bundle(config_file: &Path) -> Result<RuntimeBundle> {
    let verge_config = Config::verge().await;
    let clash_core = verge_config.latest_arc().get_valid_clash_core();
    drop(verge_config);

    let bin_ext = if cfg!(windows) { ".exe" } else { "" };
    let bin_path = service_core_path(&clash_core, bin_ext)?;
    collect_runtime_bundle(config_file, &bin_path).await
}

/// A staging response whose refusal code tells callers whether a fresh start can help.
pub(crate) enum StageRequest {
    Refused { code: u16, message: String },
    Answered(StageRuntimeOutcome),
}

impl StageRequest {
    /// Whether a refusal is about the bundle, and so would be repeated by starting from it.
    pub(crate) const fn is_about_the_bundle(code: u16) -> bool {
        code == ServiceErrorCode::InvalidRuntimeAsset as u16 || code == ServiceErrorCode::InvalidInstallLocation as u16
    }
}

/// Requests in-place staging. `Err` means no answer; refusals are returned for caller policy.
pub(crate) async fn stage_runtime_by_service(config_file: &Path) -> Result<StageRequest> {
    let session = active_service_session()?;
    let credentials = current_owner_credentials()?;
    let runtime = collect_service_runtime_bundle(config_file).await?;

    let response = clash_verge_service_ipc::stage_runtime(&credentials, &session, &runtime)
        .await
        .context("无法连接到Clash Verge Service")?;
    if response.code > 0 {
        return Ok(StageRequest::Refused {
            code: response.code,
            message: response.message,
        });
    }
    response
        .data
        .map(StageRequest::Answered)
        .context("Clash Verge Service 未返回运行时暂存结果")
}

/// 尝试使用服务启动core
#[tracing::instrument(skip_all, level = "info", fields(generation = tracing::field::Empty, staging = tracing::field::Empty, code = tracing::field::Empty, outcome = tracing::field::Empty))]
pub(crate) async fn start_with_existing_service(config_file: &Path) -> Result<()> {
    clear_active_service_session();

    let credentials = current_owner_credentials()?;
    let runtime = collect_service_runtime_bundle(config_file).await?;
    let proposed_session_token = generate_service_session_token()?;
    let request = StartClashRequest {
        runtime,
        proposed_session_token: proposed_session_token.clone(),
        macos_proxy: None,
    };

    let response = match clash_verge_service_ipc::start_clash(&credentials, &request).await {
        Ok(response) => response,
        Err(error) => {
            tracing::Span::current().record("outcome", "ipc-unreachable");
            start_owner_monitor();
            return Err(error).context("无法连接到Clash Verge Service");
        }
    };

    if response.code > 0 {
        tracing::Span::current().record("code", response.code);
        tracing::Span::current().record("outcome", "refused");
        let err_msg = response.message;
        logging!(
            error,
            Type::Service,
            "启动核心失败 (code {}): {}",
            response.code,
            err_msg
        );
        start_owner_monitor();
        bail!(
            "failed to start Service core at {}: {err_msg}",
            request.runtime.core_path
        );
    }

    let result = response.data.context("Clash Verge Service 未返回会话信息")?;
    tracing::Span::current().record("generation", result.session.generation);
    let capabilities = probe_service_capabilities().await;
    tracing::Span::current().record("staging", capabilities.runtime_staging);
    *ACTIVE_SERVICE_SESSION.lock() = Some(ActiveServiceSession {
        proof: OwnerSessionProof {
            generation: result.session.generation,
            token: proposed_session_token,
        },
        supports_runtime_staging: capabilities.runtime_staging,
        supports_runtime_file_read: capabilities.runtime_file_read,
    });

    // PAC follows the Running Mode; the caller opens it via `core_started(Service)`.
    start_owner_monitor();
    tracing::Span::current().record("outcome", "started");
    logging!(
        info,
        Type::Service,
        "服务成功启动核心 (session generation {})",
        result.session.generation
    );
    Ok(())
}

// 以服务启动core
pub(crate) async fn run_core_by_service(config_file: &Path) -> Result<()> {
    SERVICE_MANAGER.refresh().await?;

    let status = SERVICE_MANAGER.current().await;
    if !matches!(status, ServiceStatus::Ready) {
        bail!("service is not ready after refresh: {status:?}");
    }

    logging!(info, Type::Service, "服务已运行且版本匹配，直接使用");
    start_with_existing_service(config_file).await
}

pub(crate) async fn capture_generation_before<F, Fut, T>(generation: &AtomicU64, operation: F) -> (u64, T)
where
    F: FnOnce() -> Fut,
    Fut: Future<Output = T>,
{
    let captured = generation.load(Ordering::Acquire);
    (captured, operation().await)
}

pub(crate) async fn get_clash_logs_by_service() -> Result<Vec<String>> {
    // Frontend-polled: no per-call logging here.
    let credentials = current_owner_credentials()?;
    let (generation, response) = capture_generation_before(&OWNER_MONITOR_GENERATION, || {
        clash_verge_service_ipc::get_clash_logs(&credentials)
    })
    .await;
    let response = response.context("无法连接到Clash Verge Service")?;

    if response.code > 0 {
        if response.code == clash_verge_service_ipc::ServiceErrorCode::NotActive as u16 {
            recover_after_owner_loss(generation, OwnerRecoveryReason::Displaced).await;
        }
        let err_msg = response.message;
        bail!(err_msg);
    }

    Ok(response.data.unwrap_or_default())
}

pub(crate) async fn get_clash_log_snapshot_by_service() -> Result<String> {
    let credentials = current_owner_credentials()?;
    let (generation, response) = capture_generation_before(&OWNER_MONITOR_GENERATION, || {
        clash_verge_service_ipc::get_clash_log_snapshot(&credentials)
    })
    .await;
    let response = response.context("无法连接到Clash Verge Service")?;
    if response.code > 0 {
        if response.code == clash_verge_service_ipc::ServiceErrorCode::NotActive as u16 {
            recover_after_owner_loss(generation, OwnerRecoveryReason::Displaced).await;
        }
        bail!(response.message);
    }
    let encoded = response.data.context("服务未返回核心日志快照")?;
    let content = decode_hex(&encoded).context("服务返回了无效的核心日志快照")?;
    Ok(String::from_utf8_lossy(&content).into_owned())
}

pub(crate) fn decode_hex(encoded: &str) -> Result<Vec<u8>> {
    if !encoded.len().is_multiple_of(2) {
        bail!("hex payload has an odd length");
    }
    (0..encoded.len())
        .step_by(2)
        .map(|offset| u8::from_str_radix(&encoded[offset..offset + 2], 16).context("hex payload is malformed"))
        .collect()
}
