//! Bundled API sidecar: spawn plan and health probe.
//!
//! The TypeScript backend ships as one external binary (`externalBin`) and is
//! started here, from Rust, with a fixed argument list. Two consequences that are
//! the point of doing it here rather than from JavaScript:
//!
//!   * the WebView holds **no** `shell:` permission, so a compromised page cannot
//!     start a process at all (`src/desktop/capabilities.ts` refuses the whole
//!     permission family);
//!   * the per-launch token is generated and injected by the shell, and only ever
//!     leaves through the `shell_handshake` command.
//!
//! Readiness is proven by polling `/v1/health` on the loopback interface with that
//! token. The window is shown only after it answers, so a slow start shows a
//! splash rather than an empty workspace.
//!
//! Phase 6.2 turned "started" into "supervised": the process is watched after it comes up
//! (`try_wait` in a monitor loop), a crash is reported as `crashed` and recovered as
//! `restarting` within a bounded budget, and stopping asks politely before it insists. The
//! states are the same nine `@shared/desktop/process` declares, and `DesktopReport` is the
//! same shape the interface reads, so the shell and the UI cannot disagree about what is
//! happening.

use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::time::{Duration, Instant};

use serde::Serialize;

/// Fixed loopback port. It matches `api.port` in `src/core/config.ts` and the
/// `connect-src` entry in `tauri.conf.json`; `npm run desktop:verify` asserts all
/// three agree, because a mismatch would look like "the app cannot reach its API".
pub const API_PORT: u16 = 4317;
/// Environment variable that names the variable carrying the token.
pub const TOKEN_ENV_NAME: &str = "MASTER_TRADE_SHELL_TOKEN_ENV";
/// Environment variable carrying the per-launch token itself.
pub const TOKEN_ENV: &str = "MASTER_TRADE_SHELL_TOKEN";

/// The nine process states, mirrored from `@shared/desktop/process`.
///
/// `npm run desktop:verify` reads this list and fails if it differs from the TypeScript union,
/// the same way it already compares the API port. A state the shell can report and the
/// interface cannot name would be a status nobody can render.
pub const STATES: [&str; 9] = [
    "idle",
    "starting",
    "health-checking",
    "ready",
    "stopping",
    "stopped",
    "crashed",
    "restarting",
    "error",
];

/// The bounds, mirrored from `PROCESS_POLICY` in the shared surface.
pub const READY_TIMEOUT: Duration = Duration::from_millis(30_000);
pub const POLL_INTERVAL: Duration = Duration::from_millis(250);
pub const STOP_TIMEOUT: Duration = Duration::from_millis(10_000);
pub const MAX_RESTARTS: u32 = 3;
pub const BASE_BACKOFF: Duration = Duration::from_millis(500);
pub const MAX_BACKOFF: Duration = Duration::from_millis(10_000);
pub const STABLE_UPTIME: Duration = Duration::from_millis(60_000);

/// Cloneable because the monitor thread needs its own copy to respawn from, while
/// `ShellState` keeps one for `shell_handshake`.
#[derive(Clone)]
pub struct SidecarPlan {
    pub executable: PathBuf,
    pub args: Vec<String>,
    pub env: Vec<(String, String)>,
    pub cwd: PathBuf,
    pub token: String,
}

impl SidecarPlan {
    /// Absolute path of the bundled sidecar for the running platform.
    ///
    /// Tauri places external binaries next to the app executable, so this is
    /// resolved from the current executable rather than from a working directory —
    /// a bundled app is launched from anywhere.
    pub fn executable_for_current_platform() -> Result<PathBuf, String> {
        let exe = std::env::current_exe().map_err(|e| format!("cannot locate the app: {e}"))?;
        let dir = exe
            .parent()
            .ok_or_else(|| "the app executable has no parent directory".to_string())?;
        let name = if cfg!(windows) {
            "master-trade-api.exe"
        } else {
            "master-trade-api"
        };
        Ok(dir.join(name))
    }

