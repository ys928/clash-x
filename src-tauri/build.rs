use std::path::PathBuf;

#[cfg(all(windows, not(feature = "clippy")))]
const SIDECAR_BINARIES: &[&str] = &["verge-mihomo.exe", "verge-mihomo-alpha.exe"];

fn main() -> Result<(), Box<dyn std::error::Error>> {
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows")
        && std::env::var("CARGO_CFG_TARGET_ENV").as_deref() == Ok("msvc")
        && std::env::var_os("CARGO_FEATURE_CLIPPY").is_some()
    {
        // Tauri's resource is linked to the app binary, but not to Rust unit-test harnesses.
        // Give mock-context builds their own manifest so tests can resolve TaskDialogIndirect.
        let out_dir = std::env::var_os("OUT_DIR").ok_or_else(|| std::io::Error::other("OUT_DIR is not set"))?;
        let manifest_path = PathBuf::from(out_dir).join("windows-test-manifest.xml");
        std::fs::write(
            &manifest_path,
            r#"<assembly xmlns="urn:schemas-microsoft-com:asm.v1" manifestVersion="1.0">
  <dependency>
    <dependentAssembly>
      <assemblyIdentity
        type="win32"
        name="Microsoft.Windows.Common-Controls"
        version="6.0.0.0"
        processorArchitecture="*"
        publicKeyToken="6595b64144ccf1df"
        language="*"
      />
    </dependentAssembly>
  </dependency>
</assembly>
"#,
        )?;
        println!("cargo:rustc-link-arg=/MANIFEST:EMBED");
        println!("cargo:rustc-link-arg=/MANIFESTINPUT:{}", manifest_path.display());
    }

    #[cfg(all(windows, not(feature = "clippy")))]
    unlock_sidecar_binaries();

    #[cfg(feature = "clippy")]
    {
        println!("cargo:warning=Skipping tauri_build during Clippy");
    }

    #[cfg(not(feature = "clippy"))]
    tauri_build::build();

    Ok(())
}

/// Tauri copies sidecars into `target/{profile}` on every build. A leftover
/// `verge-mihomo` process from a previous dev run keeps that file locked on
/// Windows and makes `tauri-build` panic with `PermissionDenied`.
#[cfg(all(windows, not(feature = "clippy")))]
fn unlock_sidecar_binaries() {
    use std::process::Command;

    let profile = std::env::var("PROFILE").unwrap_or_else(|_| "debug".into());
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let target_dir = std::env::var("CARGO_TARGET_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|_| manifest_dir.join("..").join("target"));

    for sidecar in SIDECAR_BINARIES {
        let path = target_dir.join(&profile).join(sidecar);
        if !path.exists() {
            continue;
        }

        if std::fs::remove_file(&path).is_ok() {
            continue;
        }

        let _ = Command::new("taskkill").args(["/F", "/T", "/IM", sidecar]).output();

        if std::fs::remove_file(&path).is_err() {
            println!(
                "cargo:warning=Could not unlock sidecar binary `{}`; stop running clash-x/verge-mihomo and rebuild if copy fails",
                path.display()
            );
        }
    }
}
