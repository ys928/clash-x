use crate::core::UpdateStatus;

/// Current update-detection badge state for the titlebar / dialog.
#[tauri::command]
pub fn get_update_status() -> UpdateStatus {
    crate::core::UpdateChecker::global().status()
}
