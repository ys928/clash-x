#![allow(clippy::expect_used, clippy::panic, reason = "tests assert by panicking")]
use super::{
    ServiceHealth, ServiceStatus, capture_generation_before, claim_owner_recovery_generation,
    generate_service_session_token, macos_install_shell, mark_service_unavailable_after_owner_loss,
    owner_recovery_policy, service_core_path_for, session_matches_status,
};
#[cfg(unix)]
use super::{service_core_path_for_with_publisher, service_tool_path_for};
use crate::core::runstate::{FakeEnv, OwnerRecoveryReason, PendingAction, RunStateStore};
use anyhow::bail;
use clash_verge_service_ipc::OwnerSessionProof;
#[cfg(unix)]
use std::cell::Cell;
use std::{
    path::{Path, PathBuf},
    sync::atomic::{AtomicU64, Ordering},
};

/// A Run State backed by a scripted environment, so these tests never touch the global.
fn fake_store() -> RunStateStore<FakeEnv> {
    RunStateStore::new(FakeEnv::new())
}

/// The legacy single-slot view of a store, for assertions carried over from before the split.
fn status_of(store: &RunStateStore<FakeEnv>) -> ServiceStatus {
    ServiceStatus::from_run_state(&store.state())
}

async fn status_of_settled(store: &RunStateStore<FakeEnv>) -> ServiceStatus {
    ServiceStatus::from_run_state(&store.settled().await)
}

static TEST_DIRECTORY_GENERATION: AtomicU64 = AtomicU64::new(0);

struct TestDirectory(PathBuf);

impl TestDirectory {
    fn new(label: &str) -> anyhow::Result<Self> {
        let generation = TEST_DIRECTORY_GENERATION.fetch_add(1, Ordering::Relaxed);
        let path = std::env::temp_dir().join(format!(
            "clash-verge-rev-service-{label}-{}-{generation}",
            std::process::id()
        ));
        std::fs::create_dir(&path)?;
        Ok(Self(path))
    }

    fn path(&self) -> &Path {
        &self.0
    }
}

impl Drop for TestDirectory {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

fn staging_directory(home: &Path) -> PathBuf {
    home.join("Applications/.clash-verge-rev-dev/service-core")
}

#[cfg(unix)]
fn service_tools_staging_directory(home: &Path) -> PathBuf {
    home.join("Applications/.clash-verge-rev-dev/service-tools")
}

#[cfg(unix)]
fn staging_temporary_entries(home: &Path, core_name: &str) -> anyhow::Result<Vec<PathBuf>> {
    let directory = staging_directory(home);
    if !directory.exists() {
        return Ok(Vec::new());
    }
    Ok(std::fs::read_dir(directory)?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| {
            path.file_name()
                .and_then(|name| name.to_str())
                .is_some_and(|name| name.starts_with(&format!(".{core_name}.")) && name.ends_with(".tmp"))
        })
        .collect())
}

#[test]
fn nondevelopment_service_core_selection_preserves_sibling_without_staging() -> anyhow::Result<()> {
    let root = TestDirectory::new("release-path")?;
    let home = root.path().join("home");
    let source = root.path().join("target/debug/verge-mihomo");

    let selected = service_core_path_for(&source, Some(&home), false)?;

    assert_eq!(selected, source);
    assert!(!staging_directory(&home).exists());
    Ok(())
}

#[cfg(unix)]
#[test]
fn development_service_core_uses_exact_layout_and_executable_bytes() -> anyhow::Result<()> {
    use std::os::unix::fs::PermissionsExt as _;

    let root = TestDirectory::new("development-path")?;
    let home = root.path().join("home");
    let source = root.path().join("verge-mihomo");
    std::fs::write(&source, b"development core")?;

    let selected = service_core_path_for(&source, Some(&home), true)?;

    assert_eq!(
        selected,
        home.join("Applications/.clash-verge-rev-dev/service-core/verge-mihomo")
    );
    assert_eq!(std::fs::read(&selected)?, b"development core");
    let metadata = std::fs::symlink_metadata(&selected)?;
    assert!(metadata.file_type().is_file());
    assert_ne!(metadata.permissions().mode() & 0o111, 0);
    Ok(())
}

