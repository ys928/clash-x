use crate::{config::Config, singleton, utils::dirs};
use anyhow::{Result, bail};
use chrono::Utc;
use clash_verge_logging::{Type, logging};
use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri_plugin_updater::{Update, UpdaterExt as _};

/// Frontend-facing update badge state.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct UpdateStatus {
    pub available: bool,
    pub version: Option<String>,
    pub downloaded: bool,
}

impl UpdateStatus {
    pub const fn none() -> Self {
        Self {
            available: false,
            version: None,
            downloaded: false,
        }
    }

    fn available(version: impl Into<String>, downloaded: bool) -> Self {
        Self {
            available: true,
            version: Some(version.into()),
            downloaded,
        }
    }
}

pub struct SilentUpdater {
    status: RwLock<UpdateStatus>,
    pending_bytes: RwLock<Option<Vec<u8>>>,
    pending_update: RwLock<Option<Update>>,
}

singleton!(SilentUpdater, SILENT_UPDATER);

impl SilentUpdater {
    const fn new() -> Self {
        Self {
            status: RwLock::new(UpdateStatus::none()),
            pending_bytes: RwLock::new(None),
            pending_update: RwLock::new(None),
        }
    }

    pub fn status(&self) -> UpdateStatus {
        self.status.read().clone()
    }

    pub fn is_update_ready(&self) -> bool {
        let status = self.status.read();
        status.available && status.downloaded
    }

    fn set_status(&self, status: UpdateStatus) {
        *self.status.write() = status.clone();
        Self::notify_frontend(&status);
    }

    fn notify_frontend(status: &UpdateStatus) {
        super::handle::Handle::notify_update_status(status);
    }

    fn clear_pending(&self) {
        *self.pending_bytes.write() = None;
        *self.pending_update.write() = None;
        self.set_status(UpdateStatus::none());
    }
}

// ─── Disk Cache ───────────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize)]
struct UpdateCacheMeta {
    version: String,
    downloaded_at: String,
}

impl SilentUpdater {
    fn cache_dir() -> Result<PathBuf> {
        Ok(dirs::app_home_dir()?.join("update_cache"))
    }

    fn write_cache(bytes: &[u8], version: &str) -> Result<()> {
        let cache_dir = Self::cache_dir()?;
        std::fs::create_dir_all(&cache_dir)?;

        let bin_path = cache_dir.join("pending_update.bin");
        std::fs::write(&bin_path, bytes)?;

        let meta = UpdateCacheMeta {
            version: version.to_string(),
            downloaded_at: Utc::now().to_rfc3339(),
        };
        let meta_path = cache_dir.join("pending_update.json");
        std::fs::write(&meta_path, serde_json::to_string_pretty(&meta)?)?;

        logging!(
            info,
            Type::System,
            "Update cache written: version={}, size={} bytes",
            version,
            bytes.len()
        );
        Ok(())
    }

    fn read_cache_bytes() -> Result<Vec<u8>> {
        let bin_path = Self::cache_dir()?.join("pending_update.bin");
        Ok(std::fs::read(bin_path)?)
    }

    fn read_cache_meta() -> Result<UpdateCacheMeta> {
        let meta_path = Self::cache_dir()?.join("pending_update.json");
        let content = std::fs::read_to_string(meta_path)?;
        Ok(serde_json::from_str(&content)?)
    }

    fn delete_cache() {
        if let Ok(cache_dir) = Self::cache_dir()
            && cache_dir.exists()
        {
            if let Err(e) = std::fs::remove_dir_all(&cache_dir) {
                logging!(warn, Type::System, "Failed to delete update cache: {e}");
            } else {
                logging!(info, Type::System, "Update cache deleted");
            }
        }
    }
}

// ─── Version Comparison ───────────────────────────────────────────────────────

