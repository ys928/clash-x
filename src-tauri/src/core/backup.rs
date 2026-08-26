use crate::constants::files::DNS_CONFIG;
use crate::{process::AsyncHandler, utils::dirs};
use anyhow::Error;
use smartstring::alias::String;
use std::{
    env::{consts::OS, temp_dir},
    io::Write as _,
    path::PathBuf,
};
use tokio::fs;
use zip::write::SimpleFileOptions;

pub async fn create_backup() -> Result<(String, PathBuf), Error> {
    let now = chrono::Local::now().format("%Y-%m-%d_%H-%M-%S").to_string();
    let zip_file_name: String = format!("{OS}-backup-{now}.zip").into();
    let zip_path = temp_dir().join(zip_file_name.as_str());

    let value = zip_path.clone();
    let file = AsyncHandler::spawn_blocking(move || std::fs::File::create(&value)).await??;
    let mut zip = zip::ZipWriter::new(file);
    zip.add_directory("profiles/", SimpleFileOptions::default())?;
    let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored);

    if let Ok(mut entries) = fs::read_dir(dirs::app_profiles_dir()?).await {
        while let Some(entry) = entries.next_entry().await? {
            let path = entry.path();
            if path.is_file() {
                let file_name_os = entry.file_name();
                let file_name = file_name_os
                    .to_str()
                    .ok_or_else(|| anyhow::Error::msg("Invalid file name encoding"))?;
                let backup_path = format!("profiles/{}", file_name);
                zip.start_file(backup_path, options)?;
                let file_content = fs::read(&path).await?;
                zip.write_all(&file_content)?;
            }
        }
    }
    zip.start_file(dirs::CLASH_CONFIG, options)?;
    zip.write_all(fs::read(dirs::clash_path()?).await?.as_slice())?;

    let verge_text = fs::read_to_string(dirs::verge_path()?).await?;
    let mut verge_config: serde_json::Value = serde_yaml_ng::from_str(&verge_text)?;
    if let Some(obj) = verge_config.as_object_mut() {
        obj.remove("webdav_username");
        obj.remove("webdav_password");
        obj.remove("webdav_url");
        obj.remove("enable_auto_backup_schedule");
        obj.remove("auto_backup_interval_hours");
        obj.remove("auto_backup_on_change");
    }
    zip.start_file(dirs::VERGE_CONFIG, options)?;
    zip.write_all(serde_yaml_ng::to_string(&verge_config)?.as_bytes())?;

    let dns_config_path = dirs::app_home_dir()?.join(DNS_CONFIG);
    if dns_config_path.exists() {
        zip.start_file(DNS_CONFIG, options)?;
        zip.write_all(fs::read(&dns_config_path).await?.as_slice())?;
    }

    zip.start_file(dirs::PROFILE_YAML, options)?;
    zip.write_all(fs::read(dirs::profiles_path()?).await?.as_slice())?;
    zip.finish()?;
    Ok((zip_file_name, zip_path))
}
