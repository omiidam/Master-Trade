//! Master Trade desktop shell.
//!
//! The shell owns host concerns only: one window, one child process (the bundled
//! API sidecar), the OS keychain, the offline cache and the update channel. It
//! holds no business logic, no risk math and no provider credentials in memory
//! beyond the moment a command reads one from the keychain.
//!
//! Startup order (mirrored in `src/desktop/lifecycle.ts`, asserted by tests):
//!
//! ```text
//! 1. single-instance check   a second launch must not open a second database
//! 2. sidecar spawn           the API process, with the per-launch token in its env
//! 3. health probe            GET /v1/health until it answers, or fail loudly
//! 4. window show             the UI never renders against a dead API
//! 5. ready                   the frontend calls shell_handshake for base URL + token
//! ```
//!
//! On exit the child is stopped first. On Unix that is a real `SIGTERM`, so the API's own
//! shutdown hook runs and SQLite closes through its normal path. Windows has no signal to send
//! — `std` offers only `TerminateProcess` — so there the child is terminated instead and WAL
//! recovery is what makes it survivable. Phase 6.2 corrected this comment, which previously
//! described a graceful stop that the code did not perform (`Child::kill` is `SIGKILL` on Unix).
//! The remaining Windows limitation is recorded as TDR-12.

mod cache;
mod commands;
mod config;
mod secrets;
mod sidecar;

use cache::Cache;
use config::DesktopConfig;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{Manager, RunEvent, WindowEvent};

/// Shared shell state. Everything mutable lives behind a mutex; nothing here is
/// reachable from the WebView except through a command in `commands.rs`.
pub struct ShellState {
    pub data_dir: PathBuf,
    pub cache: Cache,
    pub plan: Mutex<Option<sidecar::SidecarPlan>>,
    /// The API process and everything the interface is told about it (Phase 6.2).
    ///
    /// One mutex rather than a child plus a state string: the two were always read together
    /// and could drift, so a status card could describe a process that no longer existed.
    pub sidecar: Mutex<sidecar::Supervision>,
    /// When this launch's credential stops being honoured (informational).
    pub launch_deadline: String,
}

impl ShellState {
    /// The API process as the interface reads it. Never releases a poisoned lock: a shell that
    /// cannot say what it is doing reports `error`, not silence.
    pub fn sidecar_report(&self) -> sidecar::DesktopReport {
        match self.sidecar.lock() {
            Ok(guard) => guard.snapshot(),
            Err(_) => sidecar::DesktopReport {
                state: "error".into(),
                last_error: Some("the shell's process state is poisoned".into()),
                ..sidecar::DesktopReport::idle()
            },
        }
    }

    pub fn launch_deadline(&self) -> String {
        self.launch_deadline.clone()
    }

    /// Stop the API process and wait for it. Called on every exit path.
    ///
    /// A real `SIGTERM` first, then a bounded wait, then forced termination, so the database
    /// closes through SQLite's own path where that is possible. Moving the state out of `ready`
    /// is also what tells the monitor loop to stop.
    fn stop_sidecar(&self) {
        let mut guard = match self.sidecar.lock() {
            Ok(guard) => guard,
            Err(_) => return,
        };
        guard.set("stopping", None);
        if let Some(mut child) = guard.child.take() {
            sidecar::stop(&mut child);
        }
        guard.set("stopped", None);
    }
}

/// Generate the per-launch API credential.
///
/// 256 bits from the OS RNG, hex-encoded. It is passed to the child through the
/// environment (never a file, never a log line) and handed to the WebView only by
/// `shell_handshake`.
fn generate_token() -> Result<String, String> {
    let mut bytes = [0u8; 32];
    getrandom::fill(&mut bytes).map_err(|e| format!("no OS randomness available: {e}"))?;
    Ok(bytes.iter().map(|byte| format!("{byte:02x}")).collect())
}

