use std::path::PathBuf;

fn main() {
    // Without the `desktop` feature there is no Tauri shell (pure logic tests), so nothing to build.
    if std::env::var_os("CARGO_FEATURE_DESKTOP").is_none() {
        return;
    }
    // The Windows resource compiler (windres, GNU toolchain) cannot open icons under non-ASCII paths,
    // so the icon is staged in the (ASCII) build output directory first. Harmless on MSVC builds.
    println!("cargo:rerun-if-changed=icons/icon.ico");
    let out = PathBuf::from(std::env::var("OUT_DIR").expect("OUT_DIR is set by cargo"));
    let staged = out.join("kairo-icon.ico");
    std::fs::copy("icons/icon.ico", &staged).expect("failed to stage icons/icon.ico");
    let windows = tauri_build::WindowsAttributes::new().window_icon_path(staged);
    tauri_build::try_build(tauri_build::Attributes::new().windows_attributes(windows))
        .expect("failed to run tauri-build");
}
