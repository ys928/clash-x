use super::*;

/// 通过服务停止 core。
#[tracing::instrument(skip_all, level = "info", fields(code = tracing::field::Empty, outcome = tracing::field::Empty))]
pub(crate) async fn stop_core_by_service() -> Result<()> {
    cancel_owner_monitors();

    let credentials = match current_owner_credentials() {
        Ok(credentials) => credentials,
        Err(error) => {
            start_owner_monitor();
            return Err(error);
        }
    };
    let session = match active_service_session() {
        Ok(session) => session,
        Err(error) => {
            start_owner_monitor();
            return Err(error);
        }
    };
    let response = match clash_verge_service_ipc::stop_clash(&credentials, &session).await {
        Ok(response) => response,
        Err(error) => {
            start_owner_monitor();
            return Err(error).context("无法连接到Clash Verge Service");
        }
    };

    if response.code > 0 {
        if matches!(
            response.code,
            code if code == clash_verge_service_ipc::ServiceErrorCode::NotActive as u16
                || code == clash_verge_service_ipc::ServiceErrorCode::StaleOwnerSession as u16
        ) {
            recover_after_owner_loss_while_locked(OwnerRecoveryReason::Displaced).await;
        } else {
            start_owner_monitor();
        }
        let err_msg = response.message;
        tracing::Span::current().record("code", response.code);
        tracing::Span::current().record("outcome", "refused");
        logging!(
            error,
            Type::Service,
            "停止核心失败 (code {}): {}",
            response.code,
            err_msg
        );
        bail!(err_msg);
    }

    clear_active_service_session();
    tracing::Span::current().record("outcome", "stopped");
    logging!(info, Type::Service, "服务成功停止核心");
    Ok(())
}

pub(crate) async fn update_writer_by_service(writer: &WriterConfig) -> Result<()> {
    let credentials = current_owner_credentials()?;
    let session = active_service_session()?;
    let response = clash_verge_service_ipc::update_writer(&credentials, &session, writer)
        .await
        .context("无法连接到Clash Verge Service")?;
    if response.code > 0 {
        logging!(
            warn,
            Type::Service,
            "update writer rejected by service: code={}, {}",
            response.code,
            response.message
        );
        bail!(response.message);
    }
    Ok(())
}

pub(crate) async fn set_system_proxy_by_service(proxy: &MacosProxyConfig) -> Result<ProxyApplyOutcome> {
    let session = active_service_session()?;
    set_system_proxy_by_service_with_session(proxy, &session).await
}

