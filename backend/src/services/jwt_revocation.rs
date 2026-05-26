// JWT revocation list (SEC-105) — Redis-backed.
//
// JWT stateless olduğu için kendi başına iptal edilemez; issue olduktan
// sonra expire olana kadar valid kalır. Bu modül Redis'te bir
// "revocation list" tutarak runtime'da tokeni geçersiz kılmayı mümkün
// kılar.
//
// Üç tip revocation:
//   1. JTI revocation       — tek bir token'ı öldür (granular)
//   2. Family revocation    — bir access+refresh pair'ini birlikte öldür
//                             (logout pattern'i; cookie path sorunu için).
//   3. logout_all_before    — bir user_id için belirli bir timestamp
//                             öncesi issue edilmiş tüm tokenları geçersiz
//                             yapar ("tüm cihazlardan çıkış").
//
// Redis anahtarları otomatik TTL ile gelir — token zaten expire olduğunda
// Redis kaydı da silinmiş olur, kalıcı şişme yok.

use redis::aio::ConnectionManager;
use redis::AsyncCommands;
use uuid::Uuid;

// ── Per-token JTI ────────────────────────────────────────────────

pub async fn revoke_jti(
    redis: &mut ConnectionManager,
    jti: Uuid,
    ttl_secs: i64,
) -> Result<(), redis::RedisError> {
    let key = format!("revoked_jti:{jti}");
    let ttl = ttl_secs.max(1) as u64;
    redis.set_ex::<_, _, ()>(&key, "1", ttl).await
}

pub async fn is_jti_revoked(redis: &mut ConnectionManager, jti: Uuid) -> bool {
    let key = format!("revoked_jti:{jti}");
    redis.exists::<_, bool>(&key).await.unwrap_or(false)
}

// ── Family (access+refresh pair) ────────────────────────────────
//
// Refresh cookie path scope'lu (Path=/api/admin/auth/refresh) olduğu için
// logout endpoint'ine sadece access cookie gönderilir; refresh JTI'sini
// doğrudan revoke edemeyiz. Bu yüzden access ve refresh ortak family_id
// taşır; logout family'i revoke eder, ikisini birden öldürür.

pub async fn revoke_family(
    redis: &mut ConnectionManager,
    family_id: Uuid,
    ttl_secs: i64,
) -> Result<(), redis::RedisError> {
    let key = format!("revoked_fam:{family_id}");
    let ttl = ttl_secs.max(1) as u64;
    redis.set_ex::<_, _, ()>(&key, "1", ttl).await
}

pub async fn is_family_revoked(redis: &mut ConnectionManager, family_id: Uuid) -> bool {
    let key = format!("revoked_fam:{family_id}");
    redis.exists::<_, bool>(&key).await.unwrap_or(false)
}

// ── Logout-all (tüm cihazlardan çıkış) ──────────────────────────
//
// Her user_id için en son "logout-all" tetiklendiği unix timestamp
// saklanır. Auth middleware token.iat < bu timestamp ise reject eder.
// Tek anahtar; per-token bookkeeping yok, O(1).
//
// `scope`: "admin" veya "user" — admin ve user JWT namespace'lerini
// ayırmak için. env-super user_id = Uuid::nil() — global logout-all
// olur, ki tam istediğimiz davranış (env-super credential compromise
// senaryosunda).

pub async fn set_logout_all_before(
    redis: &mut ConnectionManager,
    scope: &str,
    user_id: Uuid,
    timestamp_secs: i64,
    ttl_secs: i64,
) -> Result<(), redis::RedisError> {
    let key = format!("logout_all:{scope}:{user_id}");
    let ttl = ttl_secs.max(1) as u64;
    redis
        .set_ex::<_, _, ()>(&key, timestamp_secs.to_string(), ttl)
        .await
}

pub async fn logout_all_before(
    redis: &mut ConnectionManager,
    scope: &str,
    user_id: Uuid,
) -> Option<i64> {
    let key = format!("logout_all:{scope}:{user_id}");
    redis
        .get::<_, Option<String>>(&key)
        .await
        .ok()
        .flatten()
        .and_then(|s| s.parse::<i64>().ok())
}
