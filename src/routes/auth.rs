use axum::{
    extract::State,
    http::{header, StatusCode},
    response::IntoResponse,
    Json,
};
use serde::Deserialize;
use serde_json::json;

use crate::auth::{verify_password, CurrentUser, SessionToken};
use crate::models::user::User;
use crate::session;
use crate::state::AppState;

const COOKIE_CLEAR: &str = "session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0";

#[derive(Deserialize)]
pub struct LoginRequest {
    username: String,
    password: String,
}

pub async fn login(
    State(state): State<AppState>,
    Json(payload): Json<LoginRequest>,
) -> impl IntoResponse {
    let result = sqlx::query_as::<_, User>(
        "SELECT id, username, password_hash, role, theme_preference FROM users WHERE username = $1",
    )
    .bind(&payload.username)
    .fetch_optional(&state.pool)
    .await;

    let user = match result {
        Ok(Some(user)) => user,
        _ => {
            return (
                StatusCode::UNAUTHORIZED,
                Json(json!({ "error": "Invalid credentials" })),
            )
                .into_response();
        }
    };

    if !verify_password(&payload.password, &user.password_hash) {
        return (
            StatusCode::UNAUTHORIZED,
            Json(json!({ "error": "Invalid credentials" })),
        )
            .into_response();
    }

    let token = match session::create(&state.redis, user.id).await {
        Ok(token) => token,
        Err(_) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Session error" })),
            )
                .into_response();
        }
    };

    let set_cookie = format!(
        "session={}; HttpOnly; SameSite=Lax; Path=/; Max-Age=86400",
        token
    );

    (
        StatusCode::OK,
        [(header::SET_COOKIE, set_cookie)],
        Json(json!({
            "id": user.id,
            "username": user.username,
            "role": user.role,
            "theme_preference": user.theme_preference,
        })),
    )
        .into_response()
}

pub async fn logout(
    State(state): State<AppState>,
    SessionToken(token): SessionToken,
) -> impl IntoResponse {
    // Best-effort: delete the session from Redis. Cookie is cleared regardless.
    if let Some(token) = token {
        let _ = session::delete(&state.redis, &token).await;
    }

    (
        StatusCode::OK,
        [(header::SET_COOKIE, COOKIE_CLEAR)],
        Json(json!({ "message": "Logged out" })),
    )
}

pub async fn me(current_user: CurrentUser) -> impl IntoResponse {
    Json(json!({
        "id": current_user.id,
        "username": current_user.username,
        "role": current_user.role,
        "theme_preference": current_user.theme_preference,
    }))
}
