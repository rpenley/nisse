use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use serde::Deserialize;
use serde_json::json;
use uuid::Uuid;

use crate::auth::CurrentUser;
use crate::error::AppError;
use crate::models::customer::{Customer, StoreCreditLedger};
use crate::state::AppState;

/// Query params for `GET /api/customers`.
#[derive(Deserialize)]
pub struct ListParams {
    pub q: Option<String>,
}

/// Body for `POST /api/customers`.
#[derive(Deserialize)]
pub struct CreateRequest {
    pub name: String,
    pub email: String,
}

/// `GET /api/customers` — list or search customers (ILIKE on name/email, LIMIT 20).
pub async fn list(
    _current_user: CurrentUser,
    State(state): State<AppState>,
    Query(params): Query<ListParams>,
) -> impl IntoResponse {
    let result = match &params.q {
        Some(query) if !query.trim().is_empty() => {
            let pattern = format!("%{}%", query.trim());
            sqlx::query_as::<_, Customer>(
                "SELECT * FROM customers
                 WHERE name ILIKE $1 OR email ILIKE $1
                 ORDER BY name
                 LIMIT 20",
            )
            .bind(pattern)
            .fetch_all(&state.pool)
            .await
        }
        _ => {
            sqlx::query_as::<_, Customer>("SELECT * FROM customers ORDER BY name")
                .fetch_all(&state.pool)
                .await
        }
    };

    match result {
        Ok(customers) => Json(customers).into_response(),
        Err(error) => AppError::from(error).into_response(),
    }
}

/// `POST /api/customers` — create a new customer.
///
/// Returns 409 if the email is already registered.
pub async fn create(
    _current_user: CurrentUser,
    State(state): State<AppState>,
    Json(payload): Json<CreateRequest>,
) -> impl IntoResponse {
    let result = sqlx::query_as::<_, Customer>(
        "INSERT INTO customers (name, email) VALUES ($1, $2) RETURNING *",
    )
    .bind(&payload.name)
    .bind(&payload.email)
    .fetch_one(&state.pool)
    .await;

    match result {
        Ok(customer) => (StatusCode::CREATED, Json(json!(customer))).into_response(),
        Err(error) => {
            // AppError::from maps unique-violation (23505) → Conflict automatically.
            match AppError::from(error) {
                AppError::Conflict(_) => {
                    AppError::Conflict("Email already registered".into()).into_response()
                }
                other => other.into_response(),
            }
        }
    }
}

/// `GET /api/customers/:id` — fetch a customer plus their last 20 ledger entries.
pub async fn get(
    _current_user: CurrentUser,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> impl IntoResponse {
    let customer = sqlx::query_as::<_, Customer>("SELECT * FROM customers WHERE id = $1")
        .bind(id)
        .fetch_optional(&state.pool)
        .await;

    let customer = match customer {
        Ok(Some(c)) => c,
        Ok(None) => return AppError::NotFound("Customer not found".into()).into_response(),
        Err(error) => return AppError::from(error).into_response(),
    };

    let ledger = sqlx::query_as::<_, StoreCreditLedger>(
        "SELECT * FROM store_credit_ledger
         WHERE customer_id = $1
         ORDER BY created_at DESC
         LIMIT 20",
    )
    .bind(id)
    .fetch_all(&state.pool)
    .await
    .unwrap_or_default();

    Json(json!({ "customer": customer, "ledger": ledger })).into_response()
}
