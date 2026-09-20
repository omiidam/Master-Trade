fn main() {
    // Generates the permission schemas from the capability files, so
    // `src-tauri/capabilities/*.json` is validated at build time by Tauri itself
    // — in addition to `npm run desktop:verify`, which checks our policy rules
    // (allow-list membership and forbidden permissions) before Rust is involved.
    tauri_build::build()
}
