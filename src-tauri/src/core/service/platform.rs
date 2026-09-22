use super::*;

#[cfg(target_os = "windows")]
pub(crate) fn uninstall_service() -> Result<()> {
    logging!(info, Type::Service, "uninstall service");

    use deelevate::{PrivilegeLevel, Token};
    use runas::Command as RunasCommand;
    use std::os::windows::process::CommandExt as _;

    let uninstall_path = packaged_service_tool_path("clash-verge-service-uninstall.exe", || {
        Ok(dirs::service_path()?.with_file_name("clash-verge-service-uninstall.exe"))
    })?;

    if !uninstall_path.exists() {
        bail!(format!("uninstaller not found: {uninstall_path:?}"));
    }

    let token = Token::with_current_process()?;
    let level = token.privilege_level()?;
    let status = match level {
        PrivilegeLevel::NotPrivileged => RunasCommand::new(uninstall_path).show(false).status()?,
        _ => StdCommand::new(uninstall_path).creation_flags(0x08000000).status()?,
    };

    if !status.success() {
        bail!(
            "failed to uninstall service with status {}",
            status.code().unwrap_or(-1)
        );
    }

    Ok(())
}

#[cfg(target_os = "linux")]
pub(crate) fn uninstall_service() -> Result<()> {
    logging!(info, Type::Service, "uninstall service");

    let uninstall_path = packaged_service_tool_path("clash-verge-service-uninstall", || {
        Ok(tauri::utils::platform::current_exe()?.with_file_name("clash-verge-service-uninstall"))
    })?;

    if !uninstall_path.exists() {
        bail!(format!("uninstaller not found: {uninstall_path:?}"));
    }

    let elevator = crate::utils::help::linux_elevator();
    let status = if linux_running_as_root() {
        StdCommand::new(&uninstall_path).status()?
    } else {
        let result = StdCommand::new(&elevator)
            .arg("--disable-internal-agent")
            .arg(&uninstall_path)
            .status()?;

        // 如果 pkexec 执行失败，回退到 sudo
        if !result.success() && elevator.contains("pkexec") {
            logging!(
                warn,
                Type::Service,
                "pkexec failed with code {}, falling back to sudo",
                result.code().unwrap_or(-1)
            );
            StdCommand::new("sudo").arg(&uninstall_path).status()?
        } else {
            result
        }
    };

    if !status.success() {
        bail!(
            "failed to uninstall service with status {}",
            status.code().unwrap_or(-1)
        );
    }

    Ok(())
}

#[cfg(target_os = "linux")]
pub(crate) fn linux_running_as_root() -> bool {
    use crate::core::handle;
    use tauri_plugin_clash_verge_sysinfo::is_current_app_handle_admin;
    let app_handle = handle::Handle::app_handle();
    is_current_app_handle_admin(app_handle)
}

#[cfg(target_os = "macos")]
pub(crate) fn uninstall_service() -> Result<()> {
    logging!(info, Type::Service, "uninstall service");

    let uninstall_path = packaged_service_tool_path("clash-verge-service-uninstall", || {
        Ok(dirs::service_path()?.with_file_name("clash-verge-service-uninstall"))
    })?;

    if !uninstall_path.exists() {
        bail!(format!("uninstaller not found: {uninstall_path:?}"));
    }

    let uninstall_path = macos_service_tool_path(&uninstall_path)?;
    let uninstall_shell: String = uninstall_path.to_string_lossy().into_owned();

    let prompt = clash_verge_i18n::t!("service.adminUninstallPrompt");
    // 先清理服务残留,再执行卸载器。
    let uninstall_quoted = shell_single_quote(&uninstall_shell);
    let shell = format!("cd /; {}; {uninstall_quoted}", macos_force_stop_core_shell());
    let shell = escape_osascript_double_quoted_string(&shell);
    let command = format!(r#"do shell script "{shell}" with administrator privileges with prompt "{prompt}""#);

    let status = StdCommand::new("osascript").args(vec!["-e", &command]).status()?;

    if !status.success() {
        bail!(
            "failed to uninstall service with status {}",
            status.code().unwrap_or(-1)
        );
    }

    Ok(())
}

pub(crate) fn install_service() -> Result<()> {
    logging!(info, Type::Service, "install service");
    let executable = std::env::current_exe()?;
    let cores = crate::config::IVerge::VALID_CLASH_CORES
        .iter()
        .map(|core| {
            let name = format!("{core}{}", std::env::consts::EXE_SUFFIX);
            clash_verge_service_ipc::management::CoreSource {
                path: executable.with_file_name(&name),
                name,
            }
        })
        .collect::<Vec<_>>();
    invoke_service_install(&cores, false)
}

fn invoke_service_install(cores: &[clash_verge_service_ipc::management::CoreSource], core_only: bool) -> Result<()> {
    let name = format!("clash-verge-service-install{}", std::env::consts::EXE_SUFFIX);
    let installer = packaged_service_tool_path(&name, || {
        #[cfg(target_os = "linux")]
        let executable = tauri::utils::platform::current_exe()?;
        #[cfg(not(target_os = "linux"))]
        let executable = dirs::service_path()?;
        Ok(executable.with_file_name(&name))
    })?;
    #[cfg(unix)]
    let gid = Some(tauri_plugin_clash_verge_sysinfo::current_gid());
    #[cfg(windows)]
    let gid = None;
    clash_verge_service_ipc::management::install(
        &installer,
        cores,
        core_only,
        gid,
        &clash_verge_i18n::t!("service.adminInstallPrompt"),
    )
}

pub(crate) fn reinstall_service() -> Result<()> {
    logging!(info, Type::Service, "reinstall service");
    // The installer replaces an existing registration and its cores in one elevation.
    install_service()
}

/// 强制重装服务（UI修复按钮）
pub(crate) fn force_reinstall_service() -> Result<()> {
    logging!(info, Type::Service, "用户请求强制重装服务");
    install_service().map_err(|err| {
        logging!(error, Type::Service, "强制重装服务失败: {}", err);
        err
    })
}

/// Publishes a core into the Service's approved directory through the elevated installer.
///
/// The Service only executes administrator-approved copies from its own directory, never the file
/// beside the app, so a freshly replaced core has to be handed over before a service-mode restart
/// asks for it.
pub fn stage_approved_core(core_path: &Path) -> Result<()> {
    tokio::task::block_in_place(|| {
        invoke_service_install(
            &[clash_verge_service_ipc::management::CoreSource {
                name: core_path
                    .file_name()
                    .context("core has no filename")?
                    .to_string_lossy()
                    .into_owned(),
                path: core_path.to_path_buf(),
            }],
            true,
        )
    })
}

/// Dispatches a privileged platform operation on a blocking thread.
pub(crate) fn run_privileged_service_action(action: PendingAction) -> Result<()> {
    let (operation, label): (fn() -> Result<()>, &'static str) = match action {
        PendingAction::Install => (install_service, "install service"),
        PendingAction::Uninstall => (uninstall_service, "uninstall service"),
        PendingAction::Reinstall => (reinstall_service, "reinstall service"),
        PendingAction::ForceReinstall => (force_reinstall_service, "force reinstall service"),
    };
    tokio::task::block_in_place(operation).with_context(|| format!("{label} failed"))
}
