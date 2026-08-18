//! Curated auto-switch: periodically latency-test a user-picked node set and switch
//! the target Clash group when a better node clears the configured threshold.
//!
//! Runs in the Tauri process so it continues while the UI window is hidden or destroyed
//! (lightweight mode). Configuration is persisted under the app home directory.

use crate::{
    config::Config,
    core::{
        handle::Handle,
        proxy_view::{ProxyMemberRef, ProxyNodeSource, ProxyNodeView, ProxyViewBuilder, ProxyViewInput, ProxyViewV1},
    },
    feat,
    process::AsyncHandler,
    utils::{dirs, help},
};
use anyhow::{Context as _, Result, bail};
use clash_verge_logging::{Type, logging};
use futures::stream::{FuturesUnordered, StreamExt as _};
use once_cell::sync::OnceCell;
use parking_lot::{Mutex as ParkingMutex, RwLock};
use serde::{Deserialize, Serialize};
use serde_yaml_ng::Mapping;
use std::{
    collections::{HashMap, HashSet},
    path::PathBuf,
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
    time::Duration,
};
use tauri_plugin_mihomo::models::ProxyType;
use tokio::sync::{Mutex as AsyncMutex, watch};

const AUTO_SWITCH_FILE: &str = "auto-switch.yaml";
const DEFAULT_INTERVAL_SECONDS: u32 = 60;
const DEFAULT_THRESHOLD_MS: u32 = 50;

const fn default_interval_seconds() -> u32 {
    DEFAULT_INTERVAL_SECONDS
}

