use axum::Router;
use http::HeaderValue;
use sqlx::postgres::PgPoolOptions;
use tower_http::cors::{Any, CorsLayer};
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
            .allow_methods(Any)
            .allow_headers(Any)
    } else {
        CorsLayer::new()
            .allow_origin(Any)
            .allow_methods(Any)
            .allow_headers(Any)
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
