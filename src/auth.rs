use argon2::{
    password_hash::{rand_core::OsRng, SaltString},
    Argon2, PasswordHash, PasswordHasher, PasswordVerifier,
};
use async_trait::async_trait;
use axum::{
    extract::{FromRef, FromRequestParts},
    http::{header, request::Parts, StatusCode},
    Json,
};
use serde_json::json;
use std::convert::Infallible;
use uuid::Uuid;

use crate::models::user::UserRole;
use crate::session;
use crate::state::AppState;

pub fn hash_password(password: &str) -> Result<String, argon2::password_hash::Error> {
    let salt = SaltString::generate(&mut OsRng);
    let hash = Argon2::default().hash_password(password.as_bytes(), &salt)?;
    Ok(hash.to_string())
}

pub fn verify_password(password: &str, hash: &str) -> bool {
    let Ok(parsed) = PasswordHash::new(hash) else {
        return false;
    };
    Argon2::default()
        .verify_password(password.as_bytes(), &parsed)
        .is_ok()
}

/// Extracts the session cookie value from the raw `Cookie` header.
pub fn extract_session_token(parts: &Parts) -> Option<String> {
    parts
        .headers
        .get(header::COOKIE)
        .and_then(|value| value.to_str().ok())
        .and_then(|cookie_str| {
            cookie_str
                .split(';')
                .find_map(|part| part.trim().strip_prefix("session=").map(str::to_owned))
        })
}

/// Non-failing extractor: grabs the raw session token (or None) from the Cookie header.
/// Used by handlers that need the token without requiring auth (e.g. logout).
pub struct SessionToken(pub Option<String>);

#[async_trait]
impl<S> FromRequestParts<S> for SessionToken
where
    S: Send + Sync,
{
    type Rejection = Infallible;

    async fn from_request_parts(parts: &mut Parts, _state: &S) -> Result<Self, Self::Rejection> {
        Ok(SessionToken(extract_session_token(parts)))
    }
}

/// Axum extractor. Validates the session cookie against Redis and fetches the user row.
/// Protected handlers declare `CurrentUser` as a parameter — Axum calls this automatically.
pub struct CurrentUser {
    pub id: Uuid,
    pub username: String,
    pub role: UserRole,
}

#[async_trait]
impl<S> FromRequestParts<S> for CurrentUser
where
    AppState: FromRef<S>,
    S: Send + Sync,
{
    type Rejection = (StatusCode, Json<serde_json::Value>);

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        let app_state = AppState::from_ref(state);

        let token = extract_session_token(parts).ok_or_else(|| {
            (
                StatusCode::UNAUTHORIZED,
                Json(json!({ "error": "Not authenticated" })),
            )
        })?;

        let user_id = session::get_user_id(&app_state.redis, &token)
            .await
            .ok_or_else(|| {
                (
                    StatusCode::UNAUTHORIZED,
                    Json(json!({ "error": "Invalid or expired session" })),
                )
            })?;

        let user = sqlx::query_as::<_, crate::models::user::User>(
            "SELECT id, username, password_hash, role FROM users WHERE id = $1",
        )
        .bind(user_id)
        .fetch_one(&app_state.pool)
        .await
        .map_err(|_| {
            (
                StatusCode::UNAUTHORIZED,
                Json(json!({ "error": "User not found" })),
            )
        })?;

        Ok(CurrentUser {
            id: user.id,
            username: user.username,
            role: user.role,
        })
    }
}