const fn default_threshold_ms() -> u32 {
    DEFAULT_THRESHOLD_MS
}
const MIN_INTERVAL_SECONDS: u32 = 15;
const MAX_INTERVAL_SECONDS: u32 = 3600;
const MIN_THRESHOLD_MS: u32 = 0;
const MAX_THRESHOLD_MS: u32 = 5000;
const DEFAULT_DELAY_TIMEOUT_MS: u32 = 10_000;
const DEFAULT_TEST_URL: &str = "http://cp.cloudflare.com/generate_204";
const INITIAL_DELAY_MS: u64 = 2_500;
const DELAY_CONCURRENCY: usize = 10;
const IMPLAUSIBLE_DELAY: u32 = 100_000;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProxyNodeBinding {
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source: Option<ProxyNodeSource>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AutoSwitchGroup {
    pub id: String,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub target_group_name: String,
    #[serde(default)]
    pub nodes: Vec<ProxyNodeBinding>,
    #[serde(default)]
    pub enabled: bool,
    #[serde(default = "default_interval_seconds")]
    pub interval_seconds: u32,
    #[serde(default = "default_threshold_ms")]
    pub threshold_ms: u32,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AutoSwitchFile {
    #[serde(default)]
    groups: Vec<AutoSwitchGroup>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase", tag = "action")]
pub enum AutoSwitchDecision {
    Keep,
    Switch {
        name: String,
        best_delay: u32,
        current_delay: Option<u32>,
    },
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AutoSwitchRunResult {
    pub decision: AutoSwitchDecision,
    pub results: Vec<DelaySample>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DelaySample {
    pub name: String,
    pub delay: u32,
}

#[derive(Clone, Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AutoSwitchGroupPatch {
    pub name: Option<String>,
    pub target_group_name: Option<String>,
    pub nodes: Option<Vec<ProxyNodeBinding>>,
    pub enabled: Option<bool>,
    pub interval_seconds: Option<u32>,
    pub threshold_ms: Option<u32>,
}

pub struct AutoSwitchManager {
    groups: Arc<RwLock<Vec<AutoSwitchGroup>>>,
    groups_tx: watch::Sender<Vec<AutoSwitchGroup>>,
    runner_started: AtomicBool,
    loaded: AtomicBool,
    io: AsyncMutex<()>,
    /// Prevent overlapping runs for the same group id.
    running: ParkingMutex<HashSet<String>>,
}

impl AutoSwitchManager {
    pub fn global() -> &'static Self {
        static INSTANCE: OnceCell<AutoSwitchManager> = OnceCell::new();
        INSTANCE.get_or_init(|| {
            let (tx, _rx) = watch::channel(Vec::new());
            Self {
                groups: Arc::new(RwLock::new(Vec::new())),
                groups_tx: tx,
                runner_started: AtomicBool::new(false),
                loaded: AtomicBool::new(false),
                io: AsyncMutex::new(()),
                running: ParkingMutex::new(HashSet::new()),
            }
        })
    }

    pub async fn init(&self) -> Result<()> {
        {
            let _guard = self.io.lock().await;
            if !self.loaded.swap(true, Ordering::SeqCst) {
                let groups = load_from_disk().await.unwrap_or_default();
                self.replace_in_memory(groups);
            }
        }
        self.ensure_runner();
        Ok(())
    }

    pub fn list(&self) -> Vec<AutoSwitchGroup> {
        self.groups.read().clone()
    }

    pub async fn replace_all(&self, groups: Vec<AutoSwitchGroup>) -> Result<Vec<AutoSwitchGroup>> {
        let normalized = groups
            .into_iter()
            .filter_map(|group| normalize_group(group).ok())
            .collect::<Vec<_>>();
        self.persist_and_publish(normalized).await
    }

    pub async fn upsert(&self, group: AutoSwitchGroup) -> Result<Vec<AutoSwitchGroup>> {
        let group = normalize_group(group)?;
        let mut next = self.list();
        if let Some(existing) = next.iter_mut().find(|item| item.id == group.id) {
            *existing = group;
        } else {
            next.push(group);
        }
        self.persist_and_publish(next).await
    }

    pub async fn patch(&self, id: &str, patch: AutoSwitchGroupPatch) -> Result<Vec<AutoSwitchGroup>> {
        let mut next = self.list();
        let Some(existing) = next.iter_mut().find(|item| item.id == id) else {
            bail!("auto-switch group not found: {id}");
        };
        if let Some(name) = patch.name {
            existing.name = name;
        }
        if let Some(target) = patch.target_group_name {
            existing.target_group_name = target;
        }
        if let Some(nodes) = patch.nodes {
            existing.nodes = nodes;
        }
        if let Some(enabled) = patch.enabled {
            existing.enabled = enabled;
        }
        if let Some(interval) = patch.interval_seconds {
            existing.interval_seconds = interval;
        }
        if let Some(threshold) = patch.threshold_ms {
            existing.threshold_ms = threshold;
        }
        let normalized = normalize_group(existing.clone())?;
        *existing = normalized;
        self.persist_and_publish(next).await
    }

    pub async fn delete(&self, id: &str) -> Result<Vec<AutoSwitchGroup>> {
        let next = self
            .list()
            .into_iter()
            .filter(|group| group.id != id)
            .collect::<Vec<_>>();
        self.persist_and_publish(next).await
    }

    pub async fn run_once(&self, group: AutoSwitchGroup) -> Result<AutoSwitchRunResult> {
        let group = normalize_group(group)?;
        self.execute_group(&group, true).await
    }

    fn replace_in_memory(&self, groups: Vec<AutoSwitchGroup>) {
        *self.groups.write() = groups.clone();
        let _ = self.groups_tx.send(groups);
    }

    async fn persist_and_publish(&self, groups: Vec<AutoSwitchGroup>) -> Result<Vec<AutoSwitchGroup>> {
        let _guard = self.io.lock().await;
        self.loaded.store(true, Ordering::SeqCst);
        save_to_disk(&groups).await?;
        self.replace_in_memory(groups.clone());
        self.ensure_runner();
        Ok(groups)
    }

    fn ensure_runner(&self) {
        if self.runner_started.swap(true, Ordering::SeqCst) {
            return;
        }
        let mut rx = self.groups_tx.subscribe();
        AsyncHandler::spawn(move || async move {
            Self::run_scheduler(&mut rx).await;
        });
    }

    async fn run_scheduler(rx: &mut watch::Receiver<Vec<AutoSwitchGroup>>) {
        let mut handles: HashMap<String, tokio::task::JoinHandle<()>> = HashMap::new();

        loop {
            let snapshot = rx.borrow_and_update().clone();
            let enabled_ids: HashSet<String> = snapshot
                .iter()
                .filter(|group| group.enabled)
                .map(|group| group.id.clone())
                .collect();

            handles.retain(|id, handle| {
                if enabled_ids.contains(id) {
                    true
                } else {
                    handle.abort();
                    false
                }
            });

            for group in snapshot.into_iter().filter(|group| group.enabled) {
                if handles.contains_key(&group.id) {
                    continue;
                }
                let group_id = group.id.clone();
                let handle = tokio::spawn(async move {
                    Self::group_loop(group_id).await;
                });
                handles.insert(group.id.clone(), handle);
            }

            if rx.changed().await.is_err() {
                break;
            }
        }

        for handle in handles.into_values() {
            handle.abort();
        }
    }

    async fn group_loop(group_id: String) {
        tokio::time::sleep(Duration::from_millis(INITIAL_DELAY_MS)).await;

        while let Some(group) = Self::global()
            .list()
            .into_iter()
            .find(|item| item.id == group_id && item.enabled)
        {
            if let Err(err) = Self::global().execute_group(&group, false).await {
                logging!(
                    warn,
                    Type::Timer,
                    "[AutoSwitch] scheduled run failed for {}: {err:#}",
                    group.name
                );
            }

            let Some(still) = Self::global()
                .list()
                .into_iter()
                .find(|item| item.id == group_id && item.enabled)
            else {
                break;
            };

            tokio::time::sleep(Duration::from_secs(u64::from(still.interval_seconds))).await;
        }
    }

    async fn execute_group(&self, group: &AutoSwitchGroup, force: bool) -> Result<AutoSwitchRunResult> {
        if !force && !group.enabled {
            return Ok(AutoSwitchRunResult {
                decision: AutoSwitchDecision::Keep,
                results: Vec::new(),
            });
        }

        {
            let mut running = self.running.lock();
            if !running.insert(group.id.clone()) {
                if force {
                    bail!("auto-switch group is already running: {}", group.id);
                }
                return Ok(AutoSwitchRunResult {
                    decision: AutoSwitchDecision::Keep,
                    results: Vec::new(),
                });
            }
        }
        let _guard = RunningGuard(group.id.clone());

        self.execute_group_inner(group).await
    }

    async fn execute_group_inner(&self, group: &AutoSwitchGroup) -> Result<AutoSwitchRunResult> {
        let view = fetch_proxy_view().await?;
        let mode = current_clash_mode().await;
        let Some(target) = resolve_target_group(&view, &group.target_group_name, &mode) else {
            logging!(
                debug,
                Type::Timer,
                "[AutoSwitch] skip {}: target unavailable ({})",
                group.name,
                group.target_group_name
            );
            bail!("target-unavailable");
        };

        let members = resolve_curated_nodes(&view, target, group);
        if members.is_empty() {
            logging!(
                debug,
                Type::Timer,
                "[AutoSwitch] skip {}: no resolvable nodes",
                group.name
            );
            bail!("no-nodes");
        }

        let timeout = latency_timeout_ms().await;
        let test_url = test_url_for_group(target).await;
        logging!(
            info,
            Type::Timer,
            "[AutoSwitch] testing {}: {} nodes in {} (url={}, timeout={}ms)",
            group.name,
            members.len(),
            target.name,
            test_url,
            timeout
        );

        let results = measure_delays(&members, &test_url, timeout).await;
        let decision = decide_auto_switch(target.now.as_deref(), &results, group.threshold_ms, timeout);

        match &decision {
            AutoSwitchDecision::Keep => {
                logging!(info, Type::Timer, "[AutoSwitch] keep current for {}", group.name);
            }
            AutoSwitchDecision::Switch {
                name,
                best_delay,
                current_delay,
            } => {
                let from = target.now.clone().unwrap_or_else(|| "—".into());
                if target.now.as_deref() != Some(name.as_str()) {
                    logging!(
                        info,
                        Type::Timer,
                        "[AutoSwitch] switch {}: {} -> {} (best={}ms, current={:?})",
                        group.name,
                        from,
                        name,
                        best_delay,
                        current_delay
                    );
                    let previous = target.now.clone();
                    feat::switch_proxy_node(&target.name, name).await;
                    maybe_close_connections(previous.as_deref()).await;
                    notify_switched(&group.name, &from, name, *best_delay);
                }
            }
        }

        Ok(AutoSwitchRunResult { decision, results })
    }
}

struct RunningGuard(String);

impl Drop for RunningGuard {
    fn drop(&mut self) {
        AutoSwitchManager::global().running.lock().remove(&self.0);
    }
}

fn config_path() -> Result<PathBuf> {
    Ok(dirs::app_home_dir()?.join(AUTO_SWITCH_FILE))
}

async fn load_from_disk() -> Result<Vec<AutoSwitchGroup>> {
    let path = config_path()?;
    if !tokio::fs::try_exists(&path).await.unwrap_or(false) {
        return Ok(Vec::new());
    }
    let file: AutoSwitchFile = help::read_yaml(&path).await?;
    Ok(file
        .groups
        .into_iter()
        .filter_map(|group| normalize_group(group).ok())
        .collect())
}

async fn save_to_disk(groups: &[AutoSwitchGroup]) -> Result<()> {
    let path = config_path()?;
    if let Some(parent) = path.parent() {
        tokio::fs::create_dir_all(parent).await?;
    }
    help::save_yaml_atomic(
        &path,
        &AutoSwitchFile {
            groups: groups.to_vec(),
        },
        Some("# Clash Verge Auto Switch"),
    )
    .await
}

fn normalize_group(mut group: AutoSwitchGroup) -> Result<AutoSwitchGroup> {
    if group.id.trim().is_empty() {
        bail!("auto-switch group id is required");
    }
    group.name = group.name.trim().to_owned();
    if group.name.is_empty() {
        group.name = "Untitled".into();
    }
    group.target_group_name = group.target_group_name.trim().to_owned();
    group.nodes = group
        .nodes
        .into_iter()
        .filter(|node| !node.name.trim().is_empty())
        .map(|node| ProxyNodeBinding {
            name: node.name.trim().to_owned(),
            source: node.source,
        })
        .collect();
    group.interval_seconds = group.interval_seconds.clamp(MIN_INTERVAL_SECONDS, MAX_INTERVAL_SECONDS);
    group.threshold_ms = group.threshold_ms.clamp(MIN_THRESHOLD_MS, MAX_THRESHOLD_MS);
    Ok(group)
}

fn runtime_group_order(config: Option<&Mapping>) -> Vec<String> {
    let mut seen = HashSet::new();
    config
        .and_then(|config| config.get("proxy-groups"))
        .and_then(|groups| groups.as_sequence())
        .into_iter()
        .flatten()
        .filter_map(|group| group.get("name"))
        .filter_map(|name| name.as_str())
        .filter(|name| !name.is_empty() && *name != "GLOBAL")
        .filter(|name| seen.insert((*name).to_owned()))
        .map(str::to_owned)
        .collect()
}

async fn fetch_proxy_view() -> Result<ProxyViewV1> {
    let runtime = Config::runtime().await;
    let latest_runtime = runtime.latest_arc();
    let runtime_group_order = runtime_group_order(latest_runtime.config.as_ref());

    let mihomo = Handle::mihomo();
    let (proxies, providers) = tokio::join!(mihomo.get_proxies(), mihomo.get_proxy_providers());
    let proxies = proxies.context("failed to fetch proxies from mihomo")?;

    Ok(ProxyViewBuilder::build(ProxyViewInput {
        runtime_group_order,
        proxies,
        providers: providers.ok(),
    }))
}

async fn current_clash_mode() -> String {
    if let Ok(config) = Handle::mihomo().get_base_config().await {
        let mode = config.mode.to_string().to_lowercase();
        if !mode.is_empty() {
            return mode;
        }
    }
    Config::clash()
        .await
        .data_arc()
        .get_mode()
        .map(|mode| mode.to_lowercase())
        .unwrap_or_else(|| "rule".into())
}

async fn latency_timeout_ms() -> u32 {
    let timeout = Config::verge()
        .await
        .latest_arc()
        .default_latency_timeout
        .unwrap_or(DEFAULT_DELAY_TIMEOUT_MS as i16);
    if timeout <= 0 {
        DEFAULT_DELAY_TIMEOUT_MS
    } else {
        timeout as u32
    }
}

async fn test_url_for_group(group: &crate::core::proxy_view::ProxyGroupView) -> String {
    if let Some(url) = group.test_url.as_ref().filter(|url| !url.is_empty()) {
        return url.clone();
    }
    Config::verge()
        .await
        .latest_arc()
        .default_latency_test
        .as_ref()
        .map(|url| url.as_str())
        .filter(|url| !url.is_empty())
        .map(str::to_owned)
        .unwrap_or_else(|| DEFAULT_TEST_URL.to_owned())
}

const fn is_selectable_type(proxy_type: &ProxyType) -> bool {
    matches!(
        proxy_type,
        ProxyType::Selector | ProxyType::URLTest | ProxyType::Fallback
    )
}

fn lookup_group<'a>(view: &'a ProxyViewV1, name: &str) -> Option<&'a crate::core::proxy_view::ProxyGroupView> {
    if view.global.as_ref().is_some_and(|group| group.name == name) {
        return view.global.as_ref();
    }
    view.groups.iter().find(|group| group.name == name)
}

fn resolve_target_group<'a>(
    view: &'a ProxyViewV1,
    target_group_name: &str,
    mode: &str,
) -> Option<&'a crate::core::proxy_view::ProxyGroupView> {
    if mode == "global" {
        return view.global.as_ref();
    }
    if mode == "direct" {
        return None;
    }
    let group = lookup_group(view, target_group_name)?;
    if !is_selectable_type(&group.proxy_type) {
        return None;
    }
    Some(group)
}

