use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use chrono::{DateTime, Utc};
use rust_decimal::Decimal;
use serde::Deserialize;
use serde_json::json;
use uuid::Uuid;

use crate::auth::CurrentUser;
use crate::error::AppError;
use crate::models::customer::CreditActionType;
use crate::models::event::{
    EventRegistration, EventWithCount, RegistrationStatus, RegistrationWithCustomer,
};
use crate::state::AppState;

// ── Request bodies ─────────────────────────────────────────────────────────────

/// Query params for `GET /api/events`.
#[derive(Deserialize)]
pub struct ListParams {
    pub from: Option<DateTime<Utc>>,
    pub to: Option<DateTime<Utc>>,
}

/// Body for `POST /api/events`.
#[derive(Deserialize)]
pub struct CreateRequest {
    pub title: String,
    pub description: Option<String>,
    pub start_time: DateTime<Utc>,
    pub end_time: DateTime<Utc>,
    pub entry_fee: Decimal,
    pub max_players: i32,
}

/// Body for `POST /api/events/:id/register`.
#[derive(Deserialize)]
pub struct RegisterRequest {
    pub customer_id: Uuid,
    /// If true, deduct `entry_fee` from the customer's store credit balance.
    pub pay_with_credit: Option<bool>,
}

// ── Handlers ───────────────────────────────────────────────────────────────────

/// `GET /api/events` — list events, optionally filtered by `?from=&to=` date range.
pub async fn list(
    _current_user: CurrentUser,
    State(state): State<AppState>,
    Query(params): Query<ListParams>,
) -> impl IntoResponse {
    let result = match (params.from, params.to) {
        (Some(from), Some(to)) => {
            sqlx::query_as::<_, EventWithCount>(
                "SELECT e.*,
                        COUNT(r.id) AS registered_count
                 FROM events e
                 LEFT JOIN event_registrations r ON r.event_id = e.id
                 WHERE e.start_time >= $1 AND e.start_time < $2
                 GROUP BY e.id
                 ORDER BY e.start_time",
            )
            .bind(from)
            .bind(to)
            .fetch_all(&state.pool)
            .await
        }
        _ => {
            sqlx::query_as::<_, EventWithCount>(
                "SELECT e.*,
                        COUNT(r.id) AS registered_count
                 FROM events e
                 LEFT JOIN event_registrations r ON r.event_id = e.id
                 GROUP BY e.id
                 ORDER BY e.start_time",
            )
            .fetch_all(&state.pool)
            .await
        }
    };

    match result {
        Ok(events) => Json(events).into_response(),
        Err(error) => AppError::from(error).into_response(),
    }
}

/// `POST /api/events` — create a new event.
pub async fn create(
    _current_user: CurrentUser,
    State(state): State<AppState>,
    Json(payload): Json<CreateRequest>,
) -> impl IntoResponse {
    let result = sqlx::query_as::<_, EventWithCount>(
        "INSERT INTO events (title, description, start_time, end_time, entry_fee, max_players)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *, 0::BIGINT AS registered_count",
    )
    .bind(&payload.title)
    .bind(&payload.description)
    .bind(payload.start_time)
    .bind(payload.end_time)
    .bind(payload.entry_fee)
    .bind(payload.max_players)
    .fetch_one(&state.pool)
    .await;

    match result {
        Ok(event) => (StatusCode::CREATED, Json(event)).into_response(),
        Err(error) => AppError::from(error).into_response(),
    }
}

