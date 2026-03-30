/// Centralised error type for all route handlers.
///
/// Every variant maps to a fixed HTTP status code and a `{ "error": "..." }`
/// JSON body so clients always receive a consistent shape regardless of which
/// handler failed. Database errors are logged server-side and never forwarded.
use axum::{http::StatusCode, response::IntoResponse, Json};
use serde_json::json;

/// PostgreSQL error code for a unique-constraint violation.
const PG_UNIQUE_VIOLATION: &str = "23505";

#[derive(Debug)]
pub enum AppError {
    /// A database query failed unexpectedly. Logged server-side only.
    Database(sqlx::Error),
    /// The requested resource was not found.
    NotFound(String),
    /// The request violates a business rule (e.g. insufficient stock).
    BadRequest(String),
    /// A uniqueness / capacity constraint was violated (HTTP 409).
    Conflict(String),
}

impl IntoResponse for AppError {
    fn into_response(self) -> axum::response::Response {
        let (status, message) = match self {
            AppError::Database(error) => {
                tracing::error!("database error: {}", error);
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "Database error".to_string(),
                )
            }
            AppError::NotFound(msg) => (StatusCode::NOT_FOUND, msg),
            AppError::BadRequest(msg) => (StatusCode::BAD_REQUEST, msg),
            AppError::Conflict(msg) => (StatusCode::CONFLICT, msg),
        };
        (status, Json(json!({ "error": message }))).into_response()
    }
}

impl From<sqlx::Error> for AppError {
    /// Converts a sqlx error into an `AppError`.
    ///
    /// Unique-constraint violations (PostgreSQL error code `23505`) are mapped
    /// to `AppError::Conflict` so callers don't need to inspect the raw error.
    /// Everything else becomes `AppError::Database`.
    fn from(error: sqlx::Error) -> Self {
        if let Some(db_err) = error.as_database_error() {
            if db_err.code().as_deref() == Some(PG_UNIQUE_VIOLATION) {
                return AppError::Conflict("Already exists".into());
            }
        }
        AppError::Database(error)
    }
}
