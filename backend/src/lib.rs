// Library facade for `havesmashed-backend`. Exposes the modules that
// auxiliary binaries (e.g. `create_admin`) need to share with the
// main server binary.

pub mod config;
pub mod error;
pub mod handlers;
pub mod middleware;
pub mod services;

#[derive(Clone)]
pub struct AppState {
    pub db: sqlx::PgPool,
    pub redis: redis::aio::ConnectionManager,
    pub config: config::Config,
}
