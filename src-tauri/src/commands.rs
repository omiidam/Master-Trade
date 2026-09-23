//! The commands the WebView may call — the whole frontend-reachable surface.
//!
//! This list is the Rust half of the contract in `src/desktop/ipc.ts`. Both halves
//! are deny-by-default and both are checked by `npm run desktop:verify`:
//!
//!   * no command takes or returns a filesystem path. `export_report_as` shows a
//!     native save dialog and returns a *file name*; the destination never leaves
//!     Rust. A report the frontend never learns the location of cannot be used to
//!     probe the disk;
//!   * credentials are addressed by name and returned only through the explicit
//!     read that the settings screen calls;
//!   * nothing here can start a process, open a socket or touch a broker.

use crate::{secrets, sidecar, ShellState};
use serde::Serialize;
use std::path::PathBuf;
use tauri::{AppHandle, Manager, State};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShellStatus {
    pub protocol_version: u32,
    pub platform: String,
    pub app_version: String,
    pub api_base_url: Option<String>,
    /// The API process as the shell supervises it (Phase 6.2, protocol v2).
    ///
    /// Replaced the four-value `sidecar_state`: the shell could say "starting" but not "it
    /// crashed and is coming back", so an interface could not tell a slow start from a
    /// recovery. A report only — no path, no signal, no port — because it is sent to the
    /// WebView.
    pub runtime: sidecar::DesktopReport,
    pub capabilities: Vec<String>,
    pub unavailable: Vec<UnavailableCapability>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UnavailableCapability {
    pub capability: String,
    pub reason: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShellHandshake {
    pub api_base_url: String,
    pub token: String,
    pub expires_at: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportResult {
    pub file_name: String,
    pub bytes: usize,
    pub cancelled: bool,
}

/// Bumped when the command contract changes shape.
///
/// v2 (Phase 6.2): `sidecarState` (four strings) became `runtime`, the structured report of the
/// API process. `SHELL_PROTOCOL_VERSION` in `packages/shared/src/desktop/ipc.ts` carries the
/// same number, and `npm run desktop:verify` fails if the two disagree.
pub const PROTOCOL_VERSION: u32 = 2;

fn platform_name() -> String {
    if cfg!(target_os = "windows") {
        "windows"
    } else if cfg!(target_os = "macos") {
        "macos"
    } else {
        "linux"
    }
    .to_string()
}

fn unavailable_capabilities() -> Vec<UnavailableCapability> {
    let mut unavailable = Vec::new();
    if secrets::has("master-trade/probe").is_err() {
        unavailable.push(UnavailableCapability {
            capability: "secure-store".into(),
            reason: "the OS keychain is not reachable; credentials cannot be stored on this system"
                .into(),
        });
    }
    unavailable
}

#[tauri::command]
pub fn shell_status(state: State<'_, ShellState>) -> Result<ShellStatus, String> {
    let plan = state.plan.lock().map_err(|_| "shell state is poisoned")?;
    let runtime = state.sidecar_report();
    let mut unavailable = unavailable_capabilities();
    if runtime.state != "ready" {
        unavailable.push(UnavailableCapability {
            capability: "notifications".into(),
            reason: format!("the API is {}; job notifications need it", runtime.state),
        });
    }
    Ok(ShellStatus {
        protocol_version: PROTOCOL_VERSION,
        platform: platform_name(),
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        api_base_url: plan.as_ref().map(|plan| plan.base_url()),
        runtime,
        capabilities: vec![
            "secure-store".into(),
            "file-dialog".into(),
            "offline-cache".into(),
            "single-instance".into(),
            "notifications".into(),
            "auto-update".into(),
        ],
        unavailable,
    })
}

/// The per-launch API credential. Deliberately the only way the frontend learns it,
/// and it is short-lived: the shell exits, the token dies with it.
#[tauri::command]
pub fn shell_handshake(state: State<'_, ShellState>) -> Result<ShellHandshake, String> {
    let plan = state.plan.lock().map_err(|_| "shell state is poisoned")?;
    let plan = plan
        .as_ref()
        .ok_or_else(|| "the API sidecar is not running yet".to_string())?;
    Ok(ShellHandshake {
        api_base_url: plan.base_url(),
        token: plan.token.clone(),
        expires_at: state.launch_deadline(),
    })
}

#[tauri::command]
pub async fn secure_store_set(key: String, value: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || secrets::set(&key, &value))
        .await
        .map_err(|e| format!("credential store task failed: {e}"))?
}

#[tauri::command]
pub async fn secure_store_get(key: String) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || secrets::get(&key))
        .await
        .map_err(|e| format!("credential store task failed: {e}"))?
}

#[tauri::command]
pub async fn secure_store_delete(key: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || secrets::delete(&key))
        .await
        .map_err(|e| format!("credential store task failed: {e}"))?
}

