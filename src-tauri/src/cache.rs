//! Offline cache.
//!
//! Lesson content and last-known status must survive without a network. The cache
//! is a directory of small JSON records under the app-data directory, each with a
//! TTL, written by the shell — not by the WebView, which has no filesystem
//! permission at all.
//!
//! Bounds are deliberate: 512 KB per value, 4 MB total, and keys are validated
//! (no path characters). Without them a "cache" is an unrestricted file store for
//! whatever the renderer happens to hold.

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

pub const MAX_VALUE_BYTES: usize = 512 * 1024;
pub const MAX_TOTAL_BYTES: usize = 4 * 1024 * 1024;

#[derive(Serialize, Deserialize)]
struct Record {
    key: String,
    value: String,
    /// Unix milliseconds. `None` means "no expiry".
    expires_at: Option<u64>,
    stored_at: u64,
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

pub fn validate_key(key: &str) -> Result<(), String> {
    let ok = !key.is_empty()
        && key.len() <= 120
        && key.chars().all(|c| {
            c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | ':' | '-')
        });
    if ok {
        Ok(())
    } else {
        Err(format!("invalid cache key: {key:?}"))
    }
}

pub struct Cache {
    dir: PathBuf,
}

impl Cache {
    pub fn new(data_dir: &Path) -> Result<Self, String> {
        let dir = data_dir.join("cache");
        std::fs::create_dir_all(&dir).map_err(|e| format!("cannot create the cache directory: {e}"))?;
        Ok(Self { dir })
    }

    /// The file for a key. The key is validated and then hashed into the file name,
    /// so no key can escape the cache directory even by construction.
    fn path_for(&self, key: &str) -> Result<PathBuf, String> {
        validate_key(key)?;
        let digest = blake_like(key);
        Ok(self.dir.join(format!("{digest}.json")))
    }

    pub fn get(&self, key: &str) -> Result<Option<String>, String> {
        let path = self.path_for(key)?;
        let text = match std::fs::read_to_string(&path) {
            Ok(text) => text,
            Err(_) => return Ok(None),
        };
        let record: Record =
            serde_json::from_str(&text).map_err(|e| format!("cache record is corrupt: {e}"))?;
        if let Some(expires_at) = record.expires_at {
            if now_ms() > expires_at {
                // Expired: remove it so the cache does not grow forever.
                let _ = std::fs::remove_file(&path);
                return Ok(None);
            }
        }
        Ok(Some(record.value))
    }

    pub fn set(&self, key: &str, value: &str, ttl_ms: Option<u64>) -> Result<(), String> {
        if value.len() > MAX_VALUE_BYTES {
            return Err(format!(
                "cached value is {} bytes; the limit is {MAX_VALUE_BYTES}",
                value.len()
            ));
        }
        if self.total_bytes()? + value.len() > MAX_TOTAL_BYTES {
            return Err("the offline cache is full; clear it before storing more".to_string());
        }
        let record = Record {
            key: key.to_string(),
            value: value.to_string(),
            expires_at: ttl_ms.map(|ttl| now_ms() + ttl),
            stored_at: now_ms(),
        };
        let text = serde_json::to_string(&record).map_err(|e| format!("cannot encode: {e}"))?;
        std::fs::write(self.path_for(key)?, text).map_err(|e| format!("cannot write the cache: {e}"))
    }

    pub fn clear(&self) -> Result<(), String> {
        match std::fs::read_dir(&self.dir) {
            Ok(entries) => {
                for entry in entries.flatten() {
                    let _ = std::fs::remove_file(entry.path());
                }
                Ok(())
            }
            Err(_) => Ok(()),
        }
    }

    fn total_bytes(&self) -> Result<usize, String> {
        let entries = std::fs::read_dir(&self.dir).map_err(|e| format!("cannot read the cache: {e}"))?;
        Ok(entries
            .flatten()
            .filter_map(|entry| entry.metadata().ok())
            .map(|meta| meta.len() as usize)
            .sum())
    }
}

/// Stable, dependency-free digest for file names. This is a naming function, not a
/// cryptographic control — the value itself is stored verbatim.
fn blake_like(input: &str) -> String {
    let mut hash: u64 = 0xcbf29ce484222325;
    for byte in input.as_bytes() {
        hash ^= *byte as u64;
        hash = hash.wrapping_mul(0x100000001b3);
    }
    format!("{hash:016x}")
}
