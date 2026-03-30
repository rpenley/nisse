use axum::{extract::State, response::IntoResponse, Json};
use chrono::{DateTime, Utc};
use rust_decimal::Decimal;
use serde::Serialize;
use uuid::Uuid;

use crate::auth::CurrentUser;
use crate::error::AppError;
use crate::state::AppState;

const LOW_STOCK_THRESHOLD: i32 = 3;

#[derive(Serialize, sqlx::FromRow)]
struct LowStockProduct {
    id: Uuid,
    sku: String,
    name: String,
    stock_quantity: i32,
}

#[derive(Serialize, sqlx::FromRow)]
struct UpcomingEvent {
    id: Uuid,
    title: String,
    start_time: DateTime<Utc>,
    registration_count: i64,
}

#[derive(Serialize, sqlx::FromRow)]
struct ActivityEntry {
    #[serde(rename = "type")]
    #[sqlx(rename = "type")]
    activity_type: String,
    description: String,
    amount: Option<Decimal>,
    created_at: DateTime<Utc>,
}

#[derive(Serialize)]
struct DashboardMetrics {
    today_revenue: Decimal,
    credit_liability: Decimal,
    low_stock_count: i64,
    low_stock: Vec<LowStockProduct>,
    total_customers: i64,
    upcoming_events: Vec<UpcomingEvent>,
    recent_activity: Vec<ActivityEntry>,
}

pub async fn metrics(
    _current_user: CurrentUser,
    State(state): State<AppState>,
) -> impl IntoResponse {
    match do_metrics(state).await {
        Ok(data) => Json(data).into_response(),
        Err(error) => error.into_response(),
    }
}

async fn do_metrics(state: AppState) -> Result<DashboardMetrics, AppError> {
    let today_revenue: Decimal = sqlx::query_scalar(
        "SELECT COALESCE(SUM(total_amount), 0)
         FROM sales
         WHERE created_at >= CURRENT_DATE",
    )
    .fetch_one(&state.pool)
    .await?;

    let credit_liability: Decimal =
        sqlx::query_scalar("SELECT COALESCE(SUM(store_credit_balance), 0) FROM customers")
            .fetch_one(&state.pool)
            .await?;

    let low_stock = sqlx::query_as::<_, LowStockProduct>(
        "SELECT id, sku, name, stock_quantity
         FROM products
         WHERE stock_quantity < $1
         ORDER BY stock_quantity, name",
    )
    .bind(LOW_STOCK_THRESHOLD)
    .fetch_all(&state.pool)
    .await?;

    let total_customers: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM customers")
        .fetch_one(&state.pool)
        .await?;

    let upcoming_events = sqlx::query_as::<_, UpcomingEvent>(
        "SELECT e.id, e.title, e.start_time, COUNT(r.id) AS registration_count
         FROM events e
         LEFT JOIN event_registrations r ON r.event_id = e.id
         WHERE e.start_time > NOW()
         GROUP BY e.id, e.title, e.start_time
         ORDER BY e.start_time
         LIMIT 3",
    )
    .fetch_all(&state.pool)
    .await?;

    let recent_activity = sqlx::query_as::<_, ActivityEntry>(
        "SELECT type, description, amount, created_at FROM (
             SELECT
                 'sale'::TEXT AS type,
                 'Sale: ' || payment_method::TEXT || ' — $' || total_amount::TEXT AS description,
                 total_amount AS amount,
                 created_at
             FROM sales
             UNION ALL
             SELECT
                 'stock_movement'::TEXT AS type,
                 reason::TEXT || ': ' || p.name || ' (' || it.quantity_change::TEXT || ')' AS description,
                 NULL::NUMERIC AS amount,
                 it.created_at
             FROM inventory_transactions it
             JOIN products p ON p.id = it.product_id
         ) combined
         ORDER BY created_at DESC
         LIMIT 10",
    )
    .fetch_all(&state.pool)
    .await?;

    Ok(DashboardMetrics {
        today_revenue,
        credit_liability,
        low_stock_count: low_stock.len() as i64,
        low_stock,
        total_customers,
        upcoming_events,
        recent_activity,
    })
}