    pub fn new(data_dir: PathBuf, token: String) -> Result<Self, String> {
        let executable = Self::executable_for_current_platform()?;
        if !executable.exists() {
            return Err(format!(
                "the API sidecar is missing at {}; run `npm run build:sidecar` before packaging",
                executable.display()
            ));
        }
        let args = vec![
            "--host".into(),
            "127.0.0.1".into(),
            "--port".into(),
            API_PORT.to_string(),
            "--data-dir".into(),
            data_dir.display().to_string(),
        ];
        let env = vec![
            (TOKEN_ENV_NAME.to_string(), TOKEN_ENV.to_string()),
            (TOKEN_ENV.to_string(), token.clone()),
            ("MASTER_TRADE_API_HOST".into(), "127.0.0.1".into()),
            ("MASTER_TRADE_API_PORT".into(), API_PORT.to_string()),
            (
                "MASTER_TRADE_DB_FILE".into(),
                data_dir.join("master-trade.db").display().to_string(),
            ),
        ];
        Ok(Self {
            executable,
            args,
            env,
            cwd: data_dir,
            token,
        })
    }

    pub fn base_url(&self) -> String {
        format!("http://127.0.0.1:{API_PORT}")
    }

    /// Spawn with piped stdio so the shell can forward the backend's structured
    /// log lines instead of losing them.
    pub fn spawn(&self) -> Result<Child, String> {
        let mut command = Command::new(&self.executable);
        command
            .args(&self.args)
            .current_dir(&self.cwd)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        for (key, value) in &self.env {
            command.env(key, value);
        }
        command
            .spawn()
            .map_err(|e| format!("cannot start the API sidecar: {e}"))
    }
}

/// One authenticated liveness request. The token is passed as a header, never as
/// a query parameter: a URL ends up in logs far more often than a header does.
pub fn probe(base_url: &str, token: &str) -> bool {
    let url = format!("{base_url}/v1/health");
    match ureq::get(&url)
        .set("authorization", &format!("Bearer {token}"))
        .timeout(Duration::from_millis(1_500))
        .call()
    {
        Ok(response) => response.status() == 200,
        // A connection refusal while the process is starting is expected, not an
        // error: the caller keeps polling until the deadline.
        Err(_) => false,
    }
}

/// The four handshake answers, mirrored from `HANDSHAKE_STATES` in `src/desktop/handshake.ts`.
///
/// `npm run desktop:verify` compares this list with the TypeScript one, the same way it compares
/// the process states: an answer the shell can decide and the interface cannot name would be a
/// status nobody can render, and a rule that exists on only one side is not a rule.
pub const HANDSHAKE_STATES: [&str; 4] = [
    "VERSION_OK",
    "VERSION_MISMATCH",
    "VERSION_UNAVAILABLE",
    "VERSION_CHECK_FAILED",
];

/// The version this shell was built as.
///
/// `Cargo.toml` is a mirror of `package.json` — `version.agreement` fails if they disagree — so
/// this is the shell's own answer to "which build am I?", read from the artifact rather than
/// remembered from anywhere else.
pub fn build_version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

/// Normalize a version the way `normalizeVersion` in `src/desktop/update.ts` does: a leading `v`
/// is dropped, a missing minor or patch is padded with zero, and build metadata is ignored.
///
/// Returns `None` for anything that is not a version. Deliberately the same rule as the
/// TypeScript half: two normalizers that disagree would refuse a start the other half accepts.
pub fn normalize_version(raw: &str) -> Option<String> {
    let trimmed = raw.trim();
    let stripped = trimmed
        .strip_prefix('v')
        .or_else(|| trimmed.strip_prefix('V'))
        .unwrap_or(trimmed);
    if stripped.is_empty() {
        return None;
    }
    let without_build = stripped.split('+').next().unwrap_or(stripped);
    let (core, prerelease) = match without_build.split_once('-') {
        Some((core, pre)) => (core, Some(pre)),
        None => (without_build, None),
    };
    let mut parts = core.split('.');
    let major = parts.next()?.parse::<u32>().ok()?;
    let minor = parts.next().map_or(Some(0), |p| p.parse::<u32>().ok())?;
    let patch = parts.next().map_or(Some(0), |p| p.parse::<u32>().ok())?;
    if parts.next().is_some() {
        return None;
    }
    match prerelease {
        Some(pre) if !pre.is_empty() => Some(format!("{major}.{minor}.{patch}-{pre}")),
        _ => Some(format!("{major}.{minor}.{patch}")),
    }
}