fn launch_deadline() -> String {
    // The token is valid for this process only; the timestamp is informational and
    // exists so the UI can say "this session" rather than showing nothing.
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    format!("unix:{}", now + 12 * 60 * 60)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // A second launch focuses the existing window instead of starting a second
        // sidecar and a second database handle.
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(commands::handlers())
        .setup(|app| {
            let handle = app.handle().clone();
            let data_dir = app
                .path()
                .app_data_dir()
                .map_err(|e| format!("cannot locate the app-data directory: {e}"))?;
            std::fs::create_dir_all(&data_dir)?;

            // Fail before the window exists if the profile is unreadable, so the
            // user sees a message instead of a silently-reset workspace.
            let desktop_config = DesktopConfig::load(&data_dir).map_err(|message| {
                Box::<dyn std::error::Error>::from(format!(
                    "Master Trade cannot start: {message}\nExpected file: {}",
                    DesktopConfig::path_in(&data_dir).display()
                ))
            })?;

            let cache = Cache::new(&data_dir).map_err(Box::<dyn std::error::Error>::from)?;
            let token = generate_token().map_err(Box::<dyn std::error::Error>::from)?;
            let plan = sidecar::SidecarPlan::new(data_dir.clone(), token).map_err(|message| {
                Box::<dyn std::error::Error>::from(format!(
                    "Master Trade cannot start: {message}"
                ))
            })?;

            app.manage(ShellState {
                data_dir: data_dir.clone(),
                cache,
                plan: Mutex::new(Some(plan.clone())),
                sidecar: Mutex::new(sidecar::Supervision::new()),
                launch_deadline: launch_deadline(),
            });

            // Spawn and probe off the main thread: the event loop must stay
            // responsive so the OS does not mark the app as unresponsive during a
            // slow start.
            tauri::async_runtime::spawn(async move {
                let state = handle.state::<ShellState>();
                let plan = {
                    let guard = state.plan.lock().expect("plan mutex");
                    match guard.as_ref() {
                        Some(plan) => plan.clone(),
                        None => return,
                    }
                };
                let base_url = plan.base_url();
                let token = plan.token.clone();

                if let Ok(mut guard) = state.sidecar.lock() {
                    guard.set("starting", None);
                }

                let mut child = match plan.spawn() {
                    Ok(child) => child,
                    Err(message) => {
                        if let Ok(mut guard) = state.sidecar.lock() {
                            guard.set("error", Some(message.clone()));
                        }
                        eprintln!("[shell] {message}");
                        return;
                    }
                };
                let pid = child.id();
                // Drain both pipes before the child is handed to the state. They are
                // `Stdio::piped()`, and an unread pipe fills: the API would block on its own
                // log line, which is a hang nobody would think to connect to logging.
                if let Some(stdout) = child.stdout.take() {
                    sidecar::forward_output(stdout, "api");
                }
                if let Some(stderr) = child.stderr.take() {
                    sidecar::forward_output(stderr, "api");
                }
                if let Ok(mut guard) = state.sidecar.lock() {
                    guard.child = Some(child);
                    guard.report.pid = Some(pid);
                    guard.set("health-checking", None);
                }

                let ready = sidecar::await_ready(&base_url, &token, sidecar::READY_TIMEOUT);
                if ready {
                    if let Ok(mut guard) = state.sidecar.lock() {
                        guard.mark_ready(pid);
                    }
                } else {
                    let message = format!(
                        "the API did not answer {base_url}/v1/health within {}s; \
                         check that port {} is free",
                        sidecar::READY_TIMEOUT.as_secs(),
                        sidecar::API_PORT
                    );
                    if let Ok(mut guard) = state.sidecar.lock() {
                        guard.set("error", Some(message.clone()));
                    }
                    eprintln!("[shell] {message}");
                    return;
                }

                if !desktop_config.start_minimized {
                    if let Some(window) = handle.get_webview_window("main") {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }

                // Hand the running API to its own thread. The shell spawned it and previously
                // never looked at it again, so an API that died mid-session left the interface
                // reporting `ready` for the rest of it.
                let monitor = handle.clone();
                std::thread::spawn(move || sidecar::supervise(monitor, plan));
            });

            Ok(())
        })
        // Closing the window hides it: a training record that runs for months should
        // not be one stray Cmd-W away from being gone. Quitting is explicit.
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .build(tauri::generate_context!())
        .expect("Master Trade failed to build its window")
        .run(|app, event| {
            if let RunEvent::ExitRequested { .. } | RunEvent::Exit = event {
                let state = app.state::<ShellState>();
                state.stop_sidecar();
            }
        });
}
