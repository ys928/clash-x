use crate::{config::Config, singleton, utils::dirs};
use anyhow::{Context as _, Result};
use chrono::Utc;
use clash_verge_logging::{Type, logging};
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::{
    path::PathBuf,
    sync::atomic::{AtomicBool, AtomicU64, Ordering},
    time::Duration,
};
use tauri_plugin_updater::{Update, UpdaterExt as _};
use tokio_util::sync::CancellationToken;

pub struct SilentUpdater {
    update_ready: AtomicBool,
    manual_cancel: Mutex<Option<CancellationToken>>,
    background_cancel: Mutex<Option<CancellationToken>>,
}

singleton!(SilentUpdater, SILENT_UPDATER);

impl SilentUpdater {
    const fn new() -> Self {
        Self {
            update_ready: AtomicBool::new(false),
            manual_cancel: Mutex::new(None),
            background_cancel: Mutex::new(None),
        }
    }

    pub fn is_update_ready(&self) -> bool {
        self.update_ready.load(Ordering::Acquire)
    }
}

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

    fn verified_cache(app_handle: &tauri::AppHandle, update: &Update) -> Option<Vec<u8>> {
        let meta = Self::read_cache_meta().ok()?;
        let bytes = if meta.version == update.version {
            Self::read_cache_bytes().and_then(|bytes| {
                verify_signature(app_handle, &bytes, &update.signature, &update.version)?;
                Ok(bytes)
            })
        } else {
            Err(anyhow::anyhow!("server offers v{}", update.version))
        };
        match bytes {
            Ok(bytes) => Some(bytes),
            Err(error) => {
                logging!(
                    info,
                    Type::System,
                    "Update cache v{} is unusable: {error:#}, cleaning up",
                    meta.version
                );
                Self::delete_cache();
                None
            }
        }
    }
}

fn verify_signature(app_handle: &tauri::AppHandle, bytes: &[u8], signature: &str, version: &str) -> Result<()> {
    use base64::Engine as _;

    let decode = |value: &str| -> Result<String> {
        Ok(String::from_utf8(
            base64::engine::general_purpose::STANDARD.decode(value)?,
        )?)
    };
    let config: tauri_plugin_updater::Config = serde_json::from_value(
        app_handle
            .config()
            .plugins
            .0
            .get("updater")
            .cloned()
            .context("updater is not configured")?,
    )?;
    let public_key = minisign_verify::PublicKey::decode(&decode(&config.pubkey)?)?;
    let signature = minisign_verify::Signature::decode(&decode(signature)?)?;
    public_key
        .verify(bytes, &signature, true)
        .context("signature mismatch")?;
    if let Some(signed) = signature
        .trusted_comment()
        .split('\t')
        .find_map(|field| field.strip_prefix("version:"))
    {
        anyhow::ensure!(
            signed.trim_start_matches('v') == version,
            "signed for v{signed}, not v{version}"
        );
    } else {
        anyhow::ensure!(!config.require_signed_version, "signature carries no version");
    }
    Ok(())
}

pub fn is_build_to_stable(current: &str, remote: &str) -> bool {
    let Some((base, build)) = current.trim_start_matches('v').split_once('+') else {
        return false;
    };
    !build.is_empty() && !base.contains('-') && base == remote.trim_start_matches('v')
}