/// The version the API reports, read from the authenticated liveness route.
///
/// The same route and the same token as `probe`, so "the API is up" and "the API is this build"
/// are one request and cannot disagree. The three failure shapes are kept apart on purpose:
/// `Err` is "could not ask", `Ok(None)` is "answered without a version", `Ok(Some)` is an answer.
/// Collapsing them would file a broken probe under a missing field, which is a different fix.
pub fn probe_version(base_url: &str, token: &str) -> Result<Option<String>, String> {
    let url = format!("{base_url}/v1/health");
    let response = ureq::get(&url)
        .set("authorization", &format!("Bearer {token}"))
        .timeout(Duration::from_millis(1_500))
        .call()
        .map_err(|_| "the API did not answer the version request".to_string())?;
    if response.status() != 200 {
        return Err(format!(
            "the API answered the version request with status {}",
            response.status()
        ));
    }
    let body = response
        .into_string()
        .map_err(|_| "the API answer could not be read".to_string())?;
    let parsed: serde_json::Value = serde_json::from_str(&body)
        .map_err(|_| "the API answered the version request with a body that is not JSON".to_string())?;
    Ok(parsed
        .get("version")
        .and_then(|value| value.as_str())
        .map(str::to_owned))
}

/// Decide the handshake, mirroring `decideHandshake` in `src/desktop/handshake.ts`.
///
/// Equality is the rule, not "compatible enough": both programs are built from one tree and one
/// version source, so any difference means the bundle mixes two builds. The returned state is one
/// of `HANDSHAKE_STATES` and the message names both versions — never a token, a URL or a path.
pub fn handshake(base_url: &str, token: &str) -> (&'static str, Option<String>) {
    match probe_version(base_url, token) {
        Err(problem) => (
            "VERSION_CHECK_FAILED",
            Some(format!(
                "the build-version handshake could not be completed: {problem}"
            )),
        ),
        Ok(None) => (
            "VERSION_UNAVAILABLE",
            Some(format!(
                "the API answered but reported no version; the shell is {}",
                build_version()
            )),
        ),
        Ok(Some(reported)) => match (normalize_version(&reported), normalize_version(build_version())) {
            (Some(reported), Some(expected)) if reported == expected => ("VERSION_OK", None),
            (Some(reported), Some(expected)) => (
                "VERSION_MISMATCH",
                Some(format!(
                    "the API is version {reported} and the shell is {expected}; refusing to report ready"
                )),
            ),
            _ => (
                "VERSION_CHECK_FAILED",
                Some(format!(
                    "the API reported a version this build cannot read ({reported})"
                )),
            ),
        },
    }
}