/// Returns true if version `a` <= version `b` using semver-like comparison.
/// Strips leading 'v', splits on '.', handles pre-release suffixes.
fn version_lte(a: &str, b: &str) -> bool {
    let parse = |v: &str| -> Vec<u64> {
        v.trim_start_matches('v')
            .split('.')
            .filter_map(|part| {
                let numeric = part.split('-').next().unwrap_or("0");
                numeric.parse::<u64>().ok()
            })
            .collect()
    };

    let a_parts = parse(a);
    let b_parts = parse(b);
    let len = a_parts.len().max(b_parts.len());

    for i in 0..len {
        let av = a_parts.get(i).copied().unwrap_or(0);
        let bv = b_parts.get(i).copied().unwrap_or(0);
        if av < bv {
            return true;
        }
        if av > bv {
            return false;
        }
    }
    true // equal
}

/// Map the app's resolved UI language code to an NSIS installer language ID.
///
/// The Windows installer only ships SimpChinese, English and Russian
/// (`tauri.windows.conf.json` `nsis.languages`). Languages without a matching
/// NSIS translation fall back to English; Traditional Chinese ("zhtw") is
/// mapped to SimpChinese so Chinese users don't get an English installer.
#[cfg(target_os = "windows")]
fn nsis_language_id(app_language: &str) -> &'static str {
    match app_language {
        "zh" | "zhtw" => "2052", // SimpChinese
        "ru" => "1049",          // Russian
        _ => "1033",             // English
    }
}

// ─── Startup Cache Restore & Install ─────────────────────────────────────────

impl SilentUpdater {
    /// Called at app startup. If a cached update exists and is newer than the current version,
    /// restore badge state so the titlebar can offer install — do not install automatically.
    pub fn restore_cached_update(&self) {
        let current_version = env!("CARGO_PKG_VERSION");

        let meta = match Self::read_cache_meta() {
            Ok(meta) => meta,
            Err(_) => return,
        };

        let cached_version = &meta.version;

        if version_lte(cached_version, current_version) {
            logging!(
                info,
                Type::System,
                "Update cache version ({}) <= current ({}), cleaning up",
                cached_version,
                current_version
            );
            Self::delete_cache();
            return;
        }

        logging!(
            info,
            Type::System,
            "Update cache version ({}) > current ({}), restoring ready badge",
            cached_version,
            current_version
        );

        self.set_status(UpdateStatus::available(cached_version.clone(), true));
    }

    /// Install a previously downloaded update (from memory or disk cache).
    /// Returns true when install was triggered (caller should restart / expect process takeover).
    pub async fn install_pending(&self, app_handle: &tauri::AppHandle) -> Result<bool> {
        let status = self.status();
        if !status.available || !status.downloaded {
            bail!("no downloaded update ready to install");
        }
        let expected_version = status
            .version
            .clone()
            .ok_or_else(|| anyhow::anyhow!("missing pending update version"))?;

        let bytes = {
            let pending = self.pending_bytes.read().clone();
            match pending {
                Some(bytes) => bytes,
                None => match Self::read_cache_bytes() {
                    Ok(bytes) => bytes,
                    Err(e) => {
                        logging!(
                            warn,
                            Type::System,
                            "Failed to read cached update bytes: {e}, cleaning up"
                        );
                        Self::delete_cache();
                        self.clear_pending();
                        return Err(e);
                    }
                },
            }
        };

        let update = {
            let pending = self.pending_update.read().clone();
            match pending {
                Some(update) => update,
                None => match Self::fetch_matching_update(app_handle, &expected_version).await {
                    Ok(update) => update,
                    Err(e) => {
                        self.clear_pending();
                        return Err(e);
                    }
                },
            }
        };

        let version = update.version.clone();
        logging!(info, Type::System, "Installing cached update v{version}...");

        Self::show_update_splash(app_handle, &version);

        let install_result = tokio::task::spawn_blocking({
            let bytes = bytes.clone();
            let update = update.clone();
            move || update.install(&bytes)
        });

        let success = match tokio::time::timeout(std::time::Duration::from_secs(30), install_result).await {
            Ok(Ok(Ok(()))) => {
                logging!(info, Type::System, "Update v{version} install triggered");
                Self::delete_cache();
                *self.pending_bytes.write() = None;
                *self.pending_update.write() = None;
                *self.status.write() = UpdateStatus::none();
                true
            }
            Ok(Ok(Err(e))) => {
                logging!(warn, Type::System, "Pending install failed: {e}");
                Self::close_update_splash(app_handle);
                return Err(e.into());
            }
            Ok(Err(e)) => {
                logging!(warn, Type::System, "Pending install task panicked: {e}");
                Self::close_update_splash(app_handle);
                bail!("install task panicked: {e}");
            }
            Err(_) => {
                logging!(
                    warn,
                    Type::System,
                    "Pending install timed out (30s); installer may still be running"
                );
                // On Windows NSIS may keep running after timeout — treat as triggered.
                true
            }
        };

        Ok(success)
    }

