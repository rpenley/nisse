use axum::{extract::State, http::StatusCode, response::IntoResponse, Json};
use serde_json::json;

use crate::{cache, state::AppState};

pub async fn handler(State(state): State<AppState>) -> impl IntoResponse {
    let db_ok = sqlx::query("SELECT 1").fetch_one(&state.pool).await.is_ok();
    let redis_ok = cache::ping(&state.redis).await;

    let status = if db_ok && redis_ok {
        StatusCode::OK
    } else {
        StatusCode::SERVICE_UNAVAILABLE
    };

    (
        status,
        Json(json!({
            "status": if db_ok && redis_ok { "ok" } else { "degraded" },
            "db": if db_ok { "ok" } else { "error" },
            "redis": if redis_ok { "ok" } else { "error" },
        })),
    )
}