/// Watch a running API, and bring it back if it dies.
///
/// This is the piece the shell was missing. It spawned the API and never looked at it again,
/// so an API that died an hour into a session left the interface reporting `ready` for the
/// rest of it — the false positive this whole module exists to avoid. The loop watches
/// liveness with `try_wait`, re-probes health so a wedged process is noticed too, and
/// recovers within a bounded budget with growing backoff, so a broken binary fails visibly
/// rather than spawning forever.
///
/// It returns when the process has been stopped deliberately (the state leaves `ready`) or
/// when the budget is exhausted. Errors are reported through the state, never swallowed.
pub fn supervise(app: tauri::AppHandle, plan: SidecarPlan) {
    use tauri::Manager;

    /// What the child was doing when we looked. `Copy` so it can be matched more than once
    /// without a move.
    #[derive(Clone, Copy)]
    enum Seen {
        Running,
        Exited(Option<i32>),
    }

    let base_url = plan.base_url();
    let token = plan.token.clone();
    let mut health_misses: u32 = 0;

    loop {
        std::thread::sleep(POLL_INTERVAL);

        let seen = {
            let state = app.state::<crate::ShellState>();
            let mut guard = match state.sidecar.lock() {
                Ok(guard) => guard,
                Err(_) => return,
            };
            // A deliberate stop moves the state out of `ready`, which is our signal to end.
            if guard.report.state != "ready" && guard.report.state != "health-checking" {
                return;
            }
            match guard.child.as_mut() {
                None => return,
                Some(child) => match child.try_wait() {
                    Ok(Some(status)) => Seen::Exited(status.code()),
                    Ok(None) => Seen::Running,
                    Err(_) => Seen::Exited(None),
                },
            }
        };

        if let Seen::Running = seen {
            // An API that is alive but no longer answers is not usable either. Eight consecutive
            // misses at 250ms is two seconds of silence, well past a slow request.
            if probe(&base_url, &token) {
                health_misses = 0;
                // Still healthy: go round again. `continue` matters here — without it a healthy
                // process would fall through into the recovery path below and be restarted.
                continue;
            }
            health_misses += 1;
            if health_misses < 8 {
                continue;
            }
            // Wedged: report it as a failure, then fall through to the same recovery a crash gets.
            health_misses = 0;
            let state = app.state::<crate::ShellState>();
            if let Ok(mut guard) = state.sidecar.lock() {
                guard.report.health = "unreachable".into();
                guard.set("crashed", Some("the API stopped answering health checks".into()));
            }
        }

        // A crash (or a wedged process) from here.
        let allowed = {
            let state = app.state::<crate::ShellState>();
            let mut guard = match state.sidecar.lock() {
                Ok(guard) => guard,
                Err(_) => return,
            };
            // Reap whatever is left so the slot is free for the replacement.
            if let Some(mut child) = guard.child.take() {
                let _ = child.wait();
            }
            let code = match seen {
                Seen::Exited(code) => code,
                Seen::Running => None,
            };
            guard.note_crash(code)
        };

        if !allowed {
            let state = app.state::<crate::ShellState>();
            if let Ok(mut guard) = state.sidecar.lock() {
                let reason = guard
                    .report
                    .last_error
                    .clone()
                    .unwrap_or_else(|| "the API exited repeatedly".to_string());
                guard.set(
                    "error",
                    Some(format!(
                        "{reason}; the restart budget of {MAX_RESTARTS} is exhausted"
                    )),
                );
            }
            eprintln!("[shell] the API restart budget is exhausted; not restarting again");
            return;
        }

        let delay = {
            let state = app.state::<crate::ShellState>();
            match state.sidecar.lock() {
                Ok(guard) => guard.backoff(),
                Err(_) => return,
            }
        };
        {
            let state = app.state::<crate::ShellState>();
            if let Ok(mut guard) = state.sidecar.lock() {
                guard.set("restarting", None);
            }
        }
        std::thread::sleep(delay);

        let child = match plan.spawn() {
            Ok(child) => child,
            Err(message) => {
                let state = app.state::<crate::ShellState>();
                if let Ok(mut guard) = state.sidecar.lock() {
                    guard.set("error", Some(message.clone()));
                }
                eprintln!("[shell] {message}");
                return;
            }
        };
        let pid = child.id();
        // Drain the pipes. They are `Stdio::piped()`, so an unread pipe fills and the API
        // blocks on its own log line — which is a hang nobody would connect to logging.
        if let Some(stdout) = child.stdout.take() {
            forward_output(stdout, "api");
        }
        if let Some(stderr) = child.stderr.take() {
            forward_output(stderr, "api");
        }
        {
            let state = app.state::<crate::ShellState>();
            if let Ok(mut guard) = state.sidecar.lock() {
                guard.child = Some(child);
                guard.report.pid = Some(pid);
                guard.report.health = "unknown".into();
                guard.set("health-checking", None);
            }
        }

        if await_ready(&base_url, &token, READY_TIMEOUT) {
            // Readiness has three clauses: the process is running, health passes, and the API is
            // the build this shell shipped. Health passing is not the same claim as "this is the
            // right program" — a stale API left behind by an earlier install answers health
            // perfectly well, and every request would then be served by code the window was not
            // built against. So the version is checked here, after the API proves it is up and
            // before the state becomes `ready`, and a mismatch is a refusal rather than a warning
            // shown beside a `ready` the app cannot honour.
            let (handshake_state, refusal) = handshake(&base_url, &token);
            if let Some(message) = refusal {
                let state = app.state::<crate::ShellState>();
                if let Ok(mut guard) = state.sidecar.lock() {
                    guard.set("error", Some(message.clone()));
                }
                eprintln!("[shell] {handshake_state}: {message}");
                return;
            }
            let state = app.state::<crate::ShellState>();
            if let Ok(mut guard) = state.sidecar.lock() {
                guard.mark_ready(pid);
            }
            health_misses = 0;
        } else {
            let state = app.state::<crate::ShellState>();
            if let Ok(mut guard) = state.sidecar.lock() {
                guard.set(
                    "error",
                    Some("the API did not answer after a restart".into()),
                );
            }
            eprintln!("[shell] the API did not answer after a restart; not trying again");
            return;
        }
    }
}

