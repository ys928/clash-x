use crate::{singleton, utils::dirs};
use anyhow::Result;
use clash_verge_logging::{Type, logging};
use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use tauri_plugin_updater::UpdaterExt as _;

/// Frontend-facing update badge / dialog metadata (detection only, no download).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct UpdateStatus {
    pub available: bool,
    pub version: Option<String>,
    pub body: Option<String>,
}

impl UpdateStatus {
    pub const fn none() -> Self {
        Self {
            available: false,
            version: None,
            body: None,
        }
    }

    fn available(version: impl Into<String>, body: Option<String>) -> Self {
        Self {
            available: true,
            version: Some(version.into()),
            body,
        }
    }
}

/// Background update checker that keeps running even when the main window is destroyed.
pub struct UpdateChecker {
    status: RwLock<UpdateStatus>,
}

singleton!(UpdateChecker, UPDATE_CHECKER);

impl UpdateChecker {
    const fn new() -> Self {
        Self {
            status: RwLock::new(UpdateStatus::none()),
        }
    }

    pub fn status(&self) -> UpdateStatus {
        self.status.read().clone()
    }

    fn set_status(&self, status: UpdateStatus) {
        *self.status.write() = status.clone();
        Self::notify_frontend(&status);
    }

    fn notify_frontend(status: &UpdateStatus) {
        super::handle::Handle::notify_update_status(status);
    }

    async fn check_once(&self, app_handle: &tauri::AppHandle) -> Result<()> {
        let is_portable = *dirs::PORTABLE_FLAG.get().unwrap_or(&false);
        if is_portable {
            logging!(debug, Type::System, "Update check skipped: portable build");
            return Ok(());
        }

        let current_version = env!("CARGO_PKG_VERSION");
        logging!(
            info,
            Type::System,
            "Update check: checking for updates (local=v{current_version})"
        );

        let updater = app_handle.updater()?;
        let update = match updater.check().await {
            Ok(Some(update)) => update,
            Ok(None) => {
                logging!(info, Type::System, "Update check: no update available");
                self.set_status(UpdateStatus::none());
                return Ok(());
            }
            Err(e) => {
                logging!(warn, Type::System, "Update check failed: {e}");
                return Err(e.into());
            }
        };

        let version = update.version.clone();
        let body = update.body.clone();
        logging!(info, Type::System, "Update check: update available v{version}");
        self.set_status(UpdateStatus::available(version, body));
        Ok(())
    }

    /// Start shortly after launch, then check once every hour.
    pub async fn start_background_check(&self, app_handle: tauri::AppHandle) {
        logging!(info, Type::System, "Update checker: background task started");

        tokio::time::sleep(std::time::Duration::from_secs(8)).await;

        // Re-emit any existing status in case the UI subscribed late.
        {
            let status = self.status();
            if status.available {
                Self::notify_frontend(&status);
            }
        }

        loop {
            if let Err(e) = self.check_once(&app_handle).await {
                logging!(warn, Type::System, "Update checker cycle error: {e}");
            }

            tokio::time::sleep(std::time::Duration::from_secs(60 * 60)).await;
        }
    }
}
