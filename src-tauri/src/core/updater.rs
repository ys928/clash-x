use crate::{
    config::MixedPort,
    core::{CoreManager, manager::RunningMode},
    singleton,
    utils::dirs,
};
use anyhow::Result;
use clash_verge_logging::{Type, logging};
use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use tauri::Url;
use tauri_plugin_updater::{Updater, UpdaterExt as _};

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

    /// Local Clash mixed-port URL when the core is running; otherwise `None`.
    pub async fn clash_proxy_url() -> Option<Url> {
        if matches!(*CoreManager::global().get_running_mode(), RunningMode::NotRunning) {
            return None;
        }

        let port = MixedPort::desired().await;
        if port == 0 {
            return None;
        }

        Url::parse(&format!("http://127.0.0.1:{port}")).ok()
    }

    fn build_updater(app_handle: &tauri::AppHandle, proxy: Option<&Url>) -> Result<Updater> {
        let builder = app_handle.updater_builder();
        let builder = match proxy {
            Some(proxy) => builder.proxy(proxy.clone()),
            None => builder,
        };
        Ok(builder.build()?)
    }

    async fn check_with_proxy(
        app_handle: &tauri::AppHandle,
        proxy: Option<&Url>,
    ) -> Result<Option<tauri_plugin_updater::Update>> {
        let updater = Self::build_updater(app_handle, proxy)?;
        Ok(updater.check().await?)
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

        let clash_proxy = Self::clash_proxy_url().await;
        // Prefer Clash when available (GitHub is often unreachable without it),
        // then fall back to a direct request.
        let attempts: [Option<&Url>; 2] = [clash_proxy.as_ref(), None];
        let mut last_error: Option<anyhow::Error> = None;

        for (index, proxy) in attempts.into_iter().enumerate() {
            // Skip duplicate direct attempt when Clash proxy was unavailable.
            if index == 1 && clash_proxy.is_none() {
                break;
            }

            if let Some(proxy) = proxy {
                logging!(info, Type::System, "Update check: using Clash proxy {proxy}");
            } else if clash_proxy.is_some() {
                logging!(info, Type::System, "Update check: Clash proxy failed, retrying direct");
            }

            match Self::check_with_proxy(app_handle, proxy).await {
                Ok(Some(update)) => {
                    let version = update.version.clone();
                    let body = update.body.clone();
                    logging!(info, Type::System, "Update check: update available v{version}");
                    self.set_status(UpdateStatus::available(version, body));
                    return Ok(());
                }
                Ok(None) => {
                    logging!(info, Type::System, "Update check: no update available");
                    self.set_status(UpdateStatus::none());
                    return Ok(());
                }
                Err(e) => {
                    logging!(warn, Type::System, "Update check failed: {e}");
                    last_error = Some(e);
                }
            }
        }

        Err(last_error.unwrap_or_else(|| anyhow::anyhow!("Update check failed")))
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
