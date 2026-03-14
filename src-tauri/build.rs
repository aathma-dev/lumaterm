fn main() {
    // Allow cargo-clippy cfg used by the objc crate's sel_impl macro
    println!("cargo:rustc-check-cfg=cfg(feature, values(\"cargo-clippy\"))");
    tauri_build::build()
}