fn same_source(left: &ProxyNodeSource, right: &ProxyNodeSource) -> bool {
    match (left, right) {
        (ProxyNodeSource::Core { proxy_name: left_name }, ProxyNodeSource::Core { proxy_name: right_name }) => {
            left_name == right_name
        }
        (
            ProxyNodeSource::Provider {
                provider_name: left_provider,
                proxy_name: left_name,
            },
            ProxyNodeSource::Provider {
                provider_name: right_provider,
                proxy_name: right_name,
            },
        ) => left_provider == right_provider && left_name == right_name,
        _ => false,
    }
}

fn rebind_node<'a>(candidates: &[&'a ProxyNodeView], binding: &ProxyNodeBinding) -> Option<&'a ProxyNodeView> {
    let matches = candidates
        .iter()
        .copied()
        .filter(|node| {
            node.name == binding.name
                && binding
                    .source
                    .as_ref()
                    .is_none_or(|source| same_source(&node.source, source))
        })
        .collect::<Vec<_>>();
    let mut unique = HashMap::new();
    for node in matches {
        unique.insert(node.record_id.as_str(), node);
    }
    if unique.len() == 1 {
        unique.into_values().next()
    } else {
        None
    }
}

fn resolve_group_node_candidates<'a>(
    view: &'a ProxyViewV1,
    group: &crate::core::proxy_view::ProxyGroupView,
) -> Vec<&'a ProxyNodeView> {
    let mut nodes = Vec::new();
    let mut seen = HashSet::new();
    for member in &group.members {
        let ProxyMemberRef::Node { record_id, .. } = member else {
            continue;
        };
        let Some(node) = view.records.get(record_id) else {
            continue;
        };
        if seen.insert(node.record_id.as_str()) {
            nodes.push(node);
        }
    }
    nodes
}