#[tauri::command]
pub fn cache_get(state: State<'_, ShellState>, key: String) -> Result<Option<String>, String> {
    state.cache.get(&key)
}

#[tauri::command]
pub fn cache_set(
    state: State<'_, ShellState>,
    key: String,
    value: String,
    ttl_ms: Option<u64>,
) -> Result<(), String> {
    state.cache.set(&key, &value, ttl_ms)
}

#[tauri::command]
pub fn cache_clear(state: State<'_, ShellState>) -> Result<(), String> {
    state.cache.clear()
}

/// Write a report into the exports directory the shell owns. The frontend supplies
/// a name, never a destination.
#[tauri::command]
pub fn export_report(
    state: State<'_, ShellState>,
    name: String,
    contents: String,
) -> Result<ExportResult, String> {
    let path = safe_export_path(&state.data_dir, &name)?;
    if contents.len() > 8 * 1024 * 1024 {
        return Err("the report exceeds the 8 MB export limit".into());
    }
    std::fs::write(&path, contents.as_bytes()).map_err(|e| format!("cannot write the report: {e}"))?;
    Ok(ExportResult {
        file_name: name,
        bytes: contents.len(),
        cancelled: false,
    })
}

/// Show the native save dialog and write there. Returns the chosen file name only.
#[tauri::command]
pub async fn export_report_as(
    app: AppHandle,
    state: State<'_, ShellState>,
    suggested_name: String,
    contents: String,
) -> Result<ExportResult, String> {
    use tauri_plugin_dialog::DialogExt;
    let (tx, rx) = std::sync::mpsc::channel();
    app.dialog()
        .file()
        .set_file_name(&suggested_name)
        .save_file(move |path| {
            let _ = tx.send(path);
        });
    let chosen = rx.recv().map_err(|_| "the save dialog closed unexpectedly")?;
    let Some(chosen) = chosen else {
        return Ok(ExportResult {
            file_name: suggested_name,
            bytes: 0,
            cancelled: true,
        });
    };
    let path: PathBuf = chosen.into_path().map_err(|e| format!("invalid destination: {e}"))?;
    let file_name = path
        .file_name()
        .map(|name| name.to_string_lossy().to_string())
        .unwrap_or_else(|| suggested_name.clone());
    if contents.len() > 8 * 1024 * 1024 {
        return Err("the report exceeds the 8 MB export limit".into());
    }
    std::fs::write(&path, contents.as_bytes()).map_err(|e| format!("cannot write the report: {e}"))?;
    // The destination path stays here; the frontend gets the file name only.
    let _ = state;
    Ok(ExportResult {
        file_name,
        bytes: contents.len(),
        cancelled: false,
    })
}

/// Only https leaves the app. `file:`, `javascript:` and custom schemes are
/// refused here as well as in the TypeScript bridge.
#[tauri::command]
pub async fn open_external(app: AppHandle, url: String) -> Result<(), String> {
    if !url.starts_with("https://") {
        return Err(format!("refusing to open a non-https URL: {url}"));
    }
    tauri_plugin_opener::OpenerExt::opener(&app)
        .open_url(url, None::<&str>)
        .map_err(|e| format!("cannot open the browser: {e}"))
}

#[tauri::command]
pub fn window_hide(window: tauri::Window) -> Result<(), String> {
    window.hide().map_err(|e| format!("cannot hide the window: {e}"))
}

/// Quit: the sidecar is stopped first, so the database closes before we exit.
#[tauri::command]
pub fn app_quit(app: AppHandle) {
    app.exit(0);
}

/// Build a path inside the exports directory, refusing anything that could escape
/// it. Belt and braces: the frontend validates the name too.
fn safe_export_path(data_dir: &PathBuf, name: &str) -> Result<PathBuf, String> {
    let bad = name.is_empty()
        || name.len() > 120
        || name.contains('/')
        || name.contains('\\')
        || name.contains("..")
        || name.chars().any(|c| c.is_control());
    if bad {
        return Err(format!("invalid export file name: {name:?}"));
    }
    let exports = data_dir.join("exports");
    std::fs::create_dir_all(&exports).map_err(|e| format!("cannot create the exports directory: {e}"))?;
    Ok(exports.join(name))
}

/// Re-exported so `lib.rs` can build the handler list in one place.
pub fn handlers() -> impl Fn(tauri::ipc::Invoke<tauri::Wry>) -> bool {
    tauri::generate_handler![
        shell_status,
        shell_handshake,
        secure_store_set,
        secure_store_get,
        secure_store_delete,
        cache_get,
        cache_set,
        cache_clear,
        export_report,
        export_report_as,
        open_external,
        window_hide,
        app_quit
    ]
}


