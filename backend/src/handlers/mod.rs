pub mod admin;
pub mod auth;
pub mod connections;
pub mod dates;
pub mod feed;
pub mod stats;

use axum::Router;

use crate::AppState;

pub fn api_router() -> Router<AppState> {
    Router::new()
        .nest("/auth", auth::router())
        .nest("/dates", dates::router())
        .nest("/invites", connections::invite_router())
        .nest("/connections", connections::connection_router())
        .nest("/stats", stats::router())
        .nest("/feed", feed::router())
        .nest("/admin", admin::router())
}
