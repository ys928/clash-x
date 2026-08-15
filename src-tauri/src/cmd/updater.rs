use crate::core::UpdateStatus;

/// Current update-detection badge state for the titlebar / dialog.
#[tauri::command]
pub fn get_update_status() -> UpdateStatus {
    crate::core::UpdateChecker::global().status()
}

/// Local Clash mixed-port proxy URL for updater requests, when the core is running.
#[tauri::command]
pub async fn get_updater_clash_proxy() -> Option<String> {
    crate::core::UpdateChecker::clash_proxy_url()
        .await
        .map(|url| url.to_string())
}