/// Compares numeric version components after stripping version suffixes.
fn version_lte(a: &str, b: &str) -> bool {
    let parse = |v: &str| -> Vec<u64> {
        v.trim_start_matches('v')
            .split(['-', '+'])
            .next()
            .unwrap_or("0")
            .split('.')
            .filter_map(|part| part.parse::<u64>().ok())
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

/// Maps UI language to one of the three NSIS translations, defaulting to English.
#[cfg(target_os = "windows")]
fn nsis_language_id(app_language: &str) -> &'static str {
    match app_language {
        "zh" | "zhtw" => "2052", // SimpChinese
        "ru" => "1049",          // Russian
        _ => "1033",             // English
    }
}

#[derive(Clone, Serialize)]
#[serde(tag = "event", content = "data")]
pub enum DownloadEvent {
    #[serde(rename_all = "camelCase")]
    Started {
        content_length: Option<u64>,
    },
    #[serde(rename_all = "camelCase")]
    Progress {
        chunk_length: usize,
    },
    Finished,
}

const MIRRORS: [&str; 2] = ["https://update.hwdns.net/", "https://gh-proxy.org/"];
const MIN_PROGRESS: u64 = 1024 * 1024;
const PROGRESS_WINDOW: Duration = Duration::from_secs(30);

fn download_sources(url: &tauri::Url) -> Vec<tauri::Url> {
    let origin = MIRRORS
        .iter()
        .find_map(|mirror| url.as_str().strip_prefix(mirror))
        .unwrap_or(url.as_str());
    let mut sources = vec![url.clone()];
    if origin.starts_with("https://github.com/") {
        for candidate in MIRRORS
            .iter()
            .map(|mirror| format!("{mirror}{origin}"))
            .chain([origin.to_owned()])
        {
            if let Ok(candidate) = tauri::Url::parse(&candidate)
                && !sources.contains(&candidate)
            {
                sources.push(candidate);
            }
        }
    }
    sources
}

async fn download(update: &Update, on_event: impl Fn(DownloadEvent) + Sync) -> Result<Vec<u8>> {
    let sources = download_sources(&update.download_url);
    let mut last_error = None;
    for floor in [MIN_PROGRESS, 1] {
        for url in &sources {
            logging!(info, Type::System, "Downloading update v{} from {url}", update.version);
            match download_from(update, url, floor, &on_event).await {
                Ok(bytes) => {
                    on_event(DownloadEvent::Finished);
                    return Ok(bytes);
                }
                Err(error) => {
                    logging!(warn, Type::System, "Update download from {url} failed: {error:#}");
                    last_error = Some(error);
                }
            }
        }
    }
    Err(last_error.unwrap_or_else(|| anyhow::anyhow!("no update download source")))
}

async fn download_from(
    update: &Update,
    url: &tauri::Url,
    floor: u64,
    on_event: &(impl Fn(DownloadEvent) + Sync),
) -> Result<Vec<u8>> {
    let mut source = update.clone();
    source.download_url = url.clone();
    let received = AtomicU64::new(0);
    let mut started = false;
    let fetch = source.download(
        |chunk_length, content_length| {
            if !std::mem::replace(&mut started, true) {
                on_event(DownloadEvent::Started { content_length });
            }
            received.fetch_add(chunk_length as u64, Ordering::Relaxed);
            on_event(DownloadEvent::Progress { chunk_length });
        },
        || {},
    );
    tokio::pin!(fetch);
    let mut seen = 0;
    loop {
        tokio::select! {
            result = &mut fetch => return Ok(result?),
            () = tokio::time::sleep(PROGRESS_WINDOW) => {
                let total = received.load(Ordering::Relaxed);
                anyhow::ensure!(total - seen >= floor, "only {} bytes in {PROGRESS_WINDOW:?}", total - seen);
                seen = total;
            }
        }
    }
}

impl SilentUpdater {
    async fn check(app_handle: &tauri::AppHandle) -> Result<Option<Update>> {
        let updater_builder = app_handle.updater_builder();
        #[cfg(target_os = "windows")]
        let updater_builder = {
            let language = Config::verge().await.latest_arc().language.clone();
            let lang_id = nsis_language_id(&clash_verge_i18n::current_language(language.as_deref()));
            updater_builder.installer_arg(format!("/LANG={lang_id}"))
        };
        Ok(updater_builder.build()?.check().await?)
    }

    async fn install(update: Update, bytes: Vec<u8>) -> Result<()> {
        Ok(tokio::task::spawn_blocking(move || update.install(&bytes)).await??)
    }

    /// Installs a newer cached update before normal startup, if the user confirms.
    pub async fn try_install_on_startup(&self, app_handle: &tauri::AppHandle) -> bool {
        if !Config::verge().await.latest_arc().auto_check_update.unwrap_or(true) {
            Self::delete_cache();
            return false;
        }
        let current_version = env!("CARGO_PKG_VERSION");

        let meta = match Self::read_cache_meta() {
            Ok(meta) => meta,
            Err(_) => return false, // No cache, nothing to do
        };

        let cached_version = &meta.version;

        if !is_build_to_stable(current_version, cached_version) && version_lte(cached_version, current_version) {
            logging!(
                info,
                Type::System,
                "Update cache version ({}) <= current ({}), cleaning up",
                cached_version,
                current_version
            );
            Self::delete_cache();
            return false;
        }

        logging!(
            info,
            Type::System,
            "Update cache version ({}) > current ({}), asking user to install",
            cached_version,
            current_version
        );

        // Preserve the cache when skipped so the next launch asks again.
        if !Self::ask_user_to_install(app_handle, cached_version).await {
            logging!(info, Type::System, "User skipped update install, starting normally");
            return false;
        }

        let update = match Self::check(app_handle).await {
            Ok(Some(update)) => update,
            Ok(None) => {
                logging!(
                    info,
                    Type::System,
                    "No update available from server, cache may be stale, cleaning up"
                );
                Self::delete_cache();
                return false;
            }
            Err(error) => {
                logging!(
                    warn,
                    Type::System,
                    "Failed to check for update at startup: {error:#}, will retry next launch"
                );
                return false;
            }
        };
        let Some(bytes) = Self::verified_cache(app_handle, &update) else {
            return false;
        };

        let version = update.version.clone();
        logging!(info, Type::System, "Installing cached update v{version} at startup...");

        Self::show_update_splash(app_handle, &version);

        // `install()` may hang (#2558); on Windows NSIS can take over without returning.
        let install = tokio::time::timeout(std::time::Duration::from_secs(30), Self::install(update, bytes));
        let success = match install.await {
            Ok(Ok(())) => {
                logging!(info, Type::System, "Update v{version} install triggered at startup");
                Self::delete_cache();
                true
            }
            Ok(Err(error)) => {
                logging!(
                    warn,
                    Type::System,
                    "Startup install failed: {error:#}, will retry next launch"
                );
                false
            }
            Err(_) => {
                logging!(
                    warn,
                    Type::System,
                    "Startup install timed out (30s), will retry next launch"
                );
                false
            }
        };

        if !success {
            Self::close_update_splash(app_handle);
        }

        success
    }

    pub async fn install_update(
        &self,
        app_handle: &tauri::AppHandle,
        version: &str,
        on_event: impl Fn(DownloadEvent) + Sync,
    ) -> Result<bool> {
        let cancel = CancellationToken::new();
        *self.manual_cancel.lock() = Some(cancel.clone());
        let prepared = tokio::select! {
            prepared = async {
                let update = Self::check(app_handle)
                    .await?
                    .filter(|update| update.version == version)
                    .with_context(|| format!("v{version} is no longer offered"))?;
                let bytes = match Self::verified_cache(app_handle, &update) {
                    Some(bytes) => bytes,
                    None => download(&update, on_event).await?,
                };
                Ok::<_, anyhow::Error>((update, bytes))
            } => Some(prepared),
            () = cancel.cancelled() => None,
        };
        self.manual_cancel.lock().take();
        let Some((update, bytes)) = prepared.filter(|_| !cancel.is_cancelled()).transpose()? else {
            logging!(info, Type::System, "Update v{version} cancelled");
            return Ok(false);
        };
        logging!(info, Type::System, "Installing update v{version}...");
        Self::install(update, bytes).await?;
        Self::delete_cache();
        Ok(true)
    }

    pub fn cancel_download(&self) {
        let cancel = self.manual_cancel.lock().take();
        if let Some(cancel) = cancel {
            cancel.cancel();
        }
    }

    pub fn discard_pending(&self) {
        let cancel = self.background_cancel.lock().take();
        if let Some(cancel) = cancel {
            cancel.cancel();
        }
        self.update_ready.store(false, Ordering::Release);
        Self::delete_cache();
    }
}

impl SilentUpdater {
    async fn ask_user_to_install(app_handle: &tauri::AppHandle, version: &str) -> bool {
        use tauri_plugin_dialog::{DialogExt as _, MessageDialogButtons, MessageDialogKind};

        let title = clash_verge_i18n::t!("notifications.updateReady.title");
        let body = clash_verge_i18n::t!("notifications.updateReady.body").replace("{version}", version);
        let install_now = clash_verge_i18n::t!("notifications.updateReady.installNow").into_owned();
        let later = clash_verge_i18n::t!("notifications.updateReady.later").into_owned();

        let (tx, rx) = tokio::sync::oneshot::channel();

        app_handle
            .dialog()
            .message(body)
            .title(title)
            .buttons(MessageDialogButtons::OkCancelCustom(install_now, later))
            .kind(MessageDialogKind::Info)
            .show(move |confirmed| {
                let _ = tx.send(confirmed);
            });

        rx.await.unwrap_or(false)
    }
}

impl SilentUpdater {
    /// Uses injected HTML so the splash has no bundled-file dependency.
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

        // The new webview may not accept evaluation immediately.
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

    fn close_update_splash(app_handle: &tauri::AppHandle) {
        use tauri::Manager as _;
        if let Some(window) = app_handle.get_webview_window("update-splash") {
            let _ = window.close();
            logging!(info, Type::System, "Update splash window closed");
        }
    }
}

impl SilentUpdater {
    async fn check_and_download(&self, app_handle: &tauri::AppHandle) -> Result<()> {
        let cancel = CancellationToken::new();
        *self.background_cancel.lock() = Some(cancel.clone());
        let auto_check = Config::verge().await.latest_arc().auto_check_update.unwrap_or(true);
        if !auto_check {
            logging!(debug, Type::System, "Silent update skipped: auto_check_update is false");
            return Ok(());
        }

        if self.is_update_ready() {
            logging!(debug, Type::System, "Silent update skipped: update already pending");
            return Ok(());
        }

        logging!(info, Type::System, "Silent updater: checking for updates...");

        let updater = app_handle.updater()?;
        let update = match updater.check().await {
            Ok(Some(update)) => update,
            Ok(None) => {
                logging!(info, Type::System, "Silent updater: no update available");
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
                "Silent updater: breaking change detected in v{version}, notifying frontend"
            );
            super::handle::Handle::notice_message(
                "info",
                format!("New version v{version} contains breaking changes. Please update manually."),
            );
            return Ok(());
        }

        logging!(info, Type::System, "Silent updater: downloading v{version}...");
        let downloaded = tokio::select! {
            bytes = download(&update, |_| {}) => Some(bytes),
            () = cancel.cancelled() => None,
        };
        let Some(bytes) = downloaded else {
            logging!(info, Type::System, "Silent updater: download cancelled");
            return Ok(());
        };
        let bytes = bytes?;
        logging!(info, Type::System, "Silent updater: download complete");

        if let Err(e) = Self::write_cache(&bytes, &version) {
            logging!(warn, Type::System, "Silent updater: failed to write cache: {e}");
        }

        let _config_write = Config::lock_config_write().await;
        if cancel.is_cancelled() || !Config::verge().await.latest_arc().auto_check_update.unwrap_or(true) {
            logging!(
                info,
                Type::System,
                "Silent updater: auto check was disabled, discarding v{version}"
            );
            Self::delete_cache();
            return Ok(());
        }

        self.update_ready.store(true, Ordering::Release);

        logging!(
            info,
            Type::System,
            "Silent updater: v{version} ready for startup install on next launch"
        );
        Ok(())
    }

    pub async fn start_background_check(&self, app_handle: tauri::AppHandle) {
        logging!(info, Type::System, "Silent updater: background task started");

        tokio::time::sleep(std::time::Duration::from_secs(10)).await;

        loop {
            if let Err(e) = self.check_and_download(&app_handle).await {
                logging!(warn, Type::System, "Silent updater: cycle error: {e}");
            }

            tokio::time::sleep(std::time::Duration::from_secs(24 * 60 * 60)).await;
        }
    }
}