    async fn fetch_matching_update(app_handle: &tauri::AppHandle, expected_version: &str) -> Result<Update> {
        let updater_builder = app_handle.updater_builder();
        #[cfg(target_os = "windows")]
        let updater_builder = {
            let verge_lang = Config::verge().await.latest_arc().language.clone();
            let lang_id = nsis_language_id(&clash_verge_i18n::current_language(verge_lang.as_deref()));
            updater_builder.installer_arg(format!("/LANG={lang_id}"))
        };

        let update = match updater_builder.build() {
            Ok(updater) => match updater.check().await {
                Ok(Some(u)) => u,
                Ok(None) => {
                    logging!(
                        info,
                        Type::System,
                        "No update available from server, cache may be stale, cleaning up"
                    );
                    Self::delete_cache();
                    bail!("no update available from server");
                }
                Err(e) => {
                    logging!(warn, Type::System, "Failed to check for update before install: {e}");
                    return Err(e.into());
                }
            },
            Err(e) => {
                logging!(warn, Type::System, "Failed to create updater: {e}");
                return Err(e.into());
            }
        };

        if update.version != expected_version {
            logging!(
                info,
                Type::System,
                "Server version ({}) != cached version ({}), cache is stale, cleaning up",
                update.version,
                expected_version
            );
            Self::delete_cache();
            bail!(
                "cached update version mismatch: server={}, cache={}",
                update.version,
                expected_version
            );
        }

        Ok(update)
    }
}

// ─── Update Splash Window ────────────────────────────────────────────────────

impl SilentUpdater {
    /// Show a small centered splash window indicating update is being installed.
    /// Injects HTML via eval() after window creation so it doesn't depend on any
    /// external file in the bundle.
    fn show_update_splash(app_handle: &tauri::AppHandle, version: &str) {
        use tauri::{WebviewUrl, WebviewWindowBuilder};

        let window = match WebviewWindowBuilder::new(app_handle, "update-splash", WebviewUrl::App("index.html".into()))
            .title("clash-x - Updating")
            .inner_size(300.0, 180.0)
            .resizable(false)
            .maximizable(false)
            .minimizable(false)
            .closable(false)
            .decorations(false)
            .center()
            .always_on_top(true)
            .visible(true)
            .build()
        {
            Ok(w) => w,
            Err(e) => {
                logging!(warn, Type::System, "Failed to create update splash: {e}");
                return;
            }
        };

        let js = format!(
            r#"
            document.documentElement.innerHTML = `
            <head><meta charset="utf-8"/><style>
              *{{margin:0;padding:0;box-sizing:border-box}}
              html,body{{height:100%;overflow:hidden;user-select:none;-webkit-user-select:none;
                font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif}}
              body{{display:flex;flex-direction:column;align-items:center;justify-content:center;
                background:#1e1e2e;color:#cdd6f4}}
              @media(prefers-color-scheme:light){{
                body{{background:#eff1f5;color:#4c4f69}}
                .bar{{background:#dce0e8}}.fill{{background:#1e66f5}}.sub{{color:#6c6f85}}
              }}
              .icon{{width:48px;height:48px;margin-bottom:16px;animation:pulse 2s ease-in-out infinite}}
              .title{{font-size:16px;font-weight:600;margin-bottom:6px}}
              .sub{{font-size:13px;color:#a6adc8;margin-bottom:20px}}
              .bar{{width:200px;height:4px;background:#313244;border-radius:2px;overflow:hidden}}
              .fill{{height:100%;width:30%;background:#89b4fa;border-radius:2px;animation:ind 1.5s ease-in-out infinite}}
              @keyframes ind{{0%{{width:0;margin-left:0}}50%{{width:40%;margin-left:30%}}100%{{width:0;margin-left:100%}}}}
              @keyframes pulse{{0%,100%{{opacity:1}}50%{{opacity:.6}}}}
            </style></head>
            <body>
              <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              <div class="title">Installing Update...</div>
              <div class="sub">v{version}</div>
              <div class="bar"><div class="fill"></div></div>
            </body>`;
            "#
        );

        // Retry eval a few times — the webview may not be ready immediately
        std::thread::spawn(move || {
            for i in 0..10 {
                std::thread::sleep(std::time::Duration::from_millis(100 * (i + 1)));
                if window.eval(&js).is_ok() {
                    return;
                }
            }
        });

        logging!(info, Type::System, "Update splash window shown");
    }

