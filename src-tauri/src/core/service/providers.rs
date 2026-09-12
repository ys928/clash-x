use super::*;

pub(crate) static PROVIDER_SYNC_QUEUED: AtomicBool = AtomicBool::new(false);
pub(crate) static PROVIDER_SYNC_SERIAL: Lazy<tokio::sync::Mutex<()>> = Lazy::new(|| tokio::sync::Mutex::new(()));
pub(crate) static SYNC_TEMP_SEQUENCE: AtomicU64 = AtomicU64::new(0);
pub(crate) const RUNTIME_PROVIDER_SYNC_ATTEMPTS: u32 = 4;
pub(crate) const CONTENT_COMPARE_CHUNK: usize = 64 * 1024;

pub(crate) fn request_runtime_provider_sync(delay: Duration) {
    if PROVIDER_SYNC_QUEUED.swap(true, Ordering::AcqRel) {
        return;
    }
    AsyncHandler::spawn(move || async move {
        tokio::time::sleep(delay).await;
        for attempt in 1..=RUNTIME_PROVIDER_SYNC_ATTEMPTS {
            let outcome = {
                let _serial = PROVIDER_SYNC_SERIAL.lock().await;
                if attempt == 1 {
                    PROVIDER_SYNC_QUEUED.store(false, Ordering::Release);
                }
                sync_runtime_providers_by_service().await
            };
            match outcome {
                Ok(ProviderSync { pending: 0, .. }) => return,
                Ok(ProviderSync { pending, .. }) if attempt < RUNTIME_PROVIDER_SYNC_ATTEMPTS => {
                    logging!(
                        info,
                        Type::Service,
                        "{pending} provider caches are not ready yet; retrying"
                    );
                }
                Ok(ProviderSync { pending, .. }) => {
                    logging!(warn, Type::Service, "{pending} provider caches were not synced");
                    return;
                }
                Err(error) => {
                    logging!(
                        warn,
                        Type::Service,
                        "failed to sync provider caches from the service: {error:#}"
                    );
                    return;
                }
            }
            tokio::time::sleep(constants::timing::RUNTIME_PROVIDER_SYNC_RETRY_DELAY).await;
        }
    });
}

#[derive(Debug, Default)]
pub(crate) struct ProviderSync {
    synced: usize,
    pending: usize,
}

pub(crate) struct FetchedCache {
    declared: RemoteProviderRef,
    temp: PathBuf,
    len: u64,
    mtime_ns: Option<u64>,
}