struct CuratedNode<'a> {
    display_name: String,
    api_name: String,
    provider_name: Option<&'a str>,
}

fn resolve_curated_nodes<'a>(
    view: &'a ProxyViewV1,
    group: &crate::core::proxy_view::ProxyGroupView,
    curated: &AutoSwitchGroup,
) -> Vec<CuratedNode<'a>> {
    let candidates = resolve_group_node_candidates(view, group);
    let mut members = Vec::new();
    for binding in &curated.nodes {
        let Some(node) = rebind_node(&candidates, binding) else {
            continue;
        };
        let (api_name, provider_name) = match &node.source {
            ProxyNodeSource::Core { proxy_name } => (proxy_name.clone(), None),
            ProxyNodeSource::Provider {
                provider_name,
                proxy_name,
            } => (proxy_name.clone(), Some(provider_name.as_str())),
        };
        members.push(CuratedNode {
            display_name: node.name.clone(),
            api_name,
            provider_name,
        });
    }
    members
}

const fn classify_delay(delay: u32, timeout: u32) -> &'static str {
    if delay > IMPLAUSIBLE_DELAY {
        "error"
    } else if delay == 0 || delay >= timeout {
        "timeout"
    } else {
        "measured"
    }
}

pub(crate) fn decide_auto_switch(
    current_name: Option<&str>,
    results: &[DelaySample],
    threshold_ms: u32,
    timeout: u32,
) -> AutoSwitchDecision {
    let mut measured = results
        .iter()
        .filter(|sample| classify_delay(sample.delay, timeout) == "measured")
        .cloned()
        .collect::<Vec<_>>();
    measured.sort_by_key(|sample| sample.delay);

    let Some(best) = measured.first().cloned() else {
        return AutoSwitchDecision::Keep;
    };

    let current = current_name.and_then(|name| measured.iter().find(|sample| sample.name == name).cloned());

    let Some(current) = current else {
        if best.name == current_name.unwrap_or_default() {
            return AutoSwitchDecision::Keep;
        }
        return AutoSwitchDecision::Switch {
            name: best.name,
            best_delay: best.delay,
            current_delay: None,
        };
    };

    if best.name == current.name {
        return AutoSwitchDecision::Keep;
    }

    let improvement = current.delay.saturating_sub(best.delay);
    if improvement < threshold_ms {
        return AutoSwitchDecision::Keep;
    }

    AutoSwitchDecision::Switch {
        name: best.name,
        best_delay: best.delay,
        current_delay: Some(current.delay),
    }
}

