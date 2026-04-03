use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use serde::Deserialize;
use serde_json::json;
use uuid::Uuid;

use crate::auth::{hash_password, CurrentUser};
use crate::error::AppError;
use crate::models::user::{User, UserRole};
use crate::state::AppState;

// ── Request bodies ────────────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct UpdateMeRequest {
    pub username: Option<String>,
    pub password: Option<String>,
    pub theme_preference: Option<String>,
}

#[derive(Deserialize)]
pub struct CreateUserRequest {
    pub username: String,
    pub password: String,
    pub role: UserRole,
    pub theme_preference: Option<String>,
}

#[derive(Deserialize)]
pub struct UpdateUserRequest {
    pub username: Option<String>,
    pub password: Option<String>,
    pub role: Option<UserRole>,
    pub theme_preference: Option<String>,
}

fn normalized_theme_preference(theme: Option<&str>) -> Result<Option<&str>, AppError> {
    match theme.map(str::trim) {
        Some("light") => Ok(Some("light")),
        Some("dark") => Ok(Some("dark")),
        Some(_) => Err(AppError::BadRequest(
            "Theme preference must be 'light' or 'dark'".into(),
        )),
        None => Ok(None),
    }
}

// ── PATCH /api/me — self-edit ─────────────────────────────────────────────────

pub async fn update_me(
    current_user: CurrentUser,
    State(state): State<AppState>,
    Json(payload): Json<UpdateMeRequest>,
) -> impl IntoResponse {
    if payload.username.is_none() && payload.password.is_none() && payload.theme_preference.is_none()
    {
        return AppError::BadRequest("Nothing to update".into()).into_response();
    }

    let theme_preference = match normalized_theme_preference(payload.theme_preference.as_deref()) {
        Ok(value) => value,
        Err(err) => return err.into_response(),
    };

    let new_hash = if let Some(ref password) = payload.password {
        if password.trim().is_empty() {
            return AppError::BadRequest("Password cannot be empty".into()).into_response();
        }
        match hash_password(password) {
            Ok(h) => Some(h),
            Err(_) => return AppError::BadRequest("Password hashing failed".into()).into_response(),
        }
    } else {
        None
    };

    let result = sqlx::query_as::<_, User>(
        "UPDATE users SET
             username      = COALESCE($2, username),
             password_hash = COALESCE($3, password_hash),
             theme_preference = COALESCE($4, theme_preference)
         WHERE id = $1
         RETURNING *",
    )
    .bind(current_user.id)
    .bind(payload.username.as_deref())
    .bind(new_hash.as_deref())
    .bind(theme_preference)
    .fetch_one(&state.pool)
    .await;

    match result {
        Ok(user) => Json(json!({
            "id": user.id,
            "username": user.username,
            "role": user.role,
            "theme_preference": user.theme_preference,
        }))
        .into_response(),
        Err(e) if e.to_string().contains("23505") => {
            AppError::Conflict("Username already taken".into()).into_response()
        }
        Err(e) => AppError::from(e).into_response(),
    }
}

// ── GET /api/users — list all users (admin) ───────────────────────────────────

pub async fn list(
    current_user: CurrentUser,
    State(state): State<AppState>,
) -> impl IntoResponse {
    if !matches!(current_user.role, UserRole::Admin) {
        return AppError::BadRequest("Admin only".into()).into_response();
    }

    let users = sqlx::query_as::<_, User>("SELECT * FROM users ORDER BY username")
        .fetch_all(&state.pool)
        .await;

    match users {
        Ok(list) => {
            let response: Vec<_> = list
                .iter()
                .map(|u| json!({ "id": u.id, "username": u.username, "role": u.role }))
                .collect();
            Json(response).into_response()
        }
        Err(e) => AppError::from(e).into_response(),
    }
}

// ── POST /api/users — create user (admin) ─────────────────────────────────────

