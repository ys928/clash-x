//! Per-domain traffic accounting (proxy vs direct).
//!
//! Polls mihomo `/connections`, accumulates byte deltas by host and day, and
//! persists under the clash-x data directory so day / week / month / year views
//! survive restarts. Data is never auto-pruned; users clear older days manually.
//! Collection only runs while the Tauri process is up (including lightweight mode).

use crate::{
    core::handle::Handle,
    process::AsyncHandler,
    utils::{dirs, help},
};
use anyhow::{Context as _, Result};
use chrono::{Duration as ChronoDuration, Local, NaiveDate};
use clash_verge_logging::{Type, logging};
use once_cell::sync::OnceCell;
use parking_lot::Mutex as ParkingMutex;
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    path::PathBuf,
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
    time::Duration,
};
use tokio::sync::Mutex as AsyncMutex;

const DOMAIN_TRAFFIC_FILE: &str = "domain-traffic.yaml";
const POLL_INTERVAL: Duration = Duration::from_secs(2);
const SAVE_INTERVAL: Duration = Duration::from_secs(30);
const INITIAL_DELAY: Duration = Duration::from_secs(3);

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum DomainTrafficRange {
    Day,
    Week,
    Month,
    Year,
}

impl DomainTrafficRange {
    const fn days(self) -> i64 {
        match self {
            Self::Day => 1,
            Self::Week => 7,
            Self::Month => 30,
            Self::Year => 365,
        }
    }
}

#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct DomainDayCounters {
    #[serde(default)]
    proxy_upload: u64,
    #[serde(default)]
    proxy_download: u64,
    #[serde(default)]
    direct_upload: u64,
    #[serde(default)]
    direct_download: u64,
}

impl DomainDayCounters {
    const fn add(&mut self, is_direct: bool, upload: u64, download: u64) {
        if upload == 0 && download == 0 {
            return;
        }
        if is_direct {
            self.direct_upload = self.direct_upload.saturating_add(upload);
            self.direct_download = self.direct_download.saturating_add(download);
        } else {
            self.proxy_upload = self.proxy_upload.saturating_add(upload);
            self.proxy_download = self.proxy_download.saturating_add(download);
        }
    }

    const fn merge_from(&mut self, other: &Self) {
        self.proxy_upload = self.proxy_upload.saturating_add(other.proxy_upload);
        self.proxy_download = self.proxy_download.saturating_add(other.proxy_download);
        self.direct_upload = self.direct_upload.saturating_add(other.direct_upload);
        self.direct_download = self.direct_download.saturating_add(other.direct_download);
    }

    const fn total(&self) -> u64 {
        self.proxy_upload
            .saturating_add(self.proxy_download)
            .saturating_add(self.direct_upload)
            .saturating_add(self.direct_download)
    }

    const fn proxy_total(&self) -> u64 {
        self.proxy_upload.saturating_add(self.proxy_download)
    }

    const fn direct_total(&self) -> u64 {
        self.direct_upload.saturating_add(self.direct_download)
    }

