use super::{CmdResult, StringifyErr as _};
use crate::module::domain_traffic::{
    ClearDomainTrafficResult, DomainTrafficManager, DomainTrafficRange, DomainTrafficStats,
};

#[tauri::command]
pub async fn get_domain_traffic_stats(range: DomainTrafficRange) -> CmdResult<DomainTrafficStats> {
    Ok(DomainTrafficManager::global().stats(range))
}

/// Delete day buckets strictly before `before_day` (`YYYY-MM-DD`).
#[tauri::command]
pub async fn clear_domain_traffic_before(before_day: String) -> CmdResult<ClearDomainTrafficResult> {
    DomainTrafficManager::global()
        .clear_before(&before_day)
        .await
        .stringify_err()
}

#[tauri::command]
pub async fn clear_domain_traffic_stats() -> CmdResult<ClearDomainTrafficResult> {
    DomainTrafficManager::global().clear_all().await.stringify_err()
}