#[cfg(unix)]
#[test]
fn development_service_tool_uses_safe_layout_and_executable_bytes() -> anyhow::Result<()> {
    use std::os::unix::fs::PermissionsExt as _;

    let root = TestDirectory::new("development-service-tool")?;
    let home = root.path().join("home");
    let source = root.path().join("clash-verge-service-install");
    std::fs::write(&source, b"development installer")?;

    let selected = service_tool_path_for(&source, Some(&home), true)?;

    assert_eq!(
        selected,
        service_tools_staging_directory(&home).join("clash-verge-service-install")
    );
    assert_eq!(std::fs::read(&selected)?, b"development installer");
    assert_ne!(std::fs::metadata(&selected)?.permissions().mode() & 0o111, 0);
    Ok(())
}

#[test]
fn macos_install_shell_starts_from_root_without_nested_sudo() {
    let shell = macos_install_shell(Path::new("/safe/service-tools/clash-verge-service-install"), 20);

    assert_eq!(
        shell,
        "cd /; CLASH_VERGE_SERVICE_GID=20 '/safe/service-tools/clash-verge-service-install'"
    );
    assert!(!shell.contains("sudo"));
}

#[cfg(unix)]
#[test]
fn development_service_core_refresh_atomically_replaces_bytes() -> anyhow::Result<()> {
    let root = TestDirectory::new("refresh")?;
    let home = root.path().join("home");
    let source = root.path().join("verge-mihomo");
    std::fs::write(&source, b"first core")?;
    let selected = service_core_path_for(&source, Some(&home), true)?;
    assert_eq!(
        selected,
        home.join("Applications/.clash-verge-rev-dev/service-core/verge-mihomo")
    );

    std::fs::write(&source, b"second core")?;
    let refreshed = service_core_path_for(&source, Some(&home), true)?;

    assert_eq!(refreshed, selected);
    assert_eq!(std::fs::read(&refreshed)?, b"second core");
    assert!(staging_temporary_entries(&home, "verge-mihomo")?.is_empty());
    Ok(())
}

#[cfg(unix)]
#[test]
fn failed_development_refresh_preserves_good_core_and_cleans_temporary_entry() -> anyhow::Result<()> {
    let root = TestDirectory::new("failed-refresh")?;
    let home = root.path().join("home");
    let source = root.path().join("verge-mihomo");
    std::fs::write(&source, b"known good core")?;
    let selected = service_core_path_for(&source, Some(&home), true)?;

    std::fs::write(&source, b"replacement core")?;
    let publish_attempted = Cell::new(false);
    let result =
        service_core_path_for_with_publisher(&source, Some(&home), true, "service-core", |temporary, final_path| {
            publish_attempted.set(true);
            assert_ne!(temporary, final_path, "publisher must receive the temporary path");
            assert!(std::fs::symlink_metadata(temporary)?.file_type().is_file());
            assert_eq!(std::fs::read(temporary)?, b"replacement core");
            anyhow::bail!("injected post-creation publish failure")
        });
    let error = match result {
        Ok(path) => anyhow::bail!("failed publication selected {}", path.display()),
        Err(error) => error.to_string(),
    };

    assert!(publish_attempted.get());
    assert!(error.contains("injected post-creation publish failure"));
    assert_eq!(std::fs::read(&selected)?, b"known good core");
    assert!(staging_temporary_entries(&home, "verge-mihomo")?.is_empty());
    Ok(())
}

#[cfg(unix)]
#[test]
fn development_service_core_replaces_final_symlink_without_following_it() -> anyhow::Result<()> {
    use std::os::unix::fs::symlink;

    let root = TestDirectory::new("symlink")?;
    let home = root.path().join("home");
    let source = root.path().join("verge-mihomo");
    std::fs::write(&source, b"selected core")?;
    let final_path = home.join("Applications/.clash-verge-rev-dev/service-core/verge-mihomo");
    std::fs::create_dir_all(final_path.parent().unwrap_or_else(|| Path::new(".")))?;
    let symlink_target = root.path().join("must-not-change");
    std::fs::write(&symlink_target, b"target bytes")?;
    symlink(&symlink_target, &final_path)?;

    let selected = service_core_path_for(&source, Some(&home), true)?;

    assert_eq!(selected, final_path);
    assert!(std::fs::symlink_metadata(&selected)?.file_type().is_file());
    assert_eq!(std::fs::read(&selected)?, b"selected core");
    assert_eq!(std::fs::read(&symlink_target)?, b"target bytes");
    Ok(())
}

