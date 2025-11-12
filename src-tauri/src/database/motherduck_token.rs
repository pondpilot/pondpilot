use once_cell::sync::Lazy;
use std::sync::RwLock;
use zeroize::Zeroizing;

/// Global in-memory store for the MotherDuck session token.
///
/// We keep the token out of process-wide environment variables so it cannot be
/// inherited by child processes or leaked through debugging tools. Access is
/// synchronized via an `RwLock` because both async (Tokio) and blocking
/// connection threads need to read the token.
static TOKEN: Lazy<RwLock<Option<Zeroizing<String>>>> = Lazy::new(|| RwLock::new(None));

/// Persist a new MotherDuck token in memory (overwriting any previous value).
pub fn set_token(token: &str) {
    let mut guard = TOKEN
        .write()
        .expect("MotherDuck token store poisoned during write");
    *guard = Some(Zeroizing::new(token.to_owned()));
}

/// Clear any cached MotherDuck token.
#[allow(dead_code)]
pub fn clear_token() {
    let mut guard = TOKEN
        .write()
        .expect("MotherDuck token store poisoned during clear");
    *guard = None;
}

/// Retrieve a copy of the cached token (if present).
pub fn get_token() -> Option<Zeroizing<String>> {
    let guard = TOKEN
        .read()
        .expect("MotherDuck token store poisoned during read");
    guard.as_ref().cloned()
}

/// Lightweight helper used by diagnostics/logging paths that only need to know
/// whether a token is currently cached (without copying it).
pub fn has_token() -> bool {
    let guard = TOKEN
        .read()
        .expect("MotherDuck token store poisoned during read");
    guard.is_some()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn set_token_overwrites_previous_value() {
        clear_token();
        set_token("first");
        assert_eq!(get_token().as_deref().map(|s| s.as_str()), Some("first"));

        set_token("second");
        assert_eq!(get_token().as_deref().map(|s| s.as_str()), Some("second"));
    }

    #[test]
    fn clear_token_removes_value() {
        set_token("temp");
        assert!(has_token());

        clear_token();
        assert!(!has_token());
        assert!(get_token().is_none());
    }
}