/// Core load timestamps keyed by provider section and name.
pub(crate) type ProviderLoadTimes = HashMap<(&'static str, String), Option<u64>>;

#[tracing::instrument(level = "info", fields(synced = tracing::field::Empty, pending = tracing::field::Empty))]
pub(crate) async fn sync_runtime_providers_by_service() -> Result<ProviderSync> {
    if !active_service_supports_runtime_file_read() {
        return Ok(ProviderSync::default());
    }
    let credentials = current_owner_credentials()?;
    let session = active_service_session()?;
    let app_dir = dirs::app_home_dir()?;
    let runtime = Config::runtime().await;
    let mut outcome = ProviderSync::default();

    let loaded_before = provider_load_times().await;
    let mut fetched = Vec::new();
    for declared in applied_remote_providers(&runtime, &app_dir)? {
        let (temp, file) = match create_sync_temp(&app_dir.join(&declared.provider.destination)).await {
            Ok(created) => created,
            Err(error) => {
                logging!(warn, Type::Service, "{error:#}");
                outcome.pending += 1;
                continue;
            }
        };
        match fetch_runtime_file(&credentials, &session, &declared.provider.destination, file).await {
            Ok(Fetch::Complete { len, mtime_ns }) => fetched.push(FetchedCache {
                declared,
                temp,
                len,
                mtime_ns,
            }),
            Ok(Fetch::NotReady) => {
                outcome.pending += 1;
                remove_temp(&temp).await;
            }
            Ok(Fetch::SessionLost) => {
                remove_temp(&temp).await;
                discard_fetched(fetched).await;
                bail!("the service session ended while provider caches were being read");
            }
            Err(error) => {
                logging!(
                    warn,
                    Type::Service,
                    "provider cache {} was not read: {error:#}",
                    declared.provider.destination
                );
                outcome.pending += 1;
                remove_temp(&temp).await;
            }
        }
    }

    let (loaded_before, loaded_after) = match (loaded_before, provider_load_times().await) {
        (Ok(before), Ok(after)) => (before, after),
        (Err(error), _) | (_, Err(error)) => {
            logging!(warn, Type::Service, "provider caches were not synced: {error:#}");
            outcome.pending += fetched.len();
            discard_fetched(fetched).await;
            return Ok(outcome);
        }
    };
    let mut ready = Vec::new();
    for cache in fetched {
        let key = (cache.declared.section, cache.declared.name.clone());
        let updated_at = loaded_after.get(&key).copied().flatten();
        let complete = loaded_before.get(&key) == loaded_after.get(&key)
            && finished_loading(cache.mtime_ns, updated_at)
            && match recheck_identity(&credentials, &session, &cache).await {
                Ok(Fetch::Complete { .. }) => true,
                Ok(Fetch::NotReady) | Err(_) => false,
                Ok(Fetch::SessionLost) => {
                    remove_temp(&cache.temp).await;
                    discard_fetched(ready).await;
                    bail!("the service session ended while provider caches were being verified");
                }
            };
        if complete {
            ready.push(cache);
        } else {
            outcome.pending += 1;
            remove_temp(&cache.temp).await;
        }
    }

    outcome.synced = publish_fetched(&app_dir, &runtime, &session, ready).await?;
    tracing::Span::current().record("synced", outcome.synced);
    tracing::Span::current().record("pending", outcome.pending);
    Ok(outcome)
}

// The on-disk YAML may describe a rejected apply; use the committed runtime.
pub(crate) fn applied_remote_providers(runtime: &Draft<IRuntime>, app_dir: &Path) -> Result<Vec<RemoteProviderRef>> {
    let applied = runtime.data_arc();
    match applied.config.as_ref() {
        Some(config) => remote_providers_of(config, app_dir),
        None => Ok(Vec::new()),
    }
}

// Hold the lifecycle lock through publication to exclude mode and config switches.
pub(crate) async fn publish_fetched(
    app_dir: &Path,
    runtime: &Draft<IRuntime>,
    session: &OwnerSessionProof,
    fetched: Vec<FetchedCache>,
) -> Result<usize> {
    let manager = CoreManager::global();
    let _lifecycle = manager.lifecycle_lock.lock().await;
    let unchanged = matches!(*manager.get_running_mode(), RunningMode::Service)
        && active_service_session().is_ok_and(|current| current == *session);
    let declared = if unchanged {
        match applied_remote_providers(runtime, app_dir) {
            Ok(declared) => declared,
            Err(error) => {
                discard_fetched(fetched).await;
                return Err(error);
            }
        }
    } else {
        Vec::new()
    };
    let mut synced = 0;
    for cache in fetched {
        let target = app_dir.join(&cache.declared.provider.destination);
        if !declared.contains(&cache.declared) || same_contents(&cache.temp, &target).await {
            remove_temp(&cache.temp).await;
            continue;
        }
        match tokio::fs::rename(&cache.temp, &target).await {
            Ok(()) => synced += 1,
            Err(error) => {
                logging!(
                    warn,
                    Type::Service,
                    "provider cache {} was not published: {error}",
                    cache.declared.provider.destination
                );
                remove_temp(&cache.temp).await;
            }
        }
    }
    Ok(synced)
}

pub(crate) enum Fetch {
    Complete { len: u64, mtime_ns: Option<u64> },
    NotReady,
    SessionLost,
}

// mihomo rewrites caches in place; reject changing or recently modified files.
pub(crate) async fn fetch_runtime_file(
    credentials: &OwnerCredentials,
    session: &OwnerSessionProof,
    destination: &str,
    mut file: tokio::fs::File,
) -> Result<Fetch> {
    use tokio::io::AsyncWriteExt as _;

    let mut written = 0_u64;
    let mut identity = None;
    loop {
        let (hex, len, mtime_ns) = match read_chunk(credentials, session, destination, written).await? {
            Some(chunk) => chunk,
            None => return Ok(Fetch::SessionLost),
        };
        let Some((hex, len, mtime_ns)) = hex.map(|hex| (hex, len, mtime_ns)) else {
            return Ok(Fetch::NotReady);
        };
        if len == 0 || !has_settled(mtime_ns) || *identity.get_or_insert((len, mtime_ns)) != (len, mtime_ns) {
            return Ok(Fetch::NotReady);
        }
        if written == len {
            file.flush().await?;
            return Ok(Fetch::Complete { len, mtime_ns });
        }
        let chunk = decode_hex(&hex).context("服务返回了无效的运行时文件")?;
        if chunk.is_empty() {
            bail!("the service returned an empty chunk before the end of the file");
        }
        file.write_all(&chunk).await?;
        written += chunk.len() as u64;
        if written > len {
            return Ok(Fetch::NotReady);
        }
    }
}

pub(crate) async fn recheck_identity(
    credentials: &OwnerCredentials,
    session: &OwnerSessionProof,
    cache: &FetchedCache,
) -> Result<Fetch> {
    let destination = &cache.declared.provider.destination;
    Ok(match read_chunk(credentials, session, destination, cache.len).await? {
        None => Fetch::SessionLost,
        Some((Some(hex), len, mtime_ns)) if hex.is_empty() && (len, mtime_ns) == (cache.len, cache.mtime_ns) => {
            Fetch::Complete { len, mtime_ns }
        }
        Some(_) => Fetch::NotReady,
    })
}

/// Outer `None` means session loss; missing hex means an absent file.
pub(crate) async fn read_chunk(
    credentials: &OwnerCredentials,
    session: &OwnerSessionProof,
    destination: &str,
    offset: u64,
) -> Result<Option<(Option<String>, u64, Option<u64>)>> {
    let request = RuntimeFileRequest {
        destination: destination.to_owned(),
        offset,
    };
    let response = clash_verge_service_ipc::read_runtime_file(credentials, session, &request)
        .await
        .context("无法连接到Clash Verge Service")?;
    if response.code == ServiceErrorCode::NotActive as u16
        || response.code == ServiceErrorCode::StaleOwnerSession as u16
    {
        return Ok(None);
    }
    if response.code > 0 {
        bail!(response.message);
    }
    Ok(Some(match response.data.context("服务未返回运行时文件")? {
        RuntimeFileOutcome::Absent => (None, 0, None),
        RuntimeFileOutcome::Chunk { hex, len, mtime_ns } => (Some(hex), len, mtime_ns),
    }))
}

// updatedAt changes after cache writes; compare it before and after readback.
pub(crate) async fn provider_load_times() -> Result<ProviderLoadTimes> {
    let mihomo = Handle::mihomo();
    let (rules, proxies) = tokio::join!(mihomo.get_rule_providers(), mihomo.get_proxy_providers());
    let rules = rules.map_err(|error| anyhow!("failed to query rule providers: {error}"))?;
    let proxies = proxies.map_err(|error| anyhow!("failed to query proxy providers: {error}"))?;
    let mut loaded = ProviderLoadTimes::new();
    for (name, provider) in rules.providers {
        loaded.insert(("rule-providers", name), epoch_nanos(&provider.updated_at));
    }
    for (name, provider) in proxies.providers {
        loaded.insert(
            ("proxy-providers", name),
            provider.updated_at.as_deref().and_then(epoch_nanos),
        );
    }
    Ok(loaded)
}

pub(crate) fn epoch_nanos(rfc3339: &str) -> Option<u64> {
    let parsed = chrono::DateTime::parse_from_rfc3339(rfc3339).ok()?;
    u64::try_from(parsed.timestamp_nanos_opt()?).ok()
}

// Allow timestamp granularity; missing load times fall back to settling.
// Windows may retain the old mtime until a writer closes its handle.
pub(crate) fn finished_loading(mtime_ns: Option<u64>, updated_at_ns: Option<u64>) -> bool {
    match (mtime_ns, updated_at_ns) {
        (Some(mtime), Some(updated_at)) => {
            u128::from(mtime) <= u128::from(updated_at) + constants::timing::RUNTIME_PROVIDER_SETTLE.as_nanos()
        }
        _ => true,
    }
}

pub(crate) fn has_settled(mtime_ns: Option<u64>) -> bool {
    let Some(mtime_ns) = mtime_ns else {
        return true;
    };
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |since_epoch| since_epoch.as_nanos());
    now.saturating_sub(u128::from(mtime_ns)) >= constants::timing::RUNTIME_PROVIDER_SETTLE.as_nanos()
}