#[test]
fn mismatched_active_generation_displaces_local_session() {
    let proof = OwnerSessionProof {
        generation: 7,
        token: "11".repeat(32),
    };
    assert!(session_matches_status(&proof, true, Some(7)));
    assert!(!session_matches_status(&proof, true, Some(8)));
    assert!(!session_matches_status(&proof, false, Some(7)));
}

#[test]
fn a_stale_monitor_cannot_displace_a_newer_session() {
    // Sample classification now lives in `core::runstate::owner`; what stays here is the
    // guard that stops a monitor from a previous Core from tearing down the current one.
    let generation = AtomicU64::new(8);
    let newer_proof = OwnerSessionProof {
        generation: 8,
        token: "22".repeat(32),
    };
    let session = parking_lot::Mutex::new(Some(newer_proof.clone()));

    // A monitor started at generation 7 decides it has been displaced and tries to recover.
    if claim_owner_recovery_generation(&generation, 7).is_some() {
        session.lock().take();
    }

    assert_eq!(generation.load(Ordering::Acquire), 8, "the newer generation stands");
    assert_eq!(session.lock().as_ref(), Some(&newer_proof));
}

#[test]
fn generated_service_session_token_is_lower_hex() -> anyhow::Result<()> {
    let token = generate_service_session_token()?;
    assert_eq!(token.len(), 64);
    assert!(
        token
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
    );
    Ok(())
}

#[test]
fn macos_recovery_never_resets_machine_wide_proxy() {
    for reason in [
        OwnerRecoveryReason::Displaced,
        OwnerRecoveryReason::SameOwnerFailure,
        OwnerRecoveryReason::TransportFailure,
    ] {
        assert!(!owner_recovery_policy(reason, true).reset_system_proxy);
        assert!(owner_recovery_policy(reason, false).reset_system_proxy);
    }

    let generation = AtomicU64::new(7);
    assert_eq!(claim_owner_recovery_generation(&generation, 7), Some(8));
    assert_eq!(generation.load(Ordering::Acquire), 8);
    assert_eq!(claim_owner_recovery_generation(&generation, 7), None);
}

#[test]
fn cached_readiness_reflects_confirmed_state_without_mutating_it() {
    let store = fake_store();
    store.observe(ServiceHealth::Ready);
    let generation = store.generation_count();

    assert!(store.state().service_usable());
    assert_eq!(status_of(&store), ServiceStatus::Ready);
    assert_eq!(store.generation_count(), generation, "reading must not change state");

    store.observe(ServiceHealth::NotInstalled);
    assert!(!store.state().service_usable());
    assert_eq!(status_of(&store), ServiceStatus::NotInstalled);
    assert_eq!(store.generation_count(), generation + 1);
}

#[test]
fn cached_readiness_is_false_while_a_service_operation_is_running() {
    let store = fake_store();
    store.observe(ServiceHealth::Ready);
    let _operation = store.begin_operation().expect("slot should be free");

    assert!(!store.state().service_usable());
    // The confirmed observation survives — only usability is withheld.
    assert_eq!(status_of(&store), ServiceStatus::Ready);
}

#[tokio::test]
async fn service_operation_finishes_before_post_operation_refresh() {
    let store = fake_store();

    let result = super::run_operation_and_then(
        &store,
        async {
            store.observe(ServiceHealth::Ready);
            Ok(())
        },
        || async {
            assert!(!store.operation_in_flight());
            assert_eq!(status_of_settled(&store).await, ServiceStatus::Ready);
            Ok(())
        },
    )
    .await;

    assert!(result.is_ok());
}

#[tokio::test]
async fn owner_generation_is_captured_before_async_request_runs() {
    let generation = AtomicU64::new(7);
    let (captured, response) = capture_generation_before(&generation, || async {
        generation.store(8, Ordering::Release);
        "not-active"
    })
    .await;

    assert_eq!(captured, 7);
    assert_eq!(response, "not-active");
    assert_eq!(generation.load(Ordering::Acquire), 8);
}

#[test]
fn only_transport_owner_loss_marks_cached_readiness_unavailable() {
    for reason in [OwnerRecoveryReason::Displaced, OwnerRecoveryReason::SameOwnerFailure] {
        let store = fake_store();
        store.observe(ServiceHealth::Ready);
        let generation = store.generation_count();

        mark_service_unavailable_after_owner_loss(&store, reason);

        assert!(store.state().service_usable(), "{reason:?} must not affect readiness");
        assert_eq!(status_of(&store), ServiceStatus::Ready);
        assert_eq!(store.generation_count(), generation);
    }

    let store = fake_store();
    store.observe(ServiceHealth::Ready);

    mark_service_unavailable_after_owner_loss(&store, OwnerRecoveryReason::TransportFailure);

    assert!(!store.state().service_usable());
    assert!(matches!(
        status_of(&store),
        ServiceStatus::Unavailable(reason) if reason.contains("service control IPC unavailable")
    ));
}

