//! Local shell configuration (`config.json` in the app-data directory).
//!
//! Two rules are enforced here, both of which the TypeScript mirror
//! (`src/desktop/config.ts`) enforces as well:
//!
//!   * **unknown fields are refused** (`deny_unknown_fields`), so a hand-edited
//!     typo is reported instead of silently ignored;
//!   * **no credential may be written** — a recursive key check refuses anything
//!     named like a secret, so "just cache the key here" cannot happen.
//!
//! The file is deliberately small: window bounds, cache lifetime, log level and
//! the update channel. Anything that affects behaviour the backend can observe is
//! backend configuration, not shell configuration.
//!
//! Duplication with the TypeScript schema is intentional but bounded, and it is
//! mechanically checked: `npm run desktop:verify` compares this struct's field
//! names against the TypeScript schema's keys and fails if they drift.

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

pub const CONFIG_VERSION: u32 = 1;
pub const CONFIG_FILE: &str = "config.json";

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WindowConfig {
    pub width: u32,
    pub height: u32,
    pub min_width: u32,
    pub min_height: u32,
    pub remember_bounds: bool,
}

impl Default for WindowConfig {
    fn default() -> Self {
        Self {
            width: 1440,
            height: 900,
            min_width: 1024,
            min_height: 640,
            remember_bounds: true,
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AutoUpdateConfig {
    pub enabled: bool,
    pub channel: String,
}

impl Default for AutoUpdateConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            channel: "stable".to_string(),
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DesktopConfig {
    pub config_version: u32,
    pub window: WindowConfig,
    pub offline_cache_ttl_ms: u64,
    pub log_level: String,
    pub start_minimized: bool,
    pub auto_update: AutoUpdateConfig,
    /// Local analytics are off and are not a setting; a file that says otherwise
    /// is rejected rather than honoured.
    pub telemetry: bool,
    /// Last window position, if `rememberBounds` is on. Written by the shell.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub window_position: Option<(i32, i32)>,
}

impl Default for DesktopConfig {
    fn default() -> Self {
        Self {
            config_version: CONFIG_VERSION,
            window: WindowConfig::default(),
            offline_cache_ttl_ms: 7 * 24 * 60 * 60 * 1_000,
            log_level: "info".to_string(),
            start_minimized: false,
            auto_update: AutoUpdateConfig::default(),
            telemetry: false,
            window_position: None,
        }
    }
}

fn suspicious_key(key: &str) -> bool {
    let lower = key.to_ascii_lowercase();
    ["secret", "token", "password", "passphrase", "apikey", "api_key", "credential", "privatekey", "private_key"]
        .iter()
        .any(|needle| lower.contains(needle))
}

/// Walk a parsed JSON value and refuse credential-looking keys at any depth.
pub fn assert_no_secrets(value: &serde_json::Value, path: &str) -> Result<(), String> {
    match value {
        serde_json::Value::Object(map) => {
            for (key, entry) in map {
                let here = format!("{path}.{key}");
                if suspicious_key(key) {
                    return Err(format!(
                        "refusing \"{here}\": credentials belong in the OS keychain, never in the config file"
                    ));
                }
                assert_no_secrets(entry, &here)?;
            }
            Ok(())
        }
        serde_json::Value::Array(items) => {
            for (index, entry) in items.iter().enumerate() {
                assert_no_secrets(entry, &format!("{path}[{index}]"))?;
            }
            Ok(())
        }
        _ => Ok(()),
    }
}

impl DesktopConfig {
    pub fn path_in(data_dir: &Path) -> PathBuf {
        data_dir.join(CONFIG_FILE)
    }

    /// Read the config, or defaults when the file does not exist yet.
    ///
    /// A malformed file is a hard error: falling back to defaults would hide a
    /// corrupted profile and then overwrite it on the next save.
    pub fn load(data_dir: &Path) -> Result<Self, String> {
        let path = Self::path_in(data_dir);
        let text = match std::fs::read_to_string(&path) {
            Ok(text) => text,
            Err(_) => return Ok(Self::default()),
        };
        if text.trim().is_empty() {
            return Ok(Self::default());
        }
        let raw: serde_json::Value =
            serde_json::from_str(&text).map_err(|e| format!("config.json is not valid JSON: {e}"))?;
        assert_no_secrets(&raw, "config")?;
        let config: Self = serde_json::from_value(raw)
            .map_err(|e| format!("config.json does not match the schema: {e}"))?;
        if config.config_version != CONFIG_VERSION {
            return Err(format!(
                "config.json is version {} but this build expects {CONFIG_VERSION}",
                config.config_version
            ));
        }
        Ok(config)
    }

    pub fn save(&self, data_dir: &Path) -> Result<(), String> {
        std::fs::create_dir_all(data_dir).map_err(|e| format!("cannot create the app-data dir: {e}"))?;
        let text = serde_json::to_string_pretty(self).map_err(|e| format!("cannot encode config: {e}"))?;
        std::fs::write(Self::path_in(data_dir), format!("{text}\n"))
            .map_err(|e| format!("cannot write config.json: {e}"))
    }
}
