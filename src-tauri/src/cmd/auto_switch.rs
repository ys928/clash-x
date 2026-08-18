use super::{CmdResult, StringifyErr as _};
use crate::module::auto_switch::{AutoSwitchGroup, AutoSwitchGroupPatch, AutoSwitchManager, AutoSwitchRunResult};

#[tauri::command]
pub async fn get_auto_switch_groups() -> CmdResult<Vec<AutoSwitchGroup>> {
    Ok(AutoSwitchManager::global().list())
}

#[tauri::command]
pub async fn replace_auto_switch_groups(groups: Vec<AutoSwitchGroup>) -> CmdResult<Vec<AutoSwitchGroup>> {
    AutoSwitchManager::global().replace_all(groups).await.stringify_err()
}

#[tauri::command]
pub async fn upsert_auto_switch_group(group: AutoSwitchGroup) -> CmdResult<Vec<AutoSwitchGroup>> {
    AutoSwitchManager::global().upsert(group).await.stringify_err()
}

#[tauri::command]
pub async fn patch_auto_switch_group(id: String, patch: AutoSwitchGroupPatch) -> CmdResult<Vec<AutoSwitchGroup>> {
    AutoSwitchManager::global().patch(&id, patch).await.stringify_err()
}

#[tauri::command]
pub async fn delete_auto_switch_group(id: String) -> CmdResult<Vec<AutoSwitchGroup>> {
    AutoSwitchManager::global().delete(&id).await.stringify_err()
}

#[tauri::command]
pub async fn run_auto_switch_once(group: AutoSwitchGroup) -> CmdResult<AutoSwitchRunResult> {
    AutoSwitchManager::global().run_once(group).await.stringify_err()
}
