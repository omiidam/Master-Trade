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

use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::time::{Duration, Instant};

/// Fixed loopback port. It matches `api.port` in `src/core/config.ts` and the
/// `connect-src` entry in `tauri.conf.json`; `npm run desktop:verify` asserts all
/// three agree, because a mismatch would look like "the app cannot reach its API".
pub const API_PORT: u16 = 4317;
/// Environment variable that names the variable carrying the token.
pub const TOKEN_ENV_NAME: &str = "MASTER_TRADE_SHELL_TOKEN_ENV";
/// Environment variable carrying the per-launch token itself.
pub const TOKEN_ENV: &str = "MASTER_TRADE_SHELL_TOKEN";

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