    const fn is_empty(&self) -> bool {
        self.total() == 0
    }
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DomainTrafficFile {
    /// `YYYY-MM-DD` (local) → domain → counters
    #[serde(default)]
    days: HashMap<String, HashMap<String, DomainDayCounters>>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DomainTrafficItem {
    pub domain: String,
    pub proxy_upload: u64,
    pub proxy_download: u64,
    pub direct_upload: u64,
    pub direct_download: u64,
    pub proxy_total: u64,
    pub direct_total: u64,
    pub total: u64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DomainTrafficTotals {
    pub proxy_upload: u64,
    pub proxy_download: u64,
    pub direct_upload: u64,
    pub direct_download: u64,
    pub proxy_total: u64,
    pub direct_total: u64,
    pub total: u64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DomainTrafficStats {
    pub range: DomainTrafficRange,
    pub from_day: String,
    pub to_day: String,
    pub totals: DomainTrafficTotals,
    pub items: Vec<DomainTrafficItem>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClearDomainTrafficResult {
    pub removed_days: u32,
}

#[derive(Clone, Debug)]
struct ConnSnapshot {
    upload: u64,
    download: u64,
}

struct CollectorState {
    days: HashMap<String, HashMap<String, DomainDayCounters>>,
    seen: HashMap<String, ConnSnapshot>,
    dirty: bool,
}

pub struct DomainTrafficManager {
    state: Arc<ParkingMutex<CollectorState>>,
    io: AsyncMutex<()>,
    loaded: AtomicBool,
    runner_started: AtomicBool,
}

impl DomainTrafficManager {
    pub fn global() -> &'static Self {
        static INSTANCE: OnceCell<DomainTrafficManager> = OnceCell::new();
        INSTANCE.get_or_init(|| Self {
            state: Arc::new(ParkingMutex::new(CollectorState {
                days: HashMap::new(),
                seen: HashMap::new(),
                dirty: false,
            })),
            io: AsyncMutex::new(()),
            loaded: AtomicBool::new(false),
            runner_started: AtomicBool::new(false),
        })
    }

    pub async fn init(&self) -> Result<()> {
        {
            let _guard = self.io.lock().await;
            if !self.loaded.swap(true, Ordering::SeqCst) {
                let file = load_from_disk().await.unwrap_or_default();
                let mut state = self.state.lock();
                state.days = file.days;
            }
        }
        self.ensure_runner();
        Ok(())
    }

    pub fn stats(&self, range: DomainTrafficRange) -> DomainTrafficStats {
        let today = Local::now().date_naive();
        let state = self.state.lock();
        aggregate_stats(&state.days, range, today)
    }

    /// Removes all day buckets with date **strictly before** `before_day` (`YYYY-MM-DD`).
    pub async fn clear_before(&self, before_day: &str) -> Result<ClearDomainTrafficResult> {
        let cutoff = NaiveDate::parse_from_str(before_day.trim(), "%Y-%m-%d")
            .with_context(|| format!("invalid beforeDay: {before_day}"))?;

        let removed_days = {
            let mut state = self.state.lock();
            let before_len = state.days.len();
            state.days.retain(|key, _| {
                NaiveDate::parse_from_str(key, "%Y-%m-%d")
                    .map(|date| date >= cutoff)
                    .unwrap_or(false)
            });
            let removed = before_len.saturating_sub(state.days.len()) as u32;
            if removed > 0 {
                state.dirty = true;
            }
            removed
        };

        if removed_days > 0 {
            self.persist_now().await?;
        }
        Ok(ClearDomainTrafficResult { removed_days })
    }

    pub async fn clear_all(&self) -> Result<ClearDomainTrafficResult> {
        let removed_days = {
            let mut state = self.state.lock();
            let removed = state.days.len() as u32;
            state.days.clear();
            state.seen.clear();
            state.dirty = true;
            removed
        };
        self.persist_now().await?;
        Ok(ClearDomainTrafficResult { removed_days })
    }

    fn ensure_runner(&self) {
        if self
            .runner_started
            .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .is_err()
        {
            return;
        }

        let state = Arc::clone(&self.state);
        AsyncHandler::spawn(move || async move {
            tokio::time::sleep(INITIAL_DELAY).await;
            let mut save_tick = tokio::time::interval(SAVE_INTERVAL);
            save_tick.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
            let mut poll_tick = tokio::time::interval(POLL_INTERVAL);
            poll_tick.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
            // Skip the immediate first ticks so INITIAL_DELAY is the real start.
            poll_tick.tick().await;
            save_tick.tick().await;

            loop {
                tokio::select! {
                    _ = poll_tick.tick() => {
                        if let Err(err) = poll_once(&state).await {
                            logging!(debug, Type::Core, "domain traffic poll skipped: {err:#}");
                        }
                    }
                    _ = save_tick.tick() => {
                        if let Err(err) = persist_if_dirty(&state).await {
                            logging!(warn, Type::File, "domain traffic save failed: {err:#}");
                        }
                    }
                }
            }
        });
    }

    async fn persist_now(&self) -> Result<()> {
        let _guard = self.io.lock().await;
        let snapshot = {
            let mut state = self.state.lock();
            state.dirty = false;
            DomainTrafficFile {
                days: state.days.clone(),
            }
        };
        save_to_disk(&snapshot).await
    }
}

async fn poll_once(state: &ParkingMutex<CollectorState>) -> Result<()> {
    let mihomo = Handle::mihomo();
    let connections = mihomo.get_connections().await.context("get_connections failed")?;
    let list = connections.connections.unwrap_or_default();
    let today = Local::now().date_naive().format("%Y-%m-%d").to_string();

    let mut guard = state.lock();
    let mut active = HashMap::with_capacity(list.len());

    for conn in list {
        let Some(domain) = resolve_domain(&conn.metadata) else {
            continue;
        };
        let Some(is_direct) = classify_direct(&conn.chains) else {
            continue;
        };

        active.insert(conn.id.clone(), ());

        if let Some(prev) = guard.seen.get(&conn.id).cloned() {
            let du = conn.upload.saturating_sub(prev.upload);
            let dd = conn.download.saturating_sub(prev.download);
            if du > 0 || dd > 0 {
                guard
                    .days
                    .entry(today.clone())
                    .or_default()
                    .entry(domain)
                    .or_default()
                    .add(is_direct, du, dd);
                guard.dirty = true;
            }
        }
        // First sighting is baseline-only so restarts don't recount active totals.
        guard.seen.insert(
            conn.id,
            ConnSnapshot {
                upload: conn.upload,
                download: conn.download,
            },
        );
    }

    guard.seen.retain(|id, _| active.contains_key(id));
    drop(guard);
    Ok(())
}

async fn persist_if_dirty(state: &ParkingMutex<CollectorState>) -> Result<()> {
    let snapshot = {
        let mut guard = state.lock();
        if !guard.dirty {
            return Ok(());
        }
        guard.dirty = false;
        DomainTrafficFile {
            days: guard.days.clone(),
        }
    };
    save_to_disk(&snapshot).await
}

fn storage_path() -> Result<PathBuf> {
    Ok(dirs::clash_x_data_dir()?.join(DOMAIN_TRAFFIC_FILE))
}

fn legacy_storage_path() -> Result<PathBuf> {
    Ok(dirs::app_home_dir()?.join(DOMAIN_TRAFFIC_FILE))
}

async fn load_from_disk() -> Result<DomainTrafficFile> {
    let path = storage_path()?;
    if path.exists() {
        return help::read_yaml::<DomainTrafficFile>(&path).await;
    }

    // One-shot migrate from upstream verge data dir if present.
    let legacy = legacy_storage_path()?;
    if legacy.exists() {
        logging!(
            info,
            Type::File,
            "migrating domain traffic from {:?} to {:?}",
            legacy,
            path
        );
        let file = help::read_yaml::<DomainTrafficFile>(&legacy).await?;
        if let Err(err) = save_to_disk(&file).await {
            logging!(warn, Type::File, "domain traffic migrate save failed: {err:#}");
            return Ok(file);
        }
        let _ = tokio::fs::remove_file(&legacy).await;
        return Ok(file);
    }

    Ok(DomainTrafficFile::default())
}

async fn save_to_disk(file: &DomainTrafficFile) -> Result<()> {
    let path = storage_path()?;
    if let Some(parent) = path.parent() {
        tokio::fs::create_dir_all(parent).await?;
    }
    help::save_yaml(&path, file, Some("# Domain traffic statistics (clash-x)\n\n")).await
}

fn resolve_domain(meta: &tauri_plugin_mihomo::models::ConnectionMetaData) -> Option<String> {
    for candidate in [
        meta.host.as_str(),
        meta.sniff_host.as_str(),
        meta.remote_destination.as_str(),
    ] {
        if let Some(domain) = normalize_host(candidate) {
            return Some(domain);
        }
    }
    normalize_host(meta.destination_ip.as_str())
}

fn normalize_host(raw: &str) -> Option<String> {
    let trimmed = raw.trim().trim_matches('.').to_ascii_lowercase();
    if trimmed.is_empty() {
        return None;
    }
    // Drop bracketed IPv6 noise like [::1]:443 leftovers if any.
    let host = trimmed.split_once('%').map(|(h, _)| h).unwrap_or(trimmed.as_str());
    let host = host.trim_matches(|c| c == '[' || c == ']');
    if host.is_empty() || host == "0.0.0.0" || host == "::" {
        return None;
    }
    Some(host.to_string())
}

/// `Some(true)` = direct, `Some(false)` = proxy, `None` = ignore (reject / empty).
fn classify_direct(chains: &[String]) -> Option<bool> {
    let outbound = chains.first()?.as_str();
    match outbound {
        "DIRECT" => Some(true),
        "REJECT" | "REJECT-DROP" | "PASS" | "COMPATIBLE" => None,
        _ => Some(false),
    }
}

fn aggregate_stats(
    days: &HashMap<String, HashMap<String, DomainDayCounters>>,
    range: DomainTrafficRange,
    today: NaiveDate,
) -> DomainTrafficStats {
    let span = range.days();
    let from = today - ChronoDuration::days(span - 1);
    let mut merged: HashMap<String, DomainDayCounters> = HashMap::new();

    let mut cursor = from;
    while cursor <= today {
        let key = cursor.format("%Y-%m-%d").to_string();
        if let Some(day_map) = days.get(&key) {
            for (domain, counters) in day_map {
                if counters.is_empty() {
                    continue;
                }
                merged.entry(domain.clone()).or_default().merge_from(counters);
            }
        }
        cursor += ChronoDuration::days(1);
    }

    let mut items: Vec<DomainTrafficItem> = merged
        .into_iter()
        .filter(|(_, c)| !c.is_empty())
        .map(|(domain, c)| DomainTrafficItem {
            domain,
            proxy_upload: c.proxy_upload,
            proxy_download: c.proxy_download,
            direct_upload: c.direct_upload,
            direct_download: c.direct_download,
            proxy_total: c.proxy_total(),
            direct_total: c.direct_total(),
            total: c.total(),
        })
        .collect();
    items.sort_by(|a, b| b.total.cmp(&a.total).then_with(|| a.domain.cmp(&b.domain)));

    let mut totals = DomainDayCounters::default();
    for item in &items {
        totals.proxy_upload = totals.proxy_upload.saturating_add(item.proxy_upload);
        totals.proxy_download = totals.proxy_download.saturating_add(item.proxy_download);
        totals.direct_upload = totals.direct_upload.saturating_add(item.direct_upload);
        totals.direct_download = totals.direct_download.saturating_add(item.direct_download);
    }

    DomainTrafficStats {
        range,
        from_day: from.format("%Y-%m-%d").to_string(),
        to_day: today.format("%Y-%m-%d").to_string(),
        totals: DomainTrafficTotals {
            proxy_upload: totals.proxy_upload,
            proxy_download: totals.proxy_download,
            direct_upload: totals.direct_upload,
            direct_download: totals.direct_download,
            proxy_total: totals.proxy_total(),
            direct_total: totals.direct_total(),
            total: totals.total(),
        },
        items,
    }
}

#[cfg(test)]
#[allow(clippy::unwrap_used, reason = "tests assert by panicking")]
mod tests {
    use super::*;

    #[test]
    fn classifies_outbound() {
        assert_eq!(classify_direct(&["DIRECT".into()]), Some(true));
        assert_eq!(classify_direct(&["🇭🇰 HK".into(), "Proxy".into()]), Some(false));
        assert_eq!(classify_direct(&["REJECT".into()]), None);
        assert_eq!(classify_direct(&[]), None);
    }

    #[test]
    fn normalizes_hosts() {
        assert_eq!(normalize_host("Example.COM."), Some("example.com".into()));
        assert_eq!(normalize_host("  "), None);
        assert_eq!(normalize_host("0.0.0.0"), None);
    }

    #[test]
    fn aggregates_range() {
        let mut days = HashMap::new();
        let today = NaiveDate::from_ymd_opt(2026, 8, 29).unwrap();
        let mut today_map = HashMap::new();
        today_map.insert(
            "a.com".into(),
            DomainDayCounters {
                proxy_download: 100,
                ..Default::default()
            },
        );
        today_map.insert(
            "b.com".into(),
            DomainDayCounters {
                direct_download: 50,
                ..Default::default()
            },
        );
        days.insert("2026-08-29".into(), today_map);

        let mut yesterday = HashMap::new();
        yesterday.insert(
            "a.com".into(),
            DomainDayCounters {
                proxy_download: 20,
                ..Default::default()
            },
        );
        days.insert("2026-08-28".into(), yesterday);

        let day = aggregate_stats(&days, DomainTrafficRange::Day, today);
        assert_eq!(day.items.len(), 2);
        assert_eq!(day.totals.proxy_total, 100);
        assert_eq!(day.totals.direct_total, 50);

        let week = aggregate_stats(&days, DomainTrafficRange::Week, today);
        assert_eq!(week.totals.proxy_total, 120);
        assert_eq!(week.items[0].domain, "a.com");
        assert_eq!(week.items[0].total, 120);

        let year = aggregate_stats(&days, DomainTrafficRange::Year, today);
        assert_eq!(year.totals.proxy_total, 120);
        assert_eq!(year.from_day, "2025-08-30");
    }

    #[test]
    fn counters_add_by_mode() {
        let mut c = DomainDayCounters::default();
        c.add(false, 10, 20);
        c.add(true, 1, 2);
        assert_eq!(c.proxy_total(), 30);
        assert_eq!(c.direct_total(), 3);
        assert_eq!(c.total(), 33);
    }

    #[test]
    fn year_span_is_365_days() {
        assert_eq!(DomainTrafficRange::Year.days(), 365);
    }
}