pub(crate) async fn set_system_proxy_by_service_with_session(
    proxy: &MacosProxyConfig,
    session: &OwnerSessionProof,
) -> Result<ProxyApplyOutcome> {
    let credentials = current_owner_credentials()?;
    let response = clash_verge_service_ipc::set_system_proxy(&credentials, session, proxy)
        .await
        .context("无法连接到Clash Verge Service")?;
    if response.code > 0 {
        logging!(
            warn,
            Type::Service,
            "set system proxy rejected by service: code={}, {}",
            response.code,
            response.message
        );
        bail!(response.message);
    }
    response.data.context("Clash Verge Service 未返回系统代理结果")
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct OwnerRecoveryPolicy {
    pub(crate) reset_system_proxy: bool,
}

pub(crate) const fn owner_recovery_policy(_reason: OwnerRecoveryReason, is_macos: bool) -> OwnerRecoveryPolicy {
    OwnerRecoveryPolicy {
        reset_system_proxy: !is_macos,
    }
}

pub(crate) fn mark_service_unavailable_after_owner_loss<E: RunStateEnv>(
    store: &RunStateStore<E>,
    reason: OwnerRecoveryReason,
) {
    if matches!(reason, OwnerRecoveryReason::TransportFailure) {
        store.observe(ServiceHealth::Unavailable(
            "service control IPC unavailable after sustained transport failure".to_owned(),
        ));
    }
}

/// How often the owner monitor samples Service status.
pub(crate) const OWNER_MONITOR_INTERVAL: Duration = Duration::from_secs(5);
/// Mirrors `OwnerWatch`'s tolerance, for the log line only.
pub(crate) const SUSTAINED_OWNER_SAMPLES: u8 = 3;

pub(crate) fn start_owner_monitor() {
    let generation = OWNER_MONITOR_GENERATION.fetch_add(1, Ordering::AcqRel) + 1;
    AsyncHandler::spawn(move || async move {
        logging!(debug, Type::Service, "owner monitor started (generation {generation})");
        let mut watch = OwnerWatch::new();
        loop {
            tokio::time::sleep(OWNER_MONITOR_INTERVAL).await;
            if OWNER_MONITOR_GENERATION.load(Ordering::Acquire) != generation {
                logging!(
                    debug,
                    Type::Service,
                    "owner monitor superseded (generation {generation})"
                );
                break;
            }
            if !matches!(*CoreManager::global().get_running_mode(), RunningMode::Service) {
                logging!(
                    debug,
                    Type::Service,
                    "owner monitor stopped; core no longer in service mode (generation {generation})"
                );
                break;
            }

            let sample = read_owner_sample().await;
            let mut step = watch.observe(sample);
            if matches!(step, OwnerStep::VerifyTransport) {
                if watch.just_became_sustained() {
                    logging!(
                        warn,
                        Type::Service,
                        "service owner status unavailable for {SUSTAINED_OWNER_SAMPLES} samples (generation {generation}); \
                         preserving local proxy state while the core endpoint still answers"
                    );
                }
                let owner_endpoint_available = Handle::mihomo().get_version().await.is_ok();
                step = watch.resolve_transport(owner_endpoint_available);
            }

            if let OwnerStep::Recover(reason) = step {
                recover_after_owner_loss(generation, reason).await;
                break;
            }
        }
    });
}

/// Samples ownership, treating every unusable reply as unreadable.
pub(crate) async fn read_owner_sample() -> OwnerSample {
    let response = match current_owner_credentials() {
        Ok(credentials) => clash_verge_service_ipc::get_status(&credentials).await,
        Err(error) => Err(error),
    };

    let response = match response {
        Ok(response) => response,
        Err(error) => {
            logging!(debug, Type::Service, "service owner status was unreadable: {error:#}");
            return OwnerSample::Unreadable;
        }
    };

    if response.code == clash_verge_service_ipc::ServiceErrorCode::NotActive as u16 {
        return OwnerSample::NotActive;
    }
    if response.code != 0 {
        logging!(
            debug,
            Type::Service,
            "service owner status returned error {}: {}",
            response.code,
            response.message
        );
        return OwnerSample::Unreadable;
    }
    let Some(status) = response.data else {
        logging!(debug, Type::Service, "service owner status omitted data");
        return OwnerSample::Unreadable;
    };

    // A session that no longer matches is another owner's, whatever the flags say.
    if !session_matches_active_status(status.is_active, status.active_generation) {
        return OwnerSample::NotActive;
    }

    OwnerSample::Status {
        is_active: status.is_active,
        desired_core_should_be_running: status.desired_core_should_be_running,
        service_state: status.service_state,
        core_pid: status.core_pid,
    }
}

pub(crate) fn session_matches_active_status(is_active: bool, active_generation: Option<u64>) -> bool {
    ACTIVE_SERVICE_SESSION
        .lock()
        .as_ref()
        .is_some_and(|session| session_matches_status(&session.proof, is_active, active_generation))
}

pub(crate) fn cancel_owner_monitors() {
    OWNER_MONITOR_GENERATION.fetch_add(1, Ordering::AcqRel);
}

pub(crate) fn owner_monitor_generation() -> u64 {
    OWNER_MONITOR_GENERATION.load(Ordering::Acquire)
}

pub(crate) async fn recover_after_owner_loss(generation: u64, reason: OwnerRecoveryReason) {
    let manager = CoreManager::global();
    if !matches!(*manager.get_running_mode(), RunningMode::Service) {
        return;
    }
    let Some(recovery_generation) = claim_owner_recovery_generation(&OWNER_MONITOR_GENERATION, generation) else {
        return;
    };
    manager.invalidate_core_readiness();
    let _lifecycle = manager.lifecycle_lock.lock().await;
    if OWNER_MONITOR_GENERATION.load(Ordering::Acquire) != recovery_generation
        || !matches!(*manager.get_running_mode(), RunningMode::Service)
    {
        return;
    }
    recover_after_owner_loss_while_locked(reason).await;
}

pub(crate) fn claim_owner_recovery_generation(generation: &AtomicU64, captured_generation: u64) -> Option<u64> {
    let recovery_generation = captured_generation.wrapping_add(1);
    generation
        .compare_exchange(
            captured_generation,
            recovery_generation,
            Ordering::AcqRel,
            Ordering::Acquire,
        )
        .ok()
        .map(|_| recovery_generation)
}

#[tracing::instrument(skip_all, level = "info", fields(reason = ?reason))]
pub(crate) async fn recover_after_owner_loss_while_locked(reason: OwnerRecoveryReason) {
    logging!(
        warn,
        Type::Service,
        "service owner recovery ({reason:?}); clearing local proxy and PAC state"
    );
    mark_service_unavailable_after_owner_loss(&RUN_STATE, reason);
    proxy_control::stop_guard().await;
    clear_active_service_session();
    CoreManager::global().core_stopped();

    if !owner_recovery_policy(reason, cfg!(target_os = "macos")).reset_system_proxy {
        return;
    }

    let mut last_error = None;
    for attempt in 1..=3 {
        match proxy_control::clear().await {
            Ok(()) => return,
            Err(error) => {
                logging!(
                    warn,
                    Type::Service,
                    "proxy clear attempt {attempt}/3 after owner loss failed: {error:#}"
                );
                last_error = Some(error);
                tokio::time::sleep(Duration::from_millis(100)).await;
            }
        }
    }
    if let Some(error) = last_error {
        logging!(
            error,
            Type::Service,
            "failed to clear local proxy after owner loss: {error:#}"
        );
    }
}
