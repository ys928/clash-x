use super::*;

#[cfg(any(all(target_os = "macos", feature = "verge-dev"), test))]
pub(crate) static SERVICE_CORE_STAGING_GENERATION: AtomicU64 = AtomicU64::new(0);

#[cfg(any(all(target_os = "macos", feature = "verge-dev"), test))]
pub(crate) fn create_service_core_staging_file(
    directory: &Path,
    core_name: &std::ffi::OsStr,
) -> Result<(PathBuf, std::fs::File)> {
    for _ in 0..32 {
        let generation = SERVICE_CORE_STAGING_GENERATION.fetch_add(1, Ordering::Relaxed);
        let temporary_name = format!(
            ".{}.{}.{generation}.tmp",
            core_name.to_string_lossy(),
            std::process::id()
        );
        let temporary_path = directory.join(temporary_name);
        match std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary_path)
        {
            Ok(file) => return Ok((temporary_path, file)),
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {}
            Err(error) => {
                return Err(error).with_context(|| {
                    format!(
                        "failed to create temporary development Service core {}",
                        temporary_path.display()
                    )
                });
            }
        }
    }

    bail!(
        "failed to create a unique temporary development Service core in {}",
        directory.display()
    )
}

#[cfg(any(all(target_os = "macos", feature = "verge-dev"), test))]
pub(crate) fn service_core_path_for(source: &Path, home: Option<&Path>, stage_for_macos_dev: bool) -> Result<PathBuf> {
    service_core_path_for_with_publisher(
        source,
        home,
        stage_for_macos_dev,
        "service-core",
        |temporary_path, final_path| {
            std::fs::rename(temporary_path, final_path).with_context(|| {
                format!(
                    "failed to publish development Service core {} over {}",
                    temporary_path.display(),
                    final_path.display()
                )
            })
        },
    )
}

#[cfg(any(all(target_os = "macos", feature = "verge-dev"), all(test, unix)))]
pub(crate) fn service_tool_path_for(source: &Path, home: Option<&Path>, stage_for_macos_dev: bool) -> Result<PathBuf> {
    service_core_path_for_with_publisher(
        source,
        home,
        stage_for_macos_dev,
        "service-tools",
        |temporary_path, final_path| {
            std::fs::rename(temporary_path, final_path).with_context(|| {
                format!(
                    "failed to publish development Service tool {} over {}",
                    temporary_path.display(),
                    final_path.display()
                )
            })
        },
    )
}

#[cfg(any(all(target_os = "macos", feature = "verge-dev"), test))]
#[cfg_attr(not(unix), allow(unreachable_code, unused_assignments, unused_variables))]
pub(crate) fn service_core_path_for_with_publisher<F>(
    source: &Path,
    home: Option<&Path>,
    stage_for_macos_dev: bool,
    staging_directory_name: &str,
    publisher: F,
) -> Result<PathBuf>
where
    F: FnOnce(&Path, &Path) -> Result<()>,
{
    if !stage_for_macos_dev {
        return Ok(source.to_path_buf());
    }

    let home = home
        .filter(|path| !path.as_os_str().is_empty())
        .context("HOME is unavailable for development Service core staging")?;
    let core_name = source
        .file_name()
        .filter(|name| !name.is_empty())
        .with_context(|| format!("development Service core source has no file name: {}", source.display()))?;
    let source_metadata = std::fs::symlink_metadata(source)
        .with_context(|| format!("failed to inspect development Service core source {}", source.display()))?;
    if !source_metadata.file_type().is_file() {
        bail!(
            "development Service core source is not an ordinary file: {}",
            source.display()
        );
    }
    let mut source_file = std::fs::File::open(source)
        .with_context(|| format!("failed to open development Service core source {}", source.display()))?;

    let staging_directory = home
        .join("Applications/.clash-verge-rev-dev")
        .join(staging_directory_name);
    std::fs::create_dir_all(&staging_directory).with_context(|| {
        format!(
            "failed to create development Service core staging directory {}",
            staging_directory.display()
        )
    })?;
    let final_path = staging_directory.join(core_name);
    let (temporary_path, mut temporary_file) = create_service_core_staging_file(&staging_directory, core_name)?;

    let publish_result = (|| -> Result<()> {
        std::io::copy(&mut source_file, &mut temporary_file).with_context(|| {
            format!(
                "failed to copy development Service core from {} to {}",
                source.display(),
                temporary_path.display()
            )
        })?;

        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt as _;

            let mut permissions = temporary_file
                .metadata()
                .with_context(|| format!("failed to inspect temporary Service core {}", temporary_path.display()))?
                .permissions();
            permissions.set_mode(0o755);
            temporary_file.set_permissions(permissions).with_context(|| {
                format!(
                    "failed to set executable permissions on temporary Service core {}",
                    temporary_path.display()
                )
            })?;
        }
        #[cfg(not(unix))]
        bail!("development Service core staging requires Unix executable permissions");

        temporary_file
            .sync_all()
            .with_context(|| format!("failed to sync temporary Service core {}", temporary_path.display()))?;
        drop(temporary_file);
        publisher(&temporary_path, &final_path)?;
        Ok(())
    })();

    if let Err(error) = publish_result {
        match std::fs::remove_file(&temporary_path) {
            Ok(()) => return Err(error),
            Err(cleanup_error) if cleanup_error.kind() == std::io::ErrorKind::NotFound => {
                return Err(error);
            }
            Err(cleanup_error) => {
                return Err(error).with_context(|| {
                    format!(
                        "failed to clean temporary development Service core {}: {cleanup_error}",
                        temporary_path.display()
                    )
                });
            }
        }
    }

    Ok(final_path)
}

