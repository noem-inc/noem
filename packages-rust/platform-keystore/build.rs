fn main() {
    napi_build::setup();

    // `napi_build::setup()` only adds `-undefined dynamic_lookup` to the cdylib,
    // so the `cargo test` binary fails to link: the #[napi] glue references napi
    // symbols that Node provides at runtime. Allow undefined symbols here too —
    // unit tests exercise pure logic and never call the binding layer. (`-tests`
    // targets only [[test]] integration tests, which we don't have; the general
    // `rustc-link-arg` covers the lib's unit-test binary. The duplicate flag on
    // the cdylib is harmless.)
    match std::env::var("CARGO_CFG_TARGET_OS").as_deref() {
        Ok("macos") => {
            println!("cargo:rustc-link-arg=-undefined");
            println!("cargo:rustc-link-arg=dynamic_lookup");
        }
        Ok("linux") => {
            println!("cargo:rustc-link-arg=-Wl,--unresolved-symbols=ignore-all");
        }
        _ => {} // Windows test-linking handled when that CI is added
    }
}
