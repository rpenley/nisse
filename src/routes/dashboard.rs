use axum::{extract::State, response::IntoResponse, Json};
use serde_json::json;

use crate::auth::CurrentUser;
use crate::state::AppState;

// TODO: full implementation in Task 6
pub async fn metrics(
    _current_user: CurrentUser,
    State(_state): State<AppState>,
) -> impl IntoResponse {
    Json(json!({}))
}