/// `GET /api/events/:id` — event detail with full registrations list.
pub async fn get(
    _current_user: CurrentUser,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> impl IntoResponse {
    let event = sqlx::query_as::<_, EventWithCount>(
        "SELECT e.*,
                COUNT(r.id) AS registered_count
         FROM events e
         LEFT JOIN event_registrations r ON r.event_id = e.id
         WHERE e.id = $1
         GROUP BY e.id",
    )
    .bind(id)
    .fetch_optional(&state.pool)
    .await;

    let event = match event {
        Ok(Some(e)) => e,
        Ok(None) => return AppError::NotFound("Event not found".into()).into_response(),
        Err(error) => return AppError::from(error).into_response(),
    };

    let registrations = sqlx::query_as::<_, RegistrationWithCustomer>(
        "SELECT r.id, r.customer_id, c.name AS customer_name,
                r.payment_status, r.registered_at
         FROM event_registrations r
         JOIN customers c ON c.id = r.customer_id
         WHERE r.event_id = $1
         ORDER BY r.registered_at",
    )
    .bind(id)
    .fetch_all(&state.pool)
    .await
    .unwrap_or_default();

    Json(json!({ "event": event, "registrations": registrations })).into_response()
}

/// `POST /api/events/:id/register` — register a customer for an event.
///
/// Uses `SELECT ... FOR UPDATE` to serialize concurrent registrations and
/// prevent capacity from being exceeded. Optionally deducts `entry_fee` from
/// the customer's store credit balance in the same transaction.
pub async fn register(
    current_user: CurrentUser,
    State(state): State<AppState>,
    Path(event_id): Path<Uuid>,
    Json(payload): Json<RegisterRequest>,
) -> impl IntoResponse {
    match do_register(current_user, state, event_id, payload).await {
        Ok(registration) => (StatusCode::CREATED, Json(registration)).into_response(),
        Err(error) => error.into_response(),
    }
}

async fn do_register(
    current_user: CurrentUser,
    state: AppState,
    event_id: Uuid,
    payload: RegisterRequest,
) -> Result<EventRegistration, AppError> {
    let pay_with_credit = payload.pay_with_credit.unwrap_or(false);

    let mut tx = state.pool.begin().await?;

    // ── Lock event row + capacity check ────────────────────────────────────────
    //
    // FOR UPDATE serializes concurrent registrations on this event row.
    // The subquery re-counts registrations inside the transaction so the check
    // is always consistent with the row we just locked.

    let event = sqlx::query_as::<_, EventWithCount>(
        "SELECT e.*,
                (SELECT COUNT(*) FROM event_registrations WHERE event_id = e.id) AS registered_count
         FROM events e
         WHERE e.id = $1
         FOR UPDATE",
    )
    .bind(event_id)
    .fetch_optional(&mut *tx)
    .await?
    .ok_or_else(|| AppError::NotFound("Event not found".into()))?;

    if event.max_players > 0 && event.registered_count >= event.max_players as i64 {
        return Err(AppError::Conflict("Event is full".into()));
    }

    // ── Optional store credit deduction ────────────────────────────────────────

    let payment_status = if pay_with_credit && event.entry_fee > Decimal::ZERO {
        let decremented: Option<Decimal> = sqlx::query_scalar(
            "UPDATE customers
             SET store_credit_balance = store_credit_balance - $1
             WHERE id = $2 AND store_credit_balance >= $1
             RETURNING store_credit_balance",
        )
        .bind(event.entry_fee)
        .bind(payload.customer_id)
        .fetch_optional(&mut *tx)
        .await
        .unwrap_or(None);

        if decremented.is_none() {
            return Err(AppError::BadRequest("Insufficient store credit".into()));
        }

        sqlx::query(
            "INSERT INTO store_credit_ledger
                 (customer_id, staff_user_id, amount_changed, action_type)
             VALUES ($1, $2, $3, $4)",
        )
        .bind(payload.customer_id)
        .bind(current_user.id)
        .bind(-event.entry_fee)
        .bind(CreditActionType::Manual)
        .execute(&mut *tx)
        .await?;

        RegistrationStatus::Paid
    } else {
        RegistrationStatus::Pending
    };

    // ── Insert registration ────────────────────────────────────────────────────

    let registration: EventRegistration = sqlx::query_as(
        "INSERT INTO event_registrations (event_id, customer_id, payment_status)
         VALUES ($1, $2, $3)
         RETURNING *",
    )
    .bind(event_id)
    .bind(payload.customer_id)
    .bind(&payment_status)
    .fetch_one(&mut *tx)
    .await
    .map_err(|error| match AppError::from(error) {
        AppError::Conflict(_) => {
            AppError::Conflict("Customer is already registered for this event".into())
        }
        other => other,
    })?;

    tx.commit().await?;

    Ok(registration)
}