async fn measure_delays(members: &[CuratedNode<'_>], test_url: &str, timeout: u32) -> Vec<DelaySample> {
    let mut results = Vec::with_capacity(members.len());
    let mut pending = FuturesUnordered::new();
    let mut index = 0;

    while index < members.len() || !pending.is_empty() {
        while pending.len() < DELAY_CONCURRENCY && index < members.len() {
            let member = &members[index];
            index += 1;
            let display_name = member.display_name.clone();
            let api_name = member.api_name.clone();
            let provider_name = member.provider_name.map(str::to_owned);
            let test_url = test_url.to_owned();
            pending.push(async move {
                let delay = match provider_name {
                    Some(provider) => Handle::mihomo()
                        .healthcheck_node_in_provider(&provider, &api_name, &test_url, timeout)
                        .await
                        .map(|result| result.delay)
                        .unwrap_or(1_000_000),
                    None => Handle::mihomo()
                        .delay_proxy_by_name(&api_name, &test_url, timeout)
                        .await
                        .map(|result| result.delay)
                        .unwrap_or(1_000_000),
                };
                DelaySample {
                    name: display_name,
                    delay,
                }
            });
        }

        if let Some(sample) = pending.next().await {
            results.push(sample);
        }
    }

    results
}

async fn maybe_close_connections(previous_proxy: Option<&str>) {
    let Some(previous) = previous_proxy.filter(|name| !name.is_empty()) else {
        return;
    };
    let auto_close = Config::verge()
        .await
        .latest_arc()
        .auto_close_connection
        .unwrap_or(false);
    if !auto_close {
        return;
    }

    let mihomo = Handle::mihomo();
    let Ok(connections) = mihomo.get_connections().await else {
        return;
    };
    let Some(list) = connections.connections else {
        return;
    };
    for connection in list {
        if connection.chains.iter().any(|hop| hop == previous) {
            let _ = mihomo.close_connection(&connection.id).await;
        }
    }
}

fn notify_switched(group: &str, from: &str, to: &str, delay: u32) {
    let payload = serde_json::json!({
        "group": group,
        "from": from,
        "to": to,
        "delay": delay,
    });
    Handle::notice_message("auto_switch::switched", payload.to_string());
}

#[cfg(test)]
mod tests {
    use super::{AutoSwitchDecision, DelaySample, decide_auto_switch};

    #[test]
    fn keeps_when_improvement_below_threshold() {
        assert!(matches!(
            decide_auto_switch(
                Some("a"),
                &[
                    DelaySample {
                        name: "a".into(),
                        delay: 120
                    },
                    DelaySample {
                        name: "b".into(),
                        delay: 90
                    },
                ],
                50,
                10_000,
            ),
            AutoSwitchDecision::Keep
        ));
    }

    #[test]
    fn switches_when_improvement_meets_threshold() {
        assert!(matches!(
            decide_auto_switch(
                Some("a"),
                &[
                    DelaySample {
                        name: "a".into(),
                        delay: 160,
                    },
                    DelaySample {
                        name: "b".into(),
                        delay: 90,
                    },
                ],
                50,
                10_000,
            ),
            AutoSwitchDecision::Switch {
                name,
                best_delay,
                current_delay,
            } if name == "b" && best_delay == 90 && current_delay == Some(160)
        ));
    }

    #[test]
    fn switches_when_current_outside_set() {
        assert!(matches!(
            decide_auto_switch(
                Some("outside"),
                &[
                    DelaySample {
                        name: "a".into(),
                        delay: 140,
                    },
                    DelaySample {
                        name: "b".into(),
                        delay: 80,
                    },
                ],
                50,
                10_000,
            ),
            AutoSwitchDecision::Switch {
                name,
                best_delay,
                current_delay,
            } if name == "b" && best_delay == 80 && current_delay.is_none()
        ));
    }

    #[test]
    fn ignores_timeouts_and_errors() {
        assert!(matches!(
            decide_auto_switch(
                Some("a"),
                &[
                    DelaySample {
                        name: "a".into(),
                        delay: 200,
                    },
                    DelaySample {
                        name: "dead".into(),
                        delay: 0,
                    },
                    DelaySample {
                        name: "err".into(),
                        delay: 1_000_000,
                    },
                    DelaySample {
                        name: "b".into(),
                        delay: 110,
                    },
                ],
                0,
                10_000,
            ),
            AutoSwitchDecision::Switch { name, best_delay, .. } if name == "b" && best_delay == 110
        ));
    }

    #[test]
    fn keeps_when_no_measured_results() {
        assert!(matches!(
            decide_auto_switch(
                Some("a"),
                &[
                    DelaySample {
                        name: "a".into(),
                        delay: 0
                    },
                    DelaySample {
                        name: "b".into(),
                        delay: 1_000_000
                    },
                ],
                0,
                10_000,
            ),
            AutoSwitchDecision::Keep
        ));
    }
}
