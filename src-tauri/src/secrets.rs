//! Credential storage backed by the OS keychain.
//!
//! Provider API keys and any future broker-adjacent credential live in the OS
//! keychain — macOS Keychain, Windows Credential Manager, Secret Service on Linux.
//! They are never written to the config file, the database, a log record or the
//! frontend (which only ever sees the key *name*).
//!
//! This is a Rust command rather than a plugin, deliberately: no third-party
//! capability is granted to the WebView for credential access, and the service
//! name that namespaces the entries belongs to the app.

const SERVICE: &str = "app.mastertrade.desktop";

/// Only keychain-shaped names are accepted, so a command cannot be used to probe
/// arbitrary keychain entries.
pub fn validate_key(key: &str) -> Result<(), String> {
    let ok = !key.is_empty()
        && key.len() <= 120
        && key
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-' | '/'));
    if ok {
        Ok(())
    } else {
        Err(format!("invalid credential name: {key:?}"))
    }
}

fn entry(key: &str) -> Result<keyring::Entry, String> {
    validate_key(key)?;
    keyring::Entry::new(SERVICE, key).map_err(|e| format!("keychain unavailable: {e}"))
}

pub fn set(key: &str, value: &str) -> Result<(), String> {
    entry(key)?
        .set_password(value)
        .map_err(|e| format!("cannot store the credential: {e}"))
}

pub fn get(key: &str) -> Result<Option<String>, String> {
    match entry(key)?.get_password() {
        Ok(value) => Ok(Some(value)),
        // `NoEntry` is a normal answer ("not configured yet"), not a failure.
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("cannot read the credential: {e}")),
    }
}

pub fn delete(key: &str) -> Result<(), String> {
    match entry(key)?.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("cannot delete the credential: {e}")),
    }
}

/// Report whether a credential exists without returning it — used by the status
/// card, so the UI never holds a key just to display "configured".
pub fn has(key: &str) -> Result<bool, String> {
    Ok(get(key)?.is_some())
}
