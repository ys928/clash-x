use super::{CmdResult, StringifyErr as _};
use crate::core::{SilentUpdater, UpdateStatus};
use crate::feat;

/// Current silent-updater badge state for the titlebar.
#[tauri::command]
pub fn get_update_status() -> UpdateStatus {
    SilentUpdater::global().status()
}

/// Install a package that was already downloaded by the silent updater.
#[tauri::command]
pub async fn install_downloaded_update() -> CmdResult<()> {
    let app_handle = crate::core::handle::Handle::app_handle();
    let installed = SilentUpdater::global()
        .install_pending(app_handle)
        .await
        .stringify_err()?;

    if installed {
        feat::restart_app().await;
    }

    Ok(())
}
