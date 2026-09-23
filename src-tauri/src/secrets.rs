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

/// Every key must live under this prefix (Phase 6.4).
///
/// The service name already separates us from other applications' entries; the *key* prefix is
/// the second half of that, and it is what makes the namespace a property of the credential
/// rather than of the code that happens to call this module. `SECRET_NAMESPACE_PREFIX` in
/// `packages/shared/src/desktop/secrets.ts` is the same string, and `desktop:verify` fails the
/// build if the two drift.
pub const NAMESPACE: &str = "master-trade/";

/// Only namespaced, keychain-shaped names are accepted, so a command cannot be used to probe
/// arbitrary keychain entries, address another application's namespace, or name a path. There is
/// deliberately **no enumeration**: nothing in this module can list what is stored.
pub fn validate_key(key: &str) -> Result<(), String> {
    if !key.starts_with(NAMESPACE) {
        return Err(format!(
            "credential names must be namespaced under {NAMESPACE:?}"
        ));
    }
    let ok = key.len() <= 120
        && !key.split('/').any(|segment| segment == "..")
        && !key.contains('\\')
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
