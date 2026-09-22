pub(crate) use crate::utils::dirs;
pub(crate) use crate::{
    config::{Config, runtime::IRuntime},
    constants,
    core::{
        CoreManager,
        handle::Handle,
        manager::RunningMode,
        owner_identity::current_owner_credentials,
        proxy_control,
        runstate::{
            OwnerRecoveryReason, OwnerSample, OwnerStep, OwnerWatch, PendingAction, RUN_STATE, ReadyWaitError,
            RunState, RunStateEnv, RunStateStore, ServiceHealth,
        },
        runtime_bundle::{RemoteProviderRef, collect_runtime_bundle, remote_providers_of},
        tray::Tray,
    },
    process::AsyncHandler,
};
pub(crate) use anyhow::{Context as _, Result, anyhow, bail};
pub(crate) use clash_verge_draft::Draft;
pub(crate) use clash_verge_logging::{Type, logging};
pub(crate) use clash_verge_service_ipc::{
    MacosProxyConfig, OwnerCredentials, OwnerSessionProof, ProtocolInfo, ProxyApplyOutcome, RuntimeBundle,
    RuntimeFileOutcome, RuntimeFileRequest, ServiceErrorCode, StageRuntimeOutcome, StartClashRequest, WriterConfig,
};
pub(crate) use once_cell::sync::Lazy;
pub(crate) use parking_lot::Mutex;
pub(crate) use std::{
    collections::HashMap,
    env::current_exe,
    future::Future,
    path::{Path, PathBuf},
    process::Command as StdCommand,
    sync::atomic::{AtomicBool, AtomicU64, Ordering},
    time::{Duration, SystemTime, UNIX_EPOCH},
};

pub(crate) static OWNER_MONITOR_GENERATION: AtomicU64 = AtomicU64::new(0);
pub(crate) static ACTIVE_SERVICE_SESSION: Lazy<Mutex<Option<ActiveServiceSession>>> = Lazy::new(|| Mutex::new(None));

/// Capabilities of the service session that owns the running Core.
/// They are discarded with that session rather than cached across service upgrades.
#[derive(Clone)]
pub(crate) struct ActiveServiceSession {
    pub(crate) proof: OwnerSessionProof,
    pub(crate) supports_runtime_staging: bool,
    pub(crate) supports_runtime_file_read: bool,
}

pub(crate) fn generate_service_session_token() -> Result<String> {
    let mut bytes = [0_u8; 32];
    getrandom::fill(&mut bytes).context("failed to generate service owner session")?;
    Ok(bytes.iter().map(|byte| format!("{byte:02x}")).collect())
}

pub(crate) fn active_service_session() -> Result<OwnerSessionProof> {
    ACTIVE_SERVICE_SESSION
        .lock()
        .as_ref()
        .map(|session| session.proof.clone())
        .context("service owner session is not active")
}

/// Returns false unless the active service session explicitly supports in-place staging.
pub(crate) fn active_service_supports_runtime_staging() -> bool {
    ACTIVE_SERVICE_SESSION
        .lock()
        .as_ref()
        .is_some_and(|session| session.supports_runtime_staging)
}

pub(crate) fn active_service_supports_runtime_file_read() -> bool {
    ACTIVE_SERVICE_SESSION
        .lock()
        .as_ref()
        .is_some_and(|session| session.supports_runtime_file_read)
}

pub(crate) fn clear_active_service_session() {
    ACTIVE_SERVICE_SESSION.lock().take();
}

#[derive(Clone, Copy, Default)]
pub(crate) struct ServiceCapabilities {
    pub(crate) runtime_staging: bool,
    pub(crate) runtime_file_read: bool,
}

impl ServiceCapabilities {
    const fn of(info: &ProtocolInfo) -> Self {
        Self {
            runtime_staging: info.supports_runtime_staging(),
            runtime_file_read: info.supports_runtime_file_read(),
        }
    }
}

/// Failed capability probes must not block startup.
#[tracing::instrument(skip_all, level = "info", fields(supported = tracing::field::Empty))]
pub(crate) async fn probe_service_capabilities() -> ServiceCapabilities {
    match clash_verge_service_ipc::get_version().await {
        Ok(response) if response.code == 0 => {
            let capabilities = response
                .data
                .as_ref()
                .map_or_else(ServiceCapabilities::default, ServiceCapabilities::of);
            tracing::Span::current().record("supported", capabilities.runtime_staging);
            capabilities
        }
        Ok(response) => {
            tracing::Span::current().record("supported", false);
            logging!(
                warn,
                Type::Service,
                "服务协议查询返回 {}: {}；配置变更将走重启路径",
                response.code,
                response.message
            );
            ServiceCapabilities::default()
        }
        Err(error) => {
            tracing::Span::current().record("supported", false);
            logging!(
                warn,
                Type::Service,
                "无法查询服务协议版本: {error:#}；配置变更将走重启路径"
            );
            ServiceCapabilities::default()
        }
    }
}