#[cfg(target_os = "macos")]
#[test]
fn legacy_socket_alone_is_not_install_evidence() {
    assert!(
        !super::macos_service_install_markers()
            .iter()
            .any(|marker| marker == "/tmp/verge/clash-verge-service.sock")
    );
}

#[test]
fn failed_install_status_can_be_replaced_with_sidecar_allowance() {
    let store = fake_store();
    store.request_action(super::PendingAction::Install);
    assert_eq!(status_of(&store), ServiceStatus::InstallRequired);
    let generation = store.generation_count();

    assert!(store.allow_sidecar_for_session().is_ok());

    assert_eq!(status_of(&store), ServiceStatus::SidecarAllowed);
    assert_eq!(store.generation_count(), generation + 1);
}

#[test]
fn only_explicit_action_states_ask_for_a_privileged_operation() {
    for status in [
        ServiceStatus::Checking,
        ServiceStatus::Ready,
        ServiceStatus::NotInstalled,
        ServiceStatus::NeedsReinstall,
        ServiceStatus::SidecarAllowed,
        ServiceStatus::Unavailable("offline".into()),
    ] {
        let store = fake_store();
        super::record_status(&store, status.clone());
        assert_eq!(
            store.state().pending,
            None,
            "{status:?} is an observation, not a request"
        );
    }

    for (status, expected) in [
        (ServiceStatus::InstallRequired, PendingAction::Install),
        (ServiceStatus::UninstallRequired, PendingAction::Uninstall),
        (ServiceStatus::ReinstallRequired, PendingAction::Reinstall),
        (ServiceStatus::ForceReinstallRequired, PendingAction::ForceReinstall),
    ] {
        let store = fake_store();
        super::record_status(&store, status.clone());
        assert_eq!(store.state().pending, Some(expected), "{status:?}");
    }
}

#[tokio::test]
async fn a_failed_uninstall_asks_the_machine_rather_than_condemning_the_service() {
    // A cancelled uninstall may leave the Service healthy; use the fresh probe result.
    let store = RunStateStore::new(
        FakeEnv::new()
            .service_ready()
            .privileged_operations_fail("no authorization"),
    );
    store.observe(ServiceHealth::Ready);

    let error = store
        .perform(PendingAction::Uninstall)
        .await
        .expect_err("an unauthorized uninstall should fail");

    assert!(error.to_string().contains("no authorization"));
    assert_eq!(status_of(&store), ServiceStatus::Ready);
    assert!(!store.state().service_needs_attention());
}

#[tokio::test]
async fn a_failed_uninstall_still_reports_a_service_the_uninstaller_broke() {
    // A failed uninstaller can still leave the Service registered but unreachable.
    let store = RunStateStore::new(
        FakeEnv::new()
            .service_unreachable()
            .privileged_operations_fail("uninstaller exited with 1"),
    );
    store.observe(ServiceHealth::Ready);

    store
        .perform(PendingAction::Uninstall)
        .await
        .expect_err("a broken uninstall should fail");

    assert!(matches!(status_of(&store), ServiceStatus::Unavailable(_)));
    assert!(store.state().service_needs_attention());
}

#[tokio::test]
async fn a_successful_uninstall_records_an_absent_service() {
    let store = fake_store();
    store.observe(ServiceHealth::Ready);

    store
        .perform(PendingAction::Uninstall)
        .await
        .expect("uninstall should succeed");

    assert_eq!(status_of(&store), ServiceStatus::NotInstalled);
    assert_eq!(store.env().privileged_actions(), vec![PendingAction::Uninstall]);
}

#[tokio::test]
async fn a_cancelled_install_leaves_no_question_for_the_user() {
    // A cancelled action must retire its request or the attention dialog reopens.
    let store = RunStateStore::new(FakeEnv::new().privileged_operations_fail("User canceled. (-128)"));
    store.observe(ServiceHealth::NotInstalled);
    super::record_status(&store, ServiceStatus::InstallRequired);

    store
        .perform(PendingAction::Install)
        .await
        .expect_err("a cancelled install should fail");

    assert_eq!(status_of(&store), ServiceStatus::NotInstalled);
    assert!(
        !store.state().service_needs_attention(),
        "a service that is merely absent asks the user nothing"
    );
}

