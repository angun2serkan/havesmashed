mod config;
mod error;
mod handlers;
mod middleware;
mod services;

use axum::Router;
use http::HeaderValue;
use sqlx::postgres::PgPoolOptions;
use tower_http::cors::{Any, CorsLayer};
use tower_http::services::ServeDir;
use tower_http::trace::TraceLayer;

use crate::config::Config;

#[derive(Clone)]
pub struct AppState {
    pub db: sqlx::PgPool,
    pub redis: redis::aio::ConnectionManager,
    pub config: Config,
}

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

    let app = Router::new()
        .nest("/api", handlers::api_router())
        .nest_service("/uploads", ServeDir::new("uploads"))
        .layer(TraceLayer::new_for_http())
        .layer(cors)
        .with_state(state);

    let addr = format!("{}:{}", config.host, config.port);
    tracing::info!("Starting server on {addr}");

    let listener = tokio::net::TcpListener::bind(&addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}
