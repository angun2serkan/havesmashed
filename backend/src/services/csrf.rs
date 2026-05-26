// CSRF token üretimi ve karşılaştırması (SEC-103 — double-submit pattern).
//
// Token transport modeli:
//   1. Login/register response'unda `Set-Cookie` ile JS-okunabilir cookie
//      (HttpOnly DEĞİL, SameSite=Strict) set edilir.
//   2. Frontend her state-changing request'te bu cookie'yi okur ve
//      `X-CSRF-Token` header'ı olarak gönderir.
//   3. Backend middleware cookie ↔ header eşleşmesini constant-time
//      karşılaştırma ile doğrular.
//
// Saldırgan sayfası kullanıcının cookie'sini cross-origin okuyamaz
// (Same-Origin Policy), bu yüzden X-CSRF-Token header'ını forge
// edemez. SameSite=Strict zaten cookie'lerin cross-site request'lerde
// gönderilmesini engeller — bu mekanizma defense in depth.
//
// Token: 32 byte CSPRNG, base64url no-padding (~43 char).

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use rand::{rngs::OsRng, RngCore};

/// 32 byte CSPRNG random → base64url no-pad. ~43 char.
pub fn generate_token() -> String {
    let mut bytes = [0u8; 32];
    OsRng.fill_bytes(&mut bytes);
    URL_SAFE_NO_PAD.encode(bytes)
}

/// Constant-time string equality. Timing-attack güvenli; uzunluk eşit
/// değilse erken çıkış yapar ama saldırgan zaten cookie içeriğinin
/// uzunluğunu (sabit 43 char) biliyor olabilir. Asıl koruma içerik
/// karşılaştırması.
pub fn constant_time_eq(a: &str, b: &str) -> bool {
    let a = a.as_bytes();
    let b = b.as_bytes();
    if a.len() != b.len() {
        return false;
    }
    let mut diff: u8 = 0;
    for (x, y) in a.iter().zip(b.iter()) {
        diff |= x ^ y;
    }
    diff == 0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tokens_are_unique_and_correct_length() {
        let a = generate_token();
        let b = generate_token();
        assert_ne!(a, b);
        // base64url no-pad of 32 bytes = ceil(32*4/3) = 43 char
        assert_eq!(a.len(), 43);
    }

    #[test]
    fn constant_time_eq_matches() {
        assert!(constant_time_eq("abc", "abc"));
        assert!(!constant_time_eq("abc", "abd"));
        assert!(!constant_time_eq("abc", "abcd"));
        assert!(!constant_time_eq("", "x"));
        assert!(constant_time_eq("", ""));
    }
}