pub async fn create(
    current_user: CurrentUser,
    State(state): State<AppState>,
    Json(payload): Json<CreateUserRequest>,
) -> impl IntoResponse {
    if !matches!(current_user.role, UserRole::Admin) {
        return AppError::BadRequest("Admin only".into()).into_response();
    }

    if payload.username.trim().is_empty() || payload.password.trim().is_empty() {
        return AppError::BadRequest("Username and password are required".into()).into_response();
    }

    let hash = match hash_password(&payload.password) {
        Ok(h) => h,
        Err(_) => return AppError::BadRequest("Password hashing failed".into()).into_response(),
    };

    let theme_preference = match normalized_theme_preference(payload.theme_preference.as_deref()) {
        Ok(value) => value.unwrap_or("light"),
        Err(err) => return err.into_response(),
    };

    let result = sqlx::query_as::<_, User>(
        "INSERT INTO users (username, password_hash, role, theme_preference)
         VALUES ($1, $2, $3, $4)
         RETURNING *",
    )
    .bind(payload.username.trim())
    .bind(&hash)
    .bind(&payload.role)
    .bind(theme_preference)
    .fetch_one(&state.pool)
    .await;

    match result {
        Ok(user) => (
            StatusCode::CREATED,
            Json(json!({
                "id": user.id,
                "username": user.username,
                "role": user.role,
                "theme_preference": user.theme_preference,
            })),
        )
            .into_response(),
        Err(e) if e.to_string().contains("23505") => {
            AppError::Conflict("Username already taken".into()).into_response()
        }
        Err(e) => AppError::from(e).into_response(),
    }
}

// ── PATCH /api/users/:id — update user (admin) ────────────────────────────────

pub async fn update(
    current_user: CurrentUser,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    Json(payload): Json<UpdateUserRequest>,
) -> impl IntoResponse {
    if !matches!(current_user.role, UserRole::Admin) {
        return AppError::BadRequest("Admin only".into()).into_response();
    }

    if payload.username.is_none()
        && payload.password.is_none()
        && payload.role.is_none()
        && payload.theme_preference.is_none()
    {
        return AppError::BadRequest("Nothing to update".into()).into_response();
    }

    let theme_preference = match normalized_theme_preference(payload.theme_preference.as_deref()) {
        Ok(value) => value,
        Err(err) => return err.into_response(),
    };

    let new_hash = if let Some(ref password) = payload.password {
        if password.trim().is_empty() {
            return AppError::BadRequest("Password cannot be empty".into()).into_response();
        }
        match hash_password(password) {
            Ok(h) => Some(h),
            Err(_) => return AppError::BadRequest("Password hashing failed".into()).into_response(),
        }
    } else {
        None
    };

    // Build query dynamically to avoid COALESCE type-inference issues with enums.
    let result = if let Some(ref role) = payload.role {
        sqlx::query_as::<_, User>(
            "UPDATE users SET
                 username      = COALESCE($1, username),
                 password_hash = COALESCE($2, password_hash),
                 role          = $3,
                 theme_preference = COALESCE($4, theme_preference)
             WHERE id = $5
             RETURNING *",
        )
        .bind(payload.username.as_deref())
        .bind(new_hash.as_deref())
        .bind(role)
        .bind(theme_preference)
        .bind(id)
        .fetch_optional(&state.pool)
        .await
    } else {
        sqlx::query_as::<_, User>(
            "UPDATE users SET
                 username      = COALESCE($1, username),
                 password_hash = COALESCE($2, password_hash),
                 theme_preference = COALESCE($3, theme_preference)
             WHERE id = $4
             RETURNING *",
        )
        .bind(payload.username.as_deref())
        .bind(new_hash.as_deref())
        .bind(theme_preference)
        .bind(id)
        .fetch_optional(&state.pool)
        .await
    };

    match result {
        Ok(Some(user)) => Json(json!({
            "id": user.id,
            "username": user.username,
            "role": user.role,
            "theme_preference": user.theme_preference,
        }))
        .into_response(),
        Ok(None) => AppError::NotFound("User not found".into()).into_response(),
        Err(e) if e.to_string().contains("23505") => {
            AppError::Conflict("Username already taken".into()).into_response()
        }
        Err(e) => AppError::from(e).into_response(),
    }
}

// ── DELETE /api/users/:id — delete user (admin, not self) ────────────────────

pub async fn delete(
    current_user: CurrentUser,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> impl IntoResponse {
    if !matches!(current_user.role, UserRole::Admin) {
        return AppError::BadRequest("Admin only".into()).into_response();
    }

    if id == current_user.id {
        return AppError::BadRequest("Cannot delete your own account".into()).into_response();
    }

    let result = sqlx::query("DELETE FROM users WHERE id = $1")
        .bind(id)
        .execute(&state.pool)
        .await;

    match result {
        Ok(r) if r.rows_affected() == 0 => {
            AppError::NotFound("User not found".into()).into_response()
        }
        Ok(_) => StatusCode::NO_CONTENT.into_response(),
        Err(e) => AppError::from(e).into_response(),
    }
}
