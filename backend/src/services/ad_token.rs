// Opaque tokens minted on ad serve, validated on click/event.
//
// The brand never sees the user — it only sees this token in the
// click_url query string. Token carries enough state for us to
// attribute the click back to the right campaign + placement
// without storing per-impression rows in Postgres.
//
// Implementation: HS256 JWT signed with the existing jwt_secret,
// 1h TTL. Unique `jti` (HMAC-bound) lets us mark tokens as
// already-clicked in Redis to prevent inflated click counts.

use chrono::Utc;
use jsonwebtoken::{decode, encode, Algorithm, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::error::AppError;

const TOKEN_TTL_SECS: i64 = 3600;
const ISSUER: &str = "havesmashed-ad-token";

const GATE_TOKEN_TTL_SECS: i64 = 600; // 10 min window to complete the ad
const GATE_ISSUER: &str = "havesmashed-ad-gate";

const SAVE_TOKEN_TTL_SECS: i64 = 60; // 60s window to post the date after gate
const SAVE_ISSUER: &str = "havesmashed-ad-save";

#[derive(Debug, Serialize, Deserialize)]
pub struct AdImpressionClaims {
    pub iss: String,
    pub jti: Uuid,
    pub campaign_id: Uuid,
    pub placement_key: String,
    pub iat: i64,
    pub exp: i64,
}

/// Mint a new opaque token bound to a single (campaign, placement) impression.
pub fn issue(
    campaign_id: Uuid,
    placement_key: &str,
    secret: &str,
) -> Result<String, AppError> {
    let now = Utc::now().timestamp();
    let claims = AdImpressionClaims {
        iss: ISSUER.to_string(),
        jti: Uuid::now_v7(),
        campaign_id,
        placement_key: placement_key.to_string(),
        iat: now,
        exp: now + TOKEN_TTL_SECS,
    };
    encode(
        &Header::new(Algorithm::HS256),
        &claims,
        &EncodingKey::from_secret(secret.as_bytes()),
    )
    .map_err(AppError::Jwt)
}

/// Verify a token. Returns the decoded claims if valid; otherwise an error.
/// Caller is responsible for any single-use enforcement (Redis SETNX on jti).
pub fn verify(token: &str, secret: &str) -> Result<AdImpressionClaims, AppError> {
    let mut validation = Validation::new(Algorithm::HS256);
    validation.set_issuer(&[ISSUER]);
    validation.set_required_spec_claims(&["exp", "iat", "iss"]);

    let data = decode::<AdImpressionClaims>(
        token,
        &DecodingKey::from_secret(secret.as_bytes()),
        &validation,
    )
    .map_err(|e| AppError::Unauthorized(format!("invalid ad token: {e}")))?;

    Ok(data.claims)
}

// ── Gated interstitial tokens ─────────────────────────────────
//
// Two-step token flow for the date_create gate:
//   1. /api/ads/gate/next mints a `gate_token` bound to the chosen
//      campaign + the user_id hash + a TTL (10min). Frontend shows
//      the ad and, on view_complete or skip, posts the token back to
//      /api/ads/gate/complete.
//   2. /api/ads/gate/complete verifies+single-uses the gate_token
//      (Redis SETNX on jti) and mints a short-lived `save_token`
//      (60s TTL) that POST /api/dates accepts via X-Ad-Save-Token.
//
// The user identity stays on the server: tokens carry only a SHA-256
// hash of `user_id || jti_salt`, never the raw uuid. That hash binds
// the gate-token issuance to the same caller without making the
// token's payload sensitive if logged.

#[derive(Debug, Serialize, Deserialize)]
pub struct AdGateClaims {
    pub iss: String,
    pub jti: Uuid,
    pub campaign_id: Uuid,
    pub placement_key: String,
    /// SHA-256 hex of user_id || ":" || jti — re-derivable only by
    /// the issuer when both pieces are known. We don't actually
    /// verify the hash today (TTL + Redis single-use is enough);
    /// kept in payload so future per-user binding checks are cheap.
    pub user_hash: String,
    /// Context name e.g. "date_create" — frontend must pass the same.
    pub context: String,
    pub iat: i64,
    pub exp: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AdSaveClaims {
    pub iss: String,
    pub jti: Uuid,
    pub user_hash: String,
    pub context: String,
    pub iat: i64,
    pub exp: i64,
}

pub fn user_hash(user_id: Uuid, jti: Uuid) -> String {
    use sha2::{Digest, Sha256};
    let mut h = Sha256::new();
    h.update(user_id.as_bytes());
    h.update(b":");
    h.update(jti.as_bytes());
    hex::encode(h.finalize())
}

pub fn issue_gate(
    campaign_id: Uuid,
    placement_key: &str,
    user_id: Uuid,
    context: &str,
    secret: &str,
) -> Result<(String, Uuid), AppError> {
    let now = Utc::now().timestamp();
    let jti = Uuid::now_v7();
    let claims = AdGateClaims {
        iss: GATE_ISSUER.to_string(),
        jti,
        campaign_id,
        placement_key: placement_key.to_string(),
        user_hash: user_hash(user_id, jti),
        context: context.to_string(),
        iat: now,
        exp: now + GATE_TOKEN_TTL_SECS,
    };
    let token = encode(
        &Header::new(Algorithm::HS256),
        &claims,
        &EncodingKey::from_secret(secret.as_bytes()),
    )
    .map_err(AppError::Jwt)?;
    Ok((token, jti))
}

pub fn verify_gate(token: &str, secret: &str) -> Result<AdGateClaims, AppError> {
    let mut validation = Validation::new(Algorithm::HS256);
    validation.set_issuer(&[GATE_ISSUER]);
    validation.set_required_spec_claims(&["exp", "iat", "iss"]);
    let data = decode::<AdGateClaims>(
        token,
        &DecodingKey::from_secret(secret.as_bytes()),
        &validation,
    )
    .map_err(|e| AppError::Unauthorized(format!("invalid gate token: {e}")))?;
    Ok(data.claims)
}

pub fn issue_save(
    user_id: Uuid,
    context: &str,
    secret: &str,
) -> Result<(String, Uuid, i64), AppError> {
    let now = Utc::now().timestamp();
    let jti = Uuid::now_v7();
    let exp = now + SAVE_TOKEN_TTL_SECS;
    let claims = AdSaveClaims {
        iss: SAVE_ISSUER.to_string(),
        jti,
        user_hash: user_hash(user_id, jti),
        context: context.to_string(),
        iat: now,
        exp,
    };
    let token = encode(
        &Header::new(Algorithm::HS256),
        &claims,
        &EncodingKey::from_secret(secret.as_bytes()),
    )
    .map_err(AppError::Jwt)?;
    Ok((token, jti, SAVE_TOKEN_TTL_SECS))
}

pub fn verify_save(token: &str, secret: &str) -> Result<AdSaveClaims, AppError> {
    let mut validation = Validation::new(Algorithm::HS256);
    validation.set_issuer(&[SAVE_ISSUER]);
    validation.set_required_spec_claims(&["exp", "iat", "iss"]);
    let data = decode::<AdSaveClaims>(
        token,
        &DecodingKey::from_secret(secret.as_bytes()),
        &validation,
    )
    .map_err(|e| AppError::Unauthorized(format!("invalid save token: {e}")))?;
    Ok(data.claims)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn issue_and_verify_roundtrip() {
        let secret = "test_secret";
        let cid = Uuid::now_v7();
        let token = issue(cid, "feed_native", secret).unwrap();
        let claims = verify(&token, secret).unwrap();
        assert_eq!(claims.campaign_id, cid);
        assert_eq!(claims.placement_key, "feed_native");
        assert_eq!(claims.iss, ISSUER);
    }

    #[test]
    fn verify_rejects_wrong_secret() {
        let cid = Uuid::now_v7();
        let token = issue(cid, "feed_native", "secret_a").unwrap();
        assert!(verify(&token, "secret_b").is_err());
    }

    #[test]
    fn gate_token_roundtrip() {
        let secret = "test_secret";
        let cid = Uuid::now_v7();
        let uid = Uuid::now_v7();
        let (token, jti) = issue_gate(cid, "gated_interstitial", uid, "date_create", secret).unwrap();
        let claims = verify_gate(&token, secret).unwrap();
        assert_eq!(claims.campaign_id, cid);
        assert_eq!(claims.placement_key, "gated_interstitial");
        assert_eq!(claims.context, "date_create");
        assert_eq!(claims.jti, jti);
        assert_eq!(claims.user_hash, user_hash(uid, jti));
    }

    #[test]
    fn gate_token_rejects_cross_issuer() {
        // A regular impression token must not validate as a gate token.
        let secret = "test_secret";
        let imp = issue(Uuid::now_v7(), "feed_native", secret).unwrap();
        assert!(verify_gate(&imp, secret).is_err());
    }

    #[test]
    fn save_token_roundtrip() {
        let secret = "test_secret";
        let uid = Uuid::now_v7();
        let (token, jti, ttl) = issue_save(uid, "date_create", secret).unwrap();
        assert_eq!(ttl, 60);
        let claims = verify_save(&token, secret).unwrap();
        assert_eq!(claims.context, "date_create");
        assert_eq!(claims.user_hash, user_hash(uid, jti));
    }

    #[test]
    fn save_token_rejects_gate_token() {
        let secret = "test_secret";
        let uid = Uuid::now_v7();
        let (gate, _) = issue_gate(
            Uuid::now_v7(),
            "gated_interstitial",
            uid,
            "date_create",
            secret,
        )
        .unwrap();
        assert!(verify_save(&gate, secret).is_err());
    }
}