/// Poll until the API answers or the deadline passes.
pub fn await_ready(base_url: &str, token: &str, timeout: Duration) -> bool {
    let deadline = Instant::now() + timeout;
    while Instant::now() <= deadline {
        if probe(base_url, token) {
            return true;
        }
        std::thread::sleep(Duration::from_millis(250));
    }
    false
}

/// What the interface is told about the API process.
///
/// A report, not a handle: no path, no port, no signal. That is what makes it safe to send to
/// the WebView, and it is the Rust half of `SupervisorStatus`.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DesktopReport {
    pub state: String,
    pub pid: Option<u32>,
    pub health: String,
    pub uptime_ms: u64,
    pub restart_count: u32,
    pub last_error: Option<String>,
}

impl DesktopReport {
    pub fn idle() -> Self {
        Self {
            state: "idle".into(),
            pid: None,
            health: "unknown".into(),
            uptime_ms: 0,
            restart_count: 0,
            last_error: None,
        }
    }
}

/// The supervisor's mutable state. One owner: `ShellState` behind its mutex.
pub struct Supervision {
    /// The child, or none when nothing is running. One owner: taking it out is how a stop and a
    /// restart claim the process, so two paths cannot act on the same child.
    pub child: Option<Child>,
    pub report: DesktopReport,
    pub failures: u32,
    pub healthy_since: Option<Instant>,
}

impl Supervision {
    pub fn new() -> Self {
        Self {
            child: None,
            report: DesktopReport::idle(),
            failures: 0,
            healthy_since: None,
        }
    }

    /// Move to a state, recording the reason.
    ///
    /// The transition table lives in the shared contract and is enforced there; duplicating it
    /// here would be a second source of truth, so this records the move. The assertion keeps a
    /// typo from becoming a state the interface cannot render.
    pub fn set(&mut self, state: &str, last_error: Option<String>) {
        assert!(STATES.contains(&state), "unknown process state: {state}");
        self.report.state = state.to_string();
        if let Some(message) = last_error {
            self.report.last_error = Some(message);
        }
    }

    pub fn mark_ready(&mut self, pid: u32) {
        self.report.pid = Some(pid);
        self.report.health = "healthy".into();
        self.report.last_error = None;
        self.healthy_since = Some(Instant::now());
        self.set("ready", None);
    }

    /// Healthy uptime in milliseconds, or 0 while the API is not answering.
    pub fn uptime_ms(&self) -> u64 {
        match self.healthy_since {
            Some(since) if self.report.state == "ready" => since.elapsed().as_millis() as u64,
            _ => 0,
        }
    }

