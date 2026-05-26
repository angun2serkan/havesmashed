use axum::Router;
use http::header::{AUTHORIZATION, CONTENT_TYPE};
use http::{HeaderName, HeaderValue, Method};
use sqlx::postgres::PgPoolOptions;
use tower_http::cors::CorsLayer;
use tower_http::services::ServeDir;
use tower_http::trace::TraceLayer;

use havesmashed_backend::config::Config;
use havesmashed_backend::handlers;
use havesmashed_backend::middleware;
use havesmashed_backend::services::{
    analytics_aggregator, event_tracker, impression_cap_enforcer, wallet_reconciler,
};
use havesmashed_backend::AppState;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Production'da ortam degiskenleri dogrudan sistemden gelir (Docker, systemd, vs.)
    // Development'ta .env.dev dosyasindan yuklenir
    let app_env = std::env::var("APP_ENV").unwrap_or_else(|_| "dev".to_string());
    match app_env.as_str() {
        "production" => { /* ortam degiskenleri zaten tanimli */ }
        _ => { dotenvy::from_filename(".env.dev").ok(); }
    };

    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "havesmashed_backend=debug,tower_http=debug".into()),
        )
        .init();

    let config = Config::from_env();

    let pool_size: u32 = std::env::var("DB_POOL_SIZE")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(10);

    let db = PgPoolOptions::new()
        .max_connections(pool_size)
        .connect(&config.database_url)
        .await?;

    sqlx::migrate!().run(&db).await?;

    let redis_client = redis::Client::open(config.redis_url.as_str())?;
    let redis_conn = redis::aio::ConnectionManager::new(redis_client).await?;

    let state = AppState {
        db,
        redis: redis_conn,
        config: config.clone(),
    };

    // SEC-101: cookie-based auth artık aktif (admin_access_token /
    // admin_refresh_token httpOnly cookies). Bu yüzden CORS:
    //   * allow_credentials(true) zorunlu — yoksa browser cookie göndermez
    //   * allow_origin wildcard kullanılamaz; explicit liste
    //   * allow_methods/headers explicit (Any + credentials kombinasyonu
    //     CORS spec'i tarafından reddedilir)
    //
    // Dev: localhost:5173 (user) + localhost:5174 (admin), HTTP + HTTPS
    // (mkcert kullanılırsa). Prod: ALLOWED_ORIGINS env değişkeninden
    // virgülle ayrılmış liste.
    let allowed_headers: Vec<HeaderName> = vec![
        CONTENT_TYPE,
        AUTHORIZATION,
        HeaderName::from_static("x-impersonate-brand"),
        // SEC-103 — CSRF double-submit pattern için frontend her
        // state-changing istekte bu header'ı ekler.
        HeaderName::from_static("x-csrf-token"),
    ];
    let allowed_methods = [
        Method::GET,
        Method::POST,
        Method::PUT,
        Method::DELETE,
        Method::PATCH,
        Method::OPTIONS,
    ];

    let cors = if app_env == "production" {
        let origins: Vec<HeaderValue> = std::env::var("ALLOWED_ORIGINS")
            .unwrap_or_default()
            .split(',')
            .filter(|s| !s.is_empty())
            .filter_map(|s| s.trim().parse().ok())
            .collect();
        tracing::info!("CORS allowed origins: {:?}", origins);
        CorsLayer::new()
            .allow_origin(origins)
            .allow_credentials(true)
            .allow_methods(allowed_methods)
            .allow_headers(allowed_headers)
    } else {
        let dev_origins: Vec<HeaderValue> = [
            "http://localhost:5173",
            "http://localhost:5174",
            "http://127.0.0.1:5173",
            "http://127.0.0.1:5174",
            // SEC-A01 ile mkcert HTTPS dev'e geçildiğinde lazım olacak:
            "https://localhost:5173",
            "https://localhost:5174",
        ]
        .into_iter()
        .filter_map(|s| s.parse().ok())
        .collect();
        CorsLayer::new()
            .allow_origin(dev_origins)
            .allow_credentials(true)
            .allow_methods(allowed_methods)
            .allow_headers(allowed_headers)
    };

    // Background tasks: hourly Redis→Postgres drain, daily aggregator,
    // daily impression-cap enforcer, daily wallet reconciler.
    spawn_analytics_workers(state.clone());
    impression_cap_enforcer::spawn(state.clone());
    wallet_reconciler::spawn(state.clone());

    let app = Router::new()
        .nest("/api", handlers::api_router())
        .merge(handlers::affiliate::public_router())
        .nest_service("/uploads", ServeDir::new("uploads"))
        .layer(axum::middleware::from_fn_with_state(
            state.clone(),
            middleware::event_tracker::track,
        ))
        // SEC-103 — CSRF double-submit. Cookie-based session varsa
        // X-CSRF-Token header zorunlu; cookie yoksa (login/public)
        // middleware atlar. Tüm /api ve public routes'i kapsar.
        .layer(axum::middleware::from_fn(middleware::csrf::csrf_protect))
        .layer(TraceLayer::new_for_http())
        .layer(cors)
        .with_state(state);

    let addr = format!("{}:{}", config.host, config.port);
    tracing::info!("Starting server on {addr}");

    let listener = tokio::net::TcpListener::bind(&addr).await?;
    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<std::net::SocketAddr>(),
    )
    .await?;

    Ok(())
}

// ── Analytics background workers ──────────────────────────────────
//
// Two periodic tasks run for the life of the server:
//   * `event_tracker::drain` — every hour, moves Redis-buffered
//     engagement counts into `event_counters`.
//   * `analytics_aggregator::run_daily` — every 24h, recomputes
//     yesterday's `daily_metrics` and `segment_metrics`. Idempotent
//     so a missed tick is recovered on the next run.
//
// Failures are logged and the worker keeps ticking; analytics must
// never bring the API down.
fn spawn_analytics_workers(state: AppState) {
    let drain_state = state.clone();
    tokio::spawn(async move {
        let mut ticker = tokio::time::interval(std::time::Duration::from_secs(3600));
        ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
        loop {
            ticker.tick().await;
            let mut redis = drain_state.redis.clone();
            match event_tracker::drain(&mut redis, &drain_state.db).await {
                Ok(n) if n > 0 => tracing::info!("event_tracker drained {n} fields"),
                Ok(_) => {}
                Err(e) => tracing::error!("event_tracker drain failed: {e}"),
            }
        }
    });

    let agg_state = state;
    tokio::spawn(async move {
        let mut ticker = tokio::time::interval(std::time::Duration::from_secs(86_400));
        ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
        loop {
            ticker.tick().await;
            let yesterday = chrono::Utc::now().date_naive() - chrono::Duration::days(1);
            if let Err(e) = analytics_aggregator::run_daily(&agg_state.db, yesterday).await {
                tracing::error!("analytics_aggregator daily run failed: {e}");
            }
        }
    });
}
