pub mod admin;
pub mod auth;
pub mod badges;
pub mod cities;
pub mod connections;
pub mod countries;
pub mod dates;
pub mod feed;
pub mod forum;
pub mod friends;
pub mod notifications;
pub mod stats;
pub mod tags;

use axum::Router;

use crate::AppState;

pub fn api_router() -> Router<AppState> {
    Router::new()
        .nest("/auth", auth::router())
        .nest("/badges", badges::router())
        .nest("/dates", dates::router())
        .nest("/cities", cities::router())
        .nest("/countries", countries::router())
        .nest("/tags", tags::router())
        .nest("/invites", connections::invite_router())
        .nest("/connections", connections::connection_router())
        .nest("/friends", friends::router())
        .nest("/stats", stats::router())
        .nest("/feed", feed::router())
        .nest("/forum", forum::router())
        .nest("/notifications", notifications::router())
        .nest("/admin", admin::router())
}
