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

#[cfg(target_os = "windows")]
pub(crate) fn install_service() -> Result<()> {
    use std::process::Output;
    logging!(info, Type::Service, "install service");

    use deelevate::{PrivilegeLevel, Token};
    use runas::Command as RunasCommand;
    use std::os::windows::process::CommandExt as _;

    let install_path = packaged_service_tool_path("clash-verge-service-install.exe", || {
        Ok(dirs::service_path()?.with_file_name("clash-verge-service-install.exe"))
    })?;

    if !install_path.exists() {
        bail!(format!("installer not found: {install_path:?}"));
    }

    let token = Token::with_current_process()?;
    let level = token.privilege_level()?;
    let output = match level {
        PrivilegeLevel::NotPrivileged => {
            let status = RunasCommand::new(&install_path).show(false).status()?;
            Output {
                status,
                stdout: Vec::new(),
                stderr: Vec::new(),
            }
        }
        _ => {
            // StdCommand returns Output directly
            StdCommand::new(&install_path).creation_flags(0x08000000).output()?
        }
    };

    if let Some((code, err)) = check_output_error(&output) {
        logging!(
            error,
            Type::Service,
            "failed to install service code: {}, details: {}",
            code,
            err
        );
        bail!("failed to install service code: {}, details: {}", code, err);
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
    logging!(
        info,
        Type::Service,
        "uninstall status code:{}",
        status.code().unwrap_or(-1)
    );

    if !status.success() {
        bail!(
            "failed to uninstall service with status {}",
            status.code().unwrap_or(-1)
        );
    }

    Ok(())
}

#[cfg(target_os = "linux")]
pub(crate) fn install_service() -> Result<()> {
    logging!(info, Type::Service, "install service");

    let install_path = packaged_service_tool_path("clash-verge-service-install", || {
        Ok(tauri::utils::platform::current_exe()?.with_file_name("clash-verge-service-install"))
    })?;

    if !install_path.exists() {
        bail!(format!("installer not found: {install_path:?}"));
    }

    let elevator = crate::utils::help::linux_elevator();
    let output = if linux_running_as_root() {
        StdCommand::new(&install_path).output()?
    } else {
        let result = StdCommand::new(&elevator)
            .arg("--disable-internal-agent")
            .arg(&install_path)
            .output()?;

        // 如果 pkexec 执行失败，回退到 sudo
        if !result.status.success() && elevator.contains("pkexec") {
            logging!(
                warn,
                Type::Service,
                "pkexec failed with code {}, falling back to sudo",
                result.status.code().unwrap_or(-1)
            );
            StdCommand::new("sudo").arg(&install_path).output()?
        } else {
            result
        }
    };

    if let Some((code, err)) = check_output_error(&output) {
        logging!(
            error,
            Type::Service,
            "failed to install service code: {}, details: {}",
            code,
            err
        );
        bail!("failed to install service code: {}, details: {}", code, err);
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

    // clash_verge_i18n::sync_locale(Config::verge().await.latest_arc().language.as_deref());

    let prompt = clash_verge_i18n::t!("service.adminUninstallPrompt");
    // 先清理服务残留,再执行卸载器。
    let uninstall_quoted = shell_single_quote(&uninstall_shell);
    let shell = format!("cd /; {}; {uninstall_quoted}", macos_force_stop_core_shell());
    let shell = escape_osascript_double_quoted_string(&shell);
    let command = format!(r#"do shell script "{shell}" with administrator privileges with prompt "{prompt}""#);

    // logging!(debug, Type::Service, "uninstall command: {}", command);

    let status = StdCommand::new("osascript").args(vec!["-e", &command]).status()?;

    if !status.success() {
        bail!(
            "failed to uninstall service with status {}",
            status.code().unwrap_or(-1)
        );
    }

    Ok(())
}

#[cfg(target_os = "macos")]
pub(crate) fn install_service() -> Result<()> {
    logging!(info, Type::Service, "install service");

    let binary_path = packaged_service_tool_path("clash-verge-service", dirs::service_path)?;
    let install_path = packaged_service_tool_path("clash-verge-service-install", || {
        Ok(dirs::service_path()?.with_file_name("clash-verge-service-install"))
    })?;

    if !install_path.exists() {
        bail!(format!("installer not found: {install_path:?}"));
    }

    macos_service_tool_path(&binary_path)?;
    let install_path = macos_service_tool_path(&install_path)?;

    // clash_verge_i18n::sync_locale(Config::verge().await.latest_arc().language.as_deref());

    let gid = tauri_plugin_clash_verge_sysinfo::current_gid();
    let prompt = clash_verge_i18n::t!("service.adminInstallPrompt");
    let shell = macos_install_shell(&install_path, gid);
    let shell = escape_osascript_double_quoted_string(&shell);
    let command = format!(r#"do shell script "{shell}" with administrator privileges with prompt "{prompt}""#);

    let output = StdCommand::new("osascript").args(vec!["-e", &command]).output()?;
    if let Some((code, err)) = check_output_error(&output) {
        logging!(
            error,
            Type::Service,
            "failed to install service code: {}, details: {}",
            code,
            err
        );
        bail!("failed to install service code: {}, details: {}", code, err);
    }

    Ok(())
}

pub(crate) fn check_output_error(output: &std::process::Output) -> Option<(i32, Cow<'_, str>)> {
    if output.status.success() {
        return None;
    }
    let code = output.status.code().unwrap_or(-1);
    let stderr = String::from_utf8_lossy(&output.stderr);
    if !stderr.is_empty() {
        return Some((code, stderr));
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    if !stdout.is_empty() {
        return Some((code, stdout));
    }
    Some((code, Cow::Borrowed("Unknown error")))
}

pub(crate) fn reinstall_service() -> Result<()> {
    logging!(info, Type::Service, "reinstall service");
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
/// asks for it. The digest pins the exact bytes being attested: it rides the elevated process's
/// command line, which no other local account can alter, so a file swapped on disk after this
/// hash was computed is refused by the installer instead of published.
pub fn stage_approved_core(core_path: &Path) -> Result<()> {
    tokio::task::block_in_place(|| {
        let digest = sha256_hex(core_path)?;
        run_core_install(core_path, &digest)
    })
}

pub(crate) fn sha256_hex(path: &Path) -> Result<String> {
    use sha2::{Digest as _, Sha256};
    use std::io::Read as _;

    let mut file = std::fs::File::open(path).with_context(|| format!("failed to open {path:?} for hashing"))?;
    let mut hasher = Sha256::new();
    let mut buffer = vec![0_u8; 64 * 1024].into_boxed_slice();
    loop {
        let read = file
            .read(&mut buffer)
            .with_context(|| format!("failed to read {path:?}"))?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(hasher.finalize().iter().map(|byte| format!("{byte:02x}")).collect())
}

#[cfg(target_os = "windows")]
pub(crate) fn run_core_install(core_path: &Path, sha256_hex: &str) -> Result<()> {
    use deelevate::{PrivilegeLevel, Token};
    use runas::Command as RunasCommand;
    use std::os::windows::process::CommandExt as _;
    use std::process::Output;

    let install_path = packaged_service_tool_path("clash-verge-service-install.exe", || {
        Ok(dirs::service_path()?.with_file_name("clash-verge-service-install.exe"))
    })?;
    if !install_path.exists() {
        bail!(format!("installer not found: {install_path:?}"));
    }

    let token = Token::with_current_process()?;
    let output = match token.privilege_level()? {
        PrivilegeLevel::NotPrivileged => {
            let status = RunasCommand::new(&install_path)
                .arg("--install-core")
                .arg(core_path)
                .arg("--sha256")
                .arg(sha256_hex)
                .show(false)
                .status()?;
            Output {
                status,
                stdout: Vec::new(),
                stderr: Vec::new(),
            }
        }
        _ => StdCommand::new(&install_path)
            .creation_flags(0x08000000)
            .arg("--install-core")
            .arg(core_path)
            .arg("--sha256")
            .arg(sha256_hex)
            .output()?,
    };

    if let Some((code, err)) = check_output_error(&output) {
        bail!("failed to stage the core for the service, code {code}: {err}");
    }
    Ok(())
}

#[cfg(target_os = "linux")]
pub(crate) fn run_core_install(core_path: &Path, sha256_hex: &str) -> Result<()> {
    let install_path = packaged_service_tool_path("clash-verge-service-install", || {
        Ok(tauri::utils::platform::current_exe()?.with_file_name("clash-verge-service-install"))
    })?;
    if !install_path.exists() {
        bail!(format!("installer not found: {install_path:?}"));
    }

    let core_argument = core_path.as_os_str();
    let output = if linux_running_as_root() {
        StdCommand::new(&install_path)
            .arg("--install-core")
            .arg(core_argument)
            .arg("--sha256")
            .arg(sha256_hex)
            .output()?
    } else {
        let elevator = crate::utils::help::linux_elevator();
        let mut elevated = StdCommand::new(&elevator);
        // pkexec-only option; other elevators such as sudo reject unknown flags outright.
        if elevator.contains("pkexec") {
            elevated.arg("--disable-internal-agent");
        }
        let result = elevated
            .arg(&install_path)
            .arg("--install-core")
            .arg(core_argument)
            .arg("--sha256")
            .arg(sha256_hex)
            .output()?;
        if !result.status.success() && elevator.contains("pkexec") {
            logging!(
                warn,
                Type::Service,
                "pkexec failed with code {}, falling back to sudo",
                result.status.code().unwrap_or(-1)
            );
            StdCommand::new("sudo")
                .arg(&install_path)
                .arg("--install-core")
                .arg(core_argument)
                .arg("--sha256")
                .arg(sha256_hex)
                .output()?
        } else {
            result
        }
    };

    if let Some((code, err)) = check_output_error(&output) {
        bail!("failed to stage the core for the service, code {code}: {err}");
    }
    Ok(())
}

#[cfg(target_os = "macos")]
pub(crate) fn run_core_install(core_path: &Path, sha256_hex: &str) -> Result<()> {
    let install_path = packaged_service_tool_path("clash-verge-service-install", || {
        Ok(dirs::service_path()?.with_file_name("clash-verge-service-install"))
    })?;
    if !install_path.exists() {
        bail!(format!("installer not found: {install_path:?}"));
    }
    let install_path = macos_service_tool_path(&install_path)?;

    let prompt = clash_verge_i18n::t!("service.adminInstallPrompt");
    let shell = format!(
        "cd /; {} --install-core {} --sha256 {}",
        shell_single_quote(&install_path.to_string_lossy()),
        shell_single_quote(&core_path.to_string_lossy()),
        shell_single_quote(sha256_hex),
    );
    let shell = escape_osascript_double_quoted_string(&shell);
    let command = format!(r#"do shell script "{shell}" with administrator privileges with prompt "{prompt}""#);

    let output = StdCommand::new("osascript").args(["-e", &command]).output()?;
    if let Some((code, err)) = check_output_error(&output) {
        bail!("failed to stage the core for the service, code {code}: {err}");
    }
    Ok(())
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
