use super::{CmdResult, CommandFailure, WithErrorCode as _, proxy_aware_coded_error};
use crate::feat;
use crate::{
    config::{ClashInfo, Config, profiles::profiles_save_file_safe},
    core::{CoreManager, handle},
};
use clash_verge_logging::{Type, logging, logging_error};
use serde_yaml_ng::Mapping;
use smartstring::alias::String;

#[tauri::command]
pub async fn copy_clash_env() -> CmdResult {
    feat::copy_clash_env().await;
    Ok(())
}

#[tauri::command]
pub async fn get_clash_info() -> CmdResult<ClashInfo> {
    Ok(Config::clash().await.data_arc().get_client_info())
}

#[tauri::command]
pub async fn patch_clash_config(payload: Mapping) -> CmdResult {
    feat::patch_clash(&payload)
        .await
        .map_err(|error| proxy_aware_coded_error(&error, "CLASH_CONFIG_UPDATE_FAILED"))
}

#[tauri::command]
pub async fn patch_clash_mode(payload: String) -> CmdResult {
    feat::change_clash_mode(payload)
        .await
        .with_error_code("CLASH_MODE_UPDATE_FAILED")
}

/// Reads the saved mode without depending on strict mihomo `/configs` deserialization.
#[tauri::command]
pub async fn get_clash_mode() -> CmdResult<Option<String>> {
    Ok(Config::clash().await.data_arc().get_mode().map(Into::into))
}

#[tauri::command]
pub async fn change_clash_core(clash_core: String) -> CmdResult<Option<CommandFailure>> {
    logging!(info, Type::Config, "changing core to {clash_core}");

    match CoreManager::global().change_core(&clash_core).await {
        Ok(_) => {
            logging_error!(Type::Core, profiles_save_file_safe().await);

            match CoreManager::global().restart_core().await {
                Ok(_) => {
                    logging!(info, Type::Core, "core changed and restarted to {clash_core}");
                    handle::Handle::notice_message("config_core::change_success", clash_core);
                    handle::Handle::refresh_clash();
                    Ok(None)
                }
                Err(err) => {
                    let failed = err.context("core changed but failed to restart");
                    let error_msg: String = format!("{failed:#}").into();
                    handle::Handle::notice_message("config_core::change_error", error_msg.clone());
                    logging!(error, Type::Core, "{error_msg}");
                    Ok(Some(proxy_aware_coded_error(&failed, "CORE_CHANGE_FAILED")))
                }
            }
        }
        Err(err) => {
            let error_msg: String = format!("{err:#}").into();
            logging!(error, Type::Core, "failed to change core: {error_msg}");
            handle::Handle::notice_message("config_core::change_error", error_msg);
            Ok(Some(proxy_aware_coded_error(&err, "CORE_CHANGE_FAILED")))
        }
    }
}

#[tauri::command]
pub async fn start_core() -> CmdResult {
    let result = CoreManager::global()
        .start_core()
        .await
        .map_err(|error| proxy_aware_coded_error(&error, "CORE_START_FAILED"));
    if result.is_ok() {
        handle::Handle::refresh_clash();
    }
    result
}

#[tauri::command]
pub async fn stop_core() -> CmdResult {
    logging_error!(Type::Core, profiles_save_file_safe().await);
    let result = CoreManager::global()
        .stop_core()
        .await
        .map_err(|error| proxy_aware_coded_error(&error, "CORE_STOP_FAILED"));
    if result.is_ok() {
        handle::Handle::refresh_clash();
    }
    result
}

#[tauri::command]
pub async fn restart_core() -> CmdResult {
    logging_error!(Type::Core, profiles_save_file_safe().await);
    let result = CoreManager::global()
        .restart_core()
        .await
        .map_err(|error| proxy_aware_coded_error(&error, "CORE_RESTART_FAILED"));
    if result.is_ok() {
        handle::Handle::refresh_clash();
    }
    result
}

/// Replaces the managed core binary atomically instead of letting mihomo overwrite itself.
#[tauri::command]
pub async fn upgrade_clash_core(force: bool) -> CmdResult<feat::CoreUpgradeReport> {
    let report = feat::upgrade_core(force).await.with_error_code("CORE_UPGRADE_FAILED")?;
    if report.upgraded {
        handle::Handle::refresh_clash();
    }
    Ok(report)
}

#[tauri::command]
pub async fn test_delay(url: String) -> CmdResult<u32> {
    let result = match feat::test_delay(url).await {
        Ok(delay) => delay,
        Err(e) => {
            logging!(error, Type::Cmd, "{}", e);
            10000u32
        }
    };
    Ok(result)
}
