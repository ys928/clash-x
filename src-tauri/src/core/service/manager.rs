use super::*;

pub struct ServiceManager;

/// Waits for a repaired service, preserving readable rejection details but classifying sustained
/// silence as unavailable.
#[tracing::instrument(skip_all, level = "info", fields(attempts = tracing::field::Empty, interval_ms = tracing::field::Empty, outcome = tracing::field::Empty))]
pub(crate) async fn wait_for_service_ipc() -> Result<()> {
    const CONTEXT: &str = "service IPC did not become available";
    let config = ServiceManager::config();
    let span = tracing::Span::current();
    span.record("attempts", config.max_retries);
    span.record("interval_ms", config.retry_delay.as_millis() as u64);

    match RUN_STATE.await_ready(config.max_retries, config.retry_delay).await {
        Ok(_) => {
            tracing::Span::current().record("outcome", "ready");
            Ok(())
        }
        Err(ReadyWaitError::Unreachable(error)) => {
            tracing::Span::current().record("outcome", "unreachable");
            RUN_STATE.observe(ServiceHealth::Unavailable(format!("{CONTEXT}: {error:#}")));
            Err(error).context(CONTEXT)
        }
        Err(ReadyWaitError::Rejected(error)) => {
            tracing::Span::current().record("outcome", "rejected");
            Err(error).context(CONTEXT)
        }
    }
}

impl ServiceManager {
    pub const fn config() -> clash_verge_service_ipc::IpcConfig {
        clash_verge_service_ipc::IpcConfig {
            default_timeout: Duration::from_millis(1000),
            retry_delay: Duration::from_millis(500),
            max_retries: 20,
        }
    }

    pub async fn confirm_ready(&self) -> Result<()> {
        RUN_STATE.probe().await.map(|_| ())
    }

    pub async fn current(&self) -> ServiceStatus {
        ServiceStatus::from_run_state(&RUN_STATE.settled().await)
    }

    pub fn allow_sidecar_for_session(&self) -> Result<()> {
        RUN_STATE.allow_sidecar_for_session()
    }

    pub fn require_install_for_session(&self) -> Result<()> {
        RUN_STATE.require_install_for_session()
    }

    pub(crate) fn withdraw_sidecar_allowance(&self) -> bool {
        RUN_STATE.withdraw_sidecar_allowance()
    }

    pub async fn detect_startup_status(&self) {
        if cfg!(feature = "dev-sidecar") {
            RUN_STATE.accept_sidecar();
            return;
        }
        RUN_STATE.observe_current_health().await;
    }

    fn set_status(&self, status: ServiceStatus) {
        record_status(&RUN_STATE, status);
    }

    async fn run_operation(&self, operation: impl Future<Output = Result<()>>) -> Result<()> {
        run_operation_and_then(&RUN_STATE, operation, || async {
            if let Err(error) = Tray::global().update_menu().await {
                logging!(
                    warn,
                    Type::Service,
                    "failed to refresh tray after service operation: {error:#}"
                );
            }
            Ok(())
        })
        .await
    }

    pub async fn refresh(&self) -> Result<()> {
        self.run_operation(async { self.confirm_ready().await }).await
    }

    pub async fn handle_service_status(&self, status: ServiceStatus) -> Result<()> {
        // Box the large operation future once instead of carrying it in every calling command.
        self.run_operation(Box::pin(self.apply_service_status(status))).await
    }

    async fn apply_service_status(&self, status: ServiceStatus) -> Result<()> {
        // Use the caller's action; a racing observation may clear the stored pending action.
        let Some(action) = requested_action(&status) else {
            self.set_status(status.clone());
            return report_non_actionable_status(status);
        };
        // Atomically record the request and capture the Sidecar allowance it clears.
        let sidecar_allowed_before = RUN_STATE.request_action(action);

        logging!(info, Type::Service, "running privileged service action {action:?}");
        run_action_restoring_sidecar(&RUN_STATE, sidecar_allowed_before, async move {
            RUN_STATE.perform(action).await?;
            if !matches!(action, PendingAction::Uninstall) {
                wait_for_service_ipc().await?;
            }
            Ok(())
        })
        .await
    }
}