#[tokio::test]
async fn a_failed_install_still_reports_a_service_that_really_is_broken() {
    // A fresh probe must preserve a real fault left by a failed installer.
    let store = RunStateStore::new(
        FakeEnv::new()
            .service_unreachable()
            .privileged_operations_fail("installer exited with 1"),
    );
    super::record_status(&store, ServiceStatus::ForceReinstallRequired);

    store
        .perform(PendingAction::ForceReinstall)
        .await
        .expect_err("a broken repair should fail");

    assert!(matches!(status_of(&store), ServiceStatus::Unavailable(_)));
    assert!(store.state().service_needs_attention());
}

/// Build a session where the user already accepted Sidecar for an unhealthy Service.
fn store_settled_on_sidecar(env: FakeEnv) -> RunStateStore<FakeEnv> {
    let store = RunStateStore::new(env);
    store.observe(ServiceHealth::VersionMismatch);
    store.accept_sidecar();
    assert!(!store.state().service_needs_attention(), "the question was answered");
    store
}

#[tokio::test]
async fn a_cancelled_action_gives_back_the_sidecar_the_session_had_settled_on() {
    // A failed action must restore the Sidecar decision displaced by its request.
    let store = store_settled_on_sidecar(
        FakeEnv::new()
            .service_version_mismatch()
            .privileged_operations_fail("User canceled. (-128)"),
    );
    // Recording the request returns the allowance it displaced.
    let was_allowed = store.request_action(PendingAction::Install);
    assert!(was_allowed, "the request displaced the session's answer");
    assert!(!store.state().sidecar_allowed);

    let outcome = super::run_action_restoring_sidecar(&store, was_allowed, async {
        store.perform(PendingAction::Install).await
    })
    .await;

    assert!(outcome.is_err(), "the failure is still reported to the caller");
    assert!(store.state().sidecar_allowed);
    assert!(!store.state().service_needs_attention());
}

#[tokio::test]
async fn an_authorised_action_that_never_became_ready_also_gives_the_sidecar_back() {
    // Roll back the full workflow, including readiness failures after the action succeeds.
    let store = store_settled_on_sidecar(FakeEnv::new().service_version_mismatch());
    let was_allowed = store.request_action(PendingAction::Install);

    let outcome = super::run_action_restoring_sidecar(&store, was_allowed, async {
        store.perform(PendingAction::Install).await?;
        // Simulate `wait_for_service_ipc` recording health before it fails.
        store.observe(ServiceHealth::Unavailable("service never answered".to_owned()));
        bail!("service IPC did not become available")
    })
    .await;

    assert!(outcome.is_err());
    assert!(store.state().sidecar_allowed);
    assert!(!store.state().service_needs_attention());
}

#[tokio::test]
async fn an_action_that_lands_keeps_the_session_on_the_service() {
    let store = RunStateStore::new(FakeEnv::new().service_ready());
    store.observe(ServiceHealth::NotInstalled);
    store.request_action(PendingAction::Install);

    super::run_action_restoring_sidecar(&store, true, async {
        store.perform(PendingAction::Install).await?;
        store.observe(ServiceHealth::Ready);
        Ok(())
    })
    .await
    .expect("the install landed");

    assert!(
        !store.state().sidecar_allowed,
        "no fallback is owed to a working Service"
    );
    assert_eq!(status_of(&store), ServiceStatus::Ready);
}

#[tokio::test]
async fn a_session_that_never_chose_sidecar_is_not_given_one() {
    let store = RunStateStore::new(FakeEnv::new().service_version_mismatch());
    store.observe(ServiceHealth::VersionMismatch);

    super::run_action_restoring_sidecar(&store, false, async { bail!("refused") })
        .await
        .expect_err("the failure is reported");

    assert!(!store.state().sidecar_allowed);
    assert!(store.state().service_needs_attention());
}

#[test]
fn a_service_that_came_back_ready_is_never_shadowed_by_a_restored_sidecar() {
    // The atomic ready check prevents Sidecar from shadowing a ready Service.
    let store = RunStateStore::new(FakeEnv::new().service_ready());
    store.observe(ServiceHealth::Ready);

    assert!(!store.restore_sidecar_allowance());
    assert!(!store.state().sidecar_allowed);
    assert_eq!(status_of(&store), ServiceStatus::Ready);
}