// Exclusive creation protects existing files from truncation and cleanup.
pub(crate) async fn create_sync_temp(target: &Path) -> Result<(PathBuf, tokio::fs::File)> {
    if let Some(parent) = target.parent() {
        tokio::fs::create_dir_all(parent).await?;
    }
    let name = target
        .file_name()
        .map(|name| name.to_string_lossy())
        .unwrap_or_default();
    for _ in 0..8 {
        let sequence = SYNC_TEMP_SEQUENCE.fetch_add(1, Ordering::Relaxed);
        let temp = target.with_file_name(format!(".{name}.sync-{}-{sequence}.tmp", std::process::id()));
        match tokio::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temp)
            .await
        {
            Ok(file) => return Ok((temp, file)),
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {}
            Err(error) => {
                return Err(error).with_context(|| format!("failed to create {}", temp.display()));
            }
        }
    }
    bail!("no free temporary name beside {}", target.display())
}

pub(crate) async fn same_contents(temp: &Path, target: &Path) -> bool {
    use tokio::io::AsyncReadExt as _;

    let (Ok(mut left), Ok(mut right)) = (tokio::fs::File::open(temp).await, tokio::fs::File::open(target).await) else {
        return false;
    };
    let (Ok(left_meta), Ok(right_meta)) = (left.metadata().await, right.metadata().await) else {
        return false;
    };
    if left_meta.len() != right_meta.len() {
        return false;
    }
    let mut remaining = left_meta.len();
    let mut left_buf = vec![0_u8; CONTENT_COMPARE_CHUNK];
    let mut right_buf = vec![0_u8; CONTENT_COMPARE_CHUNK];
    while remaining > 0 {
        let take = usize::try_from(remaining).map_or(CONTENT_COMPARE_CHUNK, |rest| rest.min(CONTENT_COMPARE_CHUNK));
        if left.read_exact(&mut left_buf[..take]).await.is_err()
            || right.read_exact(&mut right_buf[..take]).await.is_err()
        {
            return false;
        }
        if left_buf[..take] != right_buf[..take] {
            return false;
        }
        remaining -= take as u64;
    }
    true
}

pub(crate) async fn remove_temp(temp: &Path) {
    let _ = tokio::fs::remove_file(temp).await;
}

pub(crate) async fn discard_fetched(fetched: Vec<FetchedCache>) {
    for cache in fetched {
        remove_temp(&cache.temp).await;
    }
}