/// Runs through readiness and restores a displaced Sidecar allowance on failure.
pub(crate) async fn run_action_restoring_sidecar<E: RunStateEnv>(
    store: &RunStateStore<E>,
    was_allowed: bool,
    action: impl Future<Output = Result<()>>,
) -> Result<()> {
    let outcome = action.await;
    if outcome.is_err() && was_allowed && store.restore_sidecar_allowance() {
        logging!(
            info,
            Type::Service,
            "restored the Sidecar this session had already settled on"
        );
    }
    outcome
}

/// Explain a status that asks for no privileged action, refusing the ones we cannot act on.
pub(crate) fn report_non_actionable_status(status: ServiceStatus) -> Result<()> {
    match status {
        ServiceStatus::Checking => bail!("service status is still being checked"),
        ServiceStatus::Ready => logging!(info, Type::Service, "服务就绪，直接启动"),
        ServiceStatus::NotInstalled => {
            logging!(info, Type::Service, "service is not installed; Sidecar is available");
        }
        ServiceStatus::NeedsReinstall => {
            bail!("service needs reinstall; explicit authorization is required");
        }
        ServiceStatus::Unavailable(reason) => {
            logging!(info, Type::Service, "服务不可用: {}，将使用Sidecar模式", reason);
            bail!("服务不可用: {}", reason);
        }
        ServiceStatus::SidecarAllowed => {
            logging!(
                info,
                Type::Service,
                "Sidecar was explicitly allowed for this app session"
            );
        }
        ServiceStatus::InstallRequired
        | ServiceStatus::UninstallRequired
        | ServiceStatus::ReinstallRequired
        | ServiceStatus::ForceReinstallRequired => {
            bail!("a requested action should have been handled as a privileged operation")
        }
    }
    Ok(())
}

/// Releases the Run State operation slot before post-operation observers refresh.
pub(crate) async fn run_operation_and_then<E, Post, PostFuture>(
    store: &RunStateStore<E>,
    operation: impl Future<Output = Result<()>>,
    post_operation: Post,
) -> Result<()>
where
    E: RunStateEnv,
    Post: FnOnce() -> PostFuture,
    PostFuture: Future<Output = Result<()>>,
{
    let result = {
        let _operation = store.begin_operation()?;
        operation.await
    };
    result?;
    post_operation().await
}

/// Maps a legacy status to its requested action without racing a store reread.
pub(crate) const fn requested_action(status: &ServiceStatus) -> Option<PendingAction> {
    match status {
        ServiceStatus::InstallRequired => Some(PendingAction::Install),
        ServiceStatus::UninstallRequired => Some(PendingAction::Uninstall),
        ServiceStatus::ReinstallRequired => Some(PendingAction::Reinstall),
        ServiceStatus::ForceReinstallRequired => Some(PendingAction::ForceReinstall),
        ServiceStatus::Checking
        | ServiceStatus::Ready
        | ServiceStatus::NotInstalled
        | ServiceStatus::NeedsReinstall
        | ServiceStatus::SidecarAllowed
        | ServiceStatus::Unavailable(_) => None,
    }
}

pub(crate) fn record_status<E: RunStateEnv>(store: &RunStateStore<E>, status: ServiceStatus) {
    if let Some(action) = requested_action(&status) {
        store.request_action(action);
        return;
    }

    match status {
        ServiceStatus::SidecarAllowed => store.accept_sidecar(),
        ServiceStatus::Checking => store.observe(ServiceHealth::Unknown),
        ServiceStatus::Ready => store.observe(ServiceHealth::Ready),
        ServiceStatus::NotInstalled => store.observe(ServiceHealth::NotInstalled),
        ServiceStatus::NeedsReinstall => store.observe(ServiceHealth::VersionMismatch),
        ServiceStatus::Unavailable(reason) => store.observe(ServiceHealth::Unavailable(reason)),
        ServiceStatus::InstallRequired
        | ServiceStatus::UninstallRequired
        | ServiceStatus::ReinstallRequired
        | ServiceStatus::ForceReinstallRequired => {
            // Recorded by the early return above; listed so a new variant still fails to
            // compile here rather than falling through a catch-all.
        }
    }
}

pub static SERVICE_MANAGER: ServiceManager = ServiceManager;
