// Admin user password hashing + random password generator + policy.
//
// Why a separate service from `services/crypto.rs`:
//   * crypto.rs hashes BIP39 mnemonics with SHA-256 (fine: 96-bit entropy)
//   * here we hash human-typed passwords (low entropy) → argon2id required
//
// T0.3 kararı gereği:
//   * super_admin brand_admin yaratırken initial password verir VEYA
//     sistem üretir; her halükarda must_change_password=true.
//   * Brand_admin ilk login'de force change yapar.

use argon2::{
    password_hash::{rand_core::OsRng, SaltString},
    Argon2, PasswordHash, PasswordHasher, PasswordVerifier,
};
use rand::Rng;

use crate::error::AppError;

/// Hash a plaintext password using argon2id with random salt.
/// Returns the PHC-encoded string ready for column storage.
pub fn hash_password(plain: &str) -> Result<String, AppError> {
    let salt = SaltString::generate(&mut OsRng);
    let argon2 = Argon2::default();
    argon2
        .hash_password(plain.as_bytes(), &salt)
        .map(|h| h.to_string())
        .map_err(|e| AppError::Internal(format!("password hash failed: {e}")))
}

/// Verify a plaintext password against a stored PHC hash.
/// Returns Ok(true) on match, Ok(false) on mismatch, Err on malformed hash.
pub fn verify_password(plain: &str, stored_hash: &str) -> Result<bool, AppError> {
    let parsed = PasswordHash::new(stored_hash)
        .map_err(|e| AppError::Internal(format!("stored hash malformed: {e}")))?;
    Ok(Argon2::default()
        .verify_password(plain.as_bytes(), &parsed)
        .is_ok())
}

/// Generate a 16-character random password that is guaranteed to
/// satisfy `validate_password_policy` (at least one letter + one digit).
/// Excludes ambiguous chars (0/O, 1/l/I) for verbal/manual sharing.
pub fn generate_random_password() -> String {
    const LETTERS: &[u8] = b"ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz";
    const DIGITS: &[u8] = b"23456789";
    const SYMBOLS: &[u8] = b"!@#$%&*";
    const FULL: &[u8] = b"ABCDEFGHJKLMNPQRSTUVWXYZ\
                          abcdefghijkmnpqrstuvwxyz\
                          23456789\
                          !@#$%&*";

    let mut rng = rand::thread_rng();
    let mut chars: Vec<u8> = Vec::with_capacity(16);

    // Force at least one of each mandatory class
    chars.push(LETTERS[rng.gen_range(0..LETTERS.len())]);
    chars.push(DIGITS[rng.gen_range(0..DIGITS.len())]);
    chars.push(SYMBOLS[rng.gen_range(0..SYMBOLS.len())]);

    // Fill the rest from the full charset
    while chars.len() < 16 {
        chars.push(FULL[rng.gen_range(0..FULL.len())]);
    }

    // Shuffle so the forced positions aren't predictable
    use rand::seq::SliceRandom;
    chars.shuffle(&mut rng);

    chars.into_iter().map(|b| b as char).collect()
}

/// MVP password policy: 8+ chars, at least one letter, at least one digit.
/// T7.9 will replace this with zxcvbn-backed strength check.
pub fn validate_password_policy(plain: &str) -> Result<(), AppError> {
    if plain.len() < 8 {
        return Err(AppError::BadRequest(
            "Password must be at least 8 characters".to_string(),
        ));
    }
    if plain.len() > 128 {
        return Err(AppError::BadRequest(
            "Password must be at most 128 characters".to_string(),
        ));
    }
    let has_letter = plain.chars().any(|c| c.is_alphabetic());
    let has_digit = plain.chars().any(|c| c.is_ascii_digit());
    if !has_letter || !has_digit {
        return Err(AppError::BadRequest(
            "Password must contain at least one letter and one digit".to_string(),
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hash_verify_roundtrip() {
        let hash = hash_password("hunter2-secure").unwrap();
        assert!(verify_password("hunter2-secure", &hash).unwrap());
        assert!(!verify_password("wrong-password", &hash).unwrap());
    }

    #[test]
    fn random_password_format() {
        let pw = generate_random_password();
        assert_eq!(pw.len(), 16);
        assert!(pw.chars().all(|c| c.is_ascii_graphic()));
    }

    #[test]
    fn policy_rejects_short() {
        assert!(validate_password_policy("abc1").is_err());
    }

    #[test]
    fn policy_rejects_no_digit() {
        assert!(validate_password_policy("alphaonly").is_err());
    }

    #[test]
    fn policy_rejects_no_letter() {
        assert!(validate_password_policy("12345678").is_err());
    }

    #[test]
    fn policy_accepts_valid() {
        assert!(validate_password_policy("password1").is_ok());
        assert!(validate_password_policy(&generate_random_password()).is_ok());
    }
}