pub(crate) fn session_matches_status(
    proof: &OwnerSessionProof,
    is_active: bool,
    active_generation: Option<u64>,
) -> bool {
    is_active && active_generation == Some(proof.generation)
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ServiceStatus {
    Checking,
    Ready,
    NotInstalled,
    NeedsReinstall,
    InstallRequired,
    UninstallRequired,
    ReinstallRequired,
    ForceReinstallRequired,
    SidecarAllowed,
    Unavailable(String),
}

impl ServiceStatus {
    /// Flattens Run State using legacy precedence: action, Sidecar allowance, then health.
    pub(crate) fn from_run_state(state: &RunState) -> Self {
        if let Some(action) = state.pending {
            return match action {
                PendingAction::Install => Self::InstallRequired,
                PendingAction::Uninstall => Self::UninstallRequired,
                PendingAction::Reinstall => Self::ReinstallRequired,
                PendingAction::ForceReinstall => Self::ForceReinstallRequired,
            };
        }
        if state.sidecar_allowed {
            return Self::SidecarAllowed;
        }
        match &state.health {
            ServiceHealth::Unknown => Self::Checking,
            ServiceHealth::Ready => Self::Ready,
            ServiceHealth::NotInstalled => Self::NotInstalled,
            ServiceHealth::VersionMismatch => Self::NeedsReinstall,
            ServiceHealth::Unavailable(reason) => Self::Unavailable(reason.clone()),
        }
    }
}

#[cfg(target_os = "macos")]
pub(crate) fn path_entry_exists_without_follow(path: &Path) -> std::io::Result<bool> {
    match std::fs::symlink_metadata(path) {
        Ok(_) => Ok(true),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(error) => Err(error),
    }
}

#[cfg(target_os = "macos")]
pub(crate) fn macos_service_install_markers() -> Vec<String> {
    vec![
        format!(
            "/Library/LaunchDaemons/{}.plist",
            clash_verge_service_ipc::MACOS_SERVICE_ID
        ),
        format!(
            "/Library/PrivilegedHelperTools/{}.bundle",
            clash_verge_service_ipc::MACOS_SERVICE_ID
        ),
        #[cfg(not(feature = "verge-dev"))]
        "/Library/LaunchDaemons/io.github.clashverge.helper.plist".to_owned(),
        #[cfg(not(feature = "verge-dev"))]
        "/Library/PrivilegedHelperTools/io.github.clashverge.helper".to_owned(),
    ]
}

#[cfg(target_os = "macos")]
pub(crate) fn macos_service_install_marker_exists() -> std::io::Result<bool> {
    for marker in macos_service_install_markers() {
        if path_entry_exists_without_follow(Path::new(&marker))? {
            return Ok(true);
        }
    }
    Ok(false)
}

#[cfg(windows)]
pub(crate) fn trusted_service_evidence() -> Result<bool> {
    use windows_service::{
        Error as WindowsServiceError,
        service::ServiceAccess,
        service_manager::{ServiceManager as WindowsServiceManager, ServiceManagerAccess},
    };

    const ERROR_SERVICE_DOES_NOT_EXIST: i32 = 1060;
    let manager = WindowsServiceManager::local_computer(None::<&str>, ServiceManagerAccess::CONNECT)?;
    match manager.open_service(
        clash_verge_service_ipc::WINDOWS_SERVICE_NAME,
        ServiceAccess::QUERY_STATUS,
    ) {
        Ok(service) => {
            drop(service);
            Ok(true)
        }
        Err(WindowsServiceError::Winapi(error)) if error.raw_os_error() == Some(ERROR_SERVICE_DOES_NOT_EXIST) => {
            Ok(false)
        }
        Err(error) => Err(error).context("failed to inspect Windows service registration"),
    }
}

#[cfg(target_os = "linux")]
pub(crate) fn trusted_service_evidence() -> Result<bool> {
    let unit = format!("{}.service", clash_verge_service_ipc::SERVICE_SLUG);
    let output = StdCommand::new("systemctl")
        .args(["show", "--property=LoadState", "--value", &unit])
        .output()
        .context("failed to inspect systemd service registration")?;
    if !output.status.success() {
        bail!(
            "systemd service registration probe failed with status {}",
            output.status
        );
    }
    Ok(String::from_utf8_lossy(&output.stdout).trim() != "not-found")
}

#[cfg(target_os = "macos")]
pub(crate) fn trusted_service_evidence() -> Result<bool> {
    macos_service_install_marker_exists().context("failed to inspect launchd service registration")
}