    /// Close the update splash window (e.g. after install failure).
    fn close_update_splash(app_handle: &tauri::AppHandle) {
        use tauri::Manager as _;
        if let Some(window) = app_handle.get_webview_window("update-splash") {
            let _ = window.close();
            logging!(info, Type::System, "Update splash window closed");
        }
    }
}

// ─── Background Check and Download ───────────────────────────────────────────

impl SilentUpdater {
    async fn check_and_download(&self, app_handle: &tauri::AppHandle) -> Result<()> {
        let is_portable = *dirs::PORTABLE_FLAG.get().unwrap_or(&false);
        if is_portable {
            logging!(debug, Type::System, "Silent update skipped: portable build");
            return Ok(());
        }

        let auto_check = Config::verge().await.latest_arc().auto_check_update.unwrap_or(true);
        if !auto_check {
            logging!(debug, Type::System, "Silent update skipped: auto_check_update is false");
            return Ok(());
        }

        if self.is_update_ready() {
            logging!(debug, Type::System, "Silent update skipped: update already pending");
            // Keep the titlebar badge visible across sessions / late UI mounts.
            Self::notify_frontend(&self.status());
            return Ok(());
        }

        logging!(info, Type::System, "Silent updater: checking for updates...");

        let updater = app_handle.updater()?;
        let update = match updater.check().await {
            Ok(Some(update)) => update,
            Ok(None) => {
                logging!(info, Type::System, "Silent updater: no update available");
                Self::delete_cache();
                self.clear_pending();
                return Ok(());
            }
            Err(e) => {
                logging!(warn, Type::System, "Silent updater: check failed: {e}");
                return Err(e.into());
            }
        };

        let version = update.version.clone();
        logging!(info, Type::System, "Silent updater: update available: v{version}");

        if let Some(body) = &update.body
            && body.to_lowercase().contains("break change")
        {
            logging!(
                info,
                Type::System,
                "Silent updater: breaking change detected in v{version}, skipping auto-download"
            );
            *self.pending_bytes.write() = None;
            *self.pending_update.write() = None;
            self.set_status(UpdateStatus::available(version, false));
            return Ok(());
        }

        logging!(info, Type::System, "Silent updater: downloading v{version}...");
        match update
            .download(
                |chunk_len, content_len| {
                    logging!(
                        debug,
                        Type::System,
                        "Silent updater download progress: chunk={chunk_len}, total={content_len:?}"
                    );
                },
                || {
                    logging!(info, Type::System, "Silent updater: download complete");
                },
            )
            .await
        {
            Ok(bytes) => {
                if let Err(e) = Self::write_cache(&bytes, &version) {
                    logging!(warn, Type::System, "Silent updater: failed to write cache: {e}");
                }

                *self.pending_bytes.write() = Some(bytes);
                *self.pending_update.write() = Some(update);
                self.set_status(UpdateStatus::available(version.clone(), true));

                logging!(
                    info,
                    Type::System,
                    "Silent updater: v{version} ready — titlebar install button enabled"
                );
            }
            Err(e) => {
                logging!(warn, Type::System, "Silent updater: download failed: {e}");
                *self.pending_bytes.write() = None;
                *self.pending_update.write() = None;
                self.set_status(UpdateStatus::available(version, false));
            }
        }

        Ok(())
    }