#[cfg(target_os = "macos")]
#[cfg_attr(not(feature = "verge-dev"), allow(clippy::unnecessary_wraps))]
pub(crate) fn macos_service_tool_path(source: &Path) -> Result<PathBuf> {
    #[cfg(feature = "verge-dev")]
    {
        let home = std::env::var_os("HOME")
            .filter(|value| !value.is_empty())
            .map(PathBuf::from);
        service_tool_path_for(source, home.as_deref(), true)
    }

    #[cfg(not(feature = "verge-dev"))]
    Ok(source.to_path_buf())
}

pub(crate) fn service_core_path(clash_core: &str, bin_ext: &str) -> Result<PathBuf> {
    let sibling = current_exe()
        .map_err(|error| {
            anyhow::anyhow!(
                "failed to locate the current executable while resolving Service core {clash_core:?}: {error}"
            )
        })?
        .with_file_name(format!("{clash_core}{bin_ext}"));

    #[cfg(all(target_os = "macos", feature = "verge-dev"))]
    {
        let home = std::env::var_os("HOME")
            .filter(|value| !value.is_empty())
            .map(PathBuf::from);
        service_core_path_for(&sibling, home.as_deref(), true)
    }

    #[cfg(not(all(target_os = "macos", feature = "verge-dev")))]
    Ok(sibling)
}

/// 卸载服务前以 root 清理残留 core 和 IPC 套接字。
#[cfg(target_os = "macos")]
pub(crate) fn macos_force_stop_core_shell() -> String {
    use crate::config::IVerge;

    // 只清理 root 拥有的服务内核。
    let mut parts: Vec<String> = IVerge::VALID_CLASH_CORES
        .iter()
        .map(|core| format!("/usr/bin/pkill -U root -x {core} 2>/dev/null || true"))
        .collect();

    if let Ok(ipc) = dirs::ipc_path()
        && let Ok(ipc_str) = dirs::path_to_str(&ipc)
    {
        // 转义单引号,避免破坏 shell 参数。
        let escaped = ipc_str.replace('\'', r"'\''");
        parts.push(format!("/bin/rm -f '{escaped}' 2>/dev/null || true"));
    }

    parts.join("; ")
}

#[cfg(target_os = "macos")]
pub(crate) fn escape_osascript_double_quoted_string(value: &str) -> String {
    value.replace('\\', "\\\\").replace('"', "\\\"")
}

#[cfg(any(target_os = "macos", test))]
pub(crate) fn shell_single_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', r"'\''"))
}

#[cfg(any(target_os = "macos", test))]
pub(crate) fn macos_install_shell(install_path: &Path, gid: u32) -> String {
    let install_quoted = shell_single_quote(&install_path.to_string_lossy());
    format!("cd /; CLASH_VERGE_SERVICE_GID={gid} {install_quoted}")
}

pub(crate) fn packaged_service_tool_path(
    file_name: &str,
    packaged_path: impl FnOnce() -> Result<PathBuf>,
) -> Result<PathBuf> {
    #[cfg(feature = "verge-dev")]
    {
        drop(packaged_path);
        let directory = std::env::var_os("CLASH_VERGE_DEV_SERVICE_DIR")
            .context("CLASH_VERGE_DEV_SERVICE_DIR is missing from the development session")?;
        let directory = PathBuf::from(directory);
        if !directory.is_absolute() {
            bail!("CLASH_VERGE_DEV_SERVICE_DIR must be an absolute path");
        }
        Ok(directory.join(file_name))
    }

    #[cfg(not(feature = "verge-dev"))]
    {
        let _ = file_name;
        packaged_path()
    }
}