    /// The report as the interface reads it, with uptime computed at the moment of asking.
    pub fn snapshot(&self) -> DesktopReport {
        DesktopReport {
            uptime_ms: self.uptime_ms(),
            ..self.report.clone()
        }
    }

    /// Record a crash and decide whether a restart is allowed.
    ///
    /// A process that ran stably and then died is a new incident, so the budget is refreshed
    /// only after `STABLE_UPTIME` of healthy uptime — otherwise a flapping process would retry
    /// forever at one attempt per minute.
    pub fn note_crash(&mut self, code: Option<i32>) -> bool {
        let uptime = self.uptime_ms();
        if self.healthy_since.is_some() && uptime >= STABLE_UPTIME.as_millis() as u64 {
            self.failures = 0;
        }
        self.healthy_since = None;
        self.failures += 1;
        self.report.pid = None;
        self.report.health = "unreachable".into();
        let message = match code {
            Some(code) => format!("the API exited with code {code}"),
            None => "the API exited unexpectedly".to_string(),
        };
        self.set("crashed", Some(message));
        self.failures <= MAX_RESTARTS
    }

    /// Backoff before the next attempt, growing and bounded.
    pub fn backoff(&self) -> Duration {
        let step = BASE_BACKOFF * 2u32.saturating_pow(self.failures.saturating_sub(1).min(8));
        step.min(MAX_BACKOFF)
    }
}

impl Default for Supervision {
    fn default() -> Self {
        Self::new()
    }
}

/// Ask the API to stop, then insist.
///
/// On Unix this is a real `SIGTERM`, which the backend's own shutdown hook listens for so
/// SQLite closes through its normal path. This used to be `Child::kill()` — an unconditional
/// `SIGKILL` — while the comment above it claimed a graceful stop, which is the kind of gap
/// that only shows up as a database that occasionally needs recovering.
///
/// Windows has no `SIGTERM`; `Child::kill()` there is `TerminateProcess` and is all `std`
/// offers. That limitation is real and recorded (docs/desktop-runtime.md §11, TDR-12).
pub fn terminate(child: &mut Child) -> bool {
    #[cfg(unix)]
    {
        let pid = child.id() as i32;
        // Safety: `kill` with a pid this process spawned. The child may already be gone, which
        // returns an error we deliberately ignore — `wait_with_deadline` decides the outcome.
        let sent = unsafe { libc::kill(pid, libc::SIGTERM) } == 0;
        if sent {
            return true;
        }
    }
    child.kill().is_ok()
}

/// Wait for the child to exit, up to `timeout`. Returns true when it is gone.
///
/// Polling `try_wait` rather than blocking on `wait()`: a child that ignores `SIGTERM` must not
/// be able to hang application exit, and the deadline is what makes the forced path reachable.
pub fn wait_with_deadline(child: &mut Child, timeout: Duration) -> bool {
    let deadline = Instant::now() + timeout;
    loop {
        match child.try_wait() {
            Ok(Some(_)) => return true,
            Ok(None) => {
                if Instant::now() > deadline {
                    return false;
                }
                std::thread::sleep(Duration::from_millis(50));
            }
            // Cannot reap it: treat it as still running so the caller forces termination.
            Err(_) => return false,
        }
    }
}

/// Stop the API: graceful first, bounded, then forced. Always leaves it dead.
pub fn stop(child: &mut Child) -> bool {
    terminate(child);
    if wait_with_deadline(child, STOP_TIMEOUT) {
        return true;
    }
    eprintln!(
        "[shell] the API did not exit within {:?} and was terminated",
        STOP_TIMEOUT
    );
    let _ = child.kill();
    let _ = child.wait();
    false
}

/// Forward the child's output to the shell log. Lines are prefixed so a reader can
/// tell shell output from backend output.
pub fn forward_output<R: std::io::Read + Send + 'static>(stream: R, label: &'static str) {
    std::thread::spawn(move || {
        for line in BufReader::new(stream).lines() {
            match line {
                Ok(text) => eprintln!("[{label}] {text}"),
                Err(_) => break,
            }
        }
    });
}