    pub async fn start_background_check(&self, app_handle: tauri::AppHandle) {
        logging!(info, Type::System, "Silent updater: background task started");

        // Give the UI a moment to mount listeners, then check once on startup.
        tokio::time::sleep(std::time::Duration::from_secs(10)).await;

        // Re-emit restored cache status in case the frontend subscribed late.
        {
            let status = self.status();
            if status.available {
                Self::notify_frontend(&status);
            }
        }

        loop {
            if let Err(e) = self.check_and_download(&app_handle).await {
                logging!(warn, Type::System, "Silent updater: cycle error: {e}");
            }

            tokio::time::sleep(std::time::Duration::from_secs(24 * 60 * 60)).await;
        }
    }
}

#[cfg(test)]
#[allow(clippy::unwrap_used)]
mod tests {
    use super::*;

    // ─── version_lte tests ──────────────────────────────────────────────────

    #[test]
    fn test_version_equal() {
        assert!(version_lte("2.4.7", "2.4.7"));
    }

    #[test]
    fn test_version_less() {
        assert!(version_lte("2.4.7", "2.4.8"));
        assert!(version_lte("2.4.7", "2.5.0"));
        assert!(version_lte("2.4.7", "3.0.0"));
    }

    #[test]
    fn test_version_greater() {
        assert!(!version_lte("2.4.8", "2.4.7"));
        assert!(!version_lte("2.5.0", "2.4.7"));
        assert!(!version_lte("3.0.0", "2.4.7"));
    }

    #[test]
    fn test_version_with_v_prefix() {
        assert!(version_lte("v2.4.7", "2.4.8"));
        assert!(version_lte("2.4.7", "v2.4.8"));
        assert!(version_lte("v2.4.7", "v2.4.8"));
    }

    #[test]
    fn test_version_with_prerelease() {
        // "2.4.8-alpha" → numeric part is still "2.4.8"
        assert!(version_lte("2.4.7", "2.4.8-alpha"));
        assert!(version_lte("2.4.8-alpha", "2.4.8"));
        // Both have same numeric part, so equal → true
        assert!(version_lte("2.4.8-alpha", "2.4.8-beta"));
    }

    #[test]
    fn test_version_different_lengths() {
        assert!(version_lte("2.4", "2.4.1"));
        assert!(!version_lte("2.4.1", "2.4"));
        assert!(version_lte("2.4.0", "2.4"));
    }

    // ─── Cache metadata tests ───────────────────────────────────────────────

    #[test]
    fn test_cache_meta_serialize_roundtrip() {
        let meta = UpdateCacheMeta {
            version: "2.5.0".to_string(),
            downloaded_at: "2026-03-31T00:00:00Z".to_string(),
        };
        let json = serde_json::to_string(&meta).unwrap();
        let parsed: UpdateCacheMeta = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.version, "2.5.0");
        assert_eq!(parsed.downloaded_at, "2026-03-31T00:00:00Z");
    }

    #[test]
    fn test_cache_meta_invalid_json() {
        let result = serde_json::from_str::<UpdateCacheMeta>("not valid json");
        assert!(result.is_err());
    }

    #[test]
    fn test_cache_meta_missing_required_field() {
        let result = serde_json::from_str::<UpdateCacheMeta>(r#"{"version":"2.5.0"}"#);
        assert!(result.is_err()); // missing downloaded_at
    }
}
