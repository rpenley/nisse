use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use rust_decimal::Decimal;
use serde::Deserialize;
use serde_json::json;
use uuid::Uuid;

use crate::auth::CurrentUser;
use crate::error::AppError;
use crate::models::purchase_order::{Distributor, PoStatus, PurchaseOrder, PurchaseOrderItem};
use crate::state::AppState;

// ── Distributors ──────────────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct CreateDistributorRequest {
    pub name: String,
    pub contact_info: Option<String>,
}

pub async fn list_distributors(
    _current_user: CurrentUser,
    State(state): State<AppState>,
) -> impl IntoResponse {
    let rows = sqlx::query_as::<_, Distributor>("SELECT * FROM distributors ORDER BY name")
        .fetch_all(&state.pool)
        .await;
    match rows {
        Ok(distributors) => Json(distributors).into_response(),
        Err(error) => AppError::from(error).into_response(),
    }
}

pub async fn create_distributor(
    _current_user: CurrentUser,
    State(state): State<AppState>,
    Json(payload): Json<CreateDistributorRequest>,
) -> impl IntoResponse {
    let result = sqlx::query_as::<_, Distributor>(
        "INSERT INTO distributors (name, contact_info) VALUES ($1, $2) RETURNING *",
    )
    .bind(&payload.name)
    .bind(&payload.contact_info)
    .fetch_one(&state.pool)
    .await;
    match result {
        Ok(distributor) => (StatusCode::CREATED, Json(distributor)).into_response(),
        Err(error) => AppError::from(error).into_response(),
    }
}

// ── Purchase Orders ───────────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct CreatePoRequest {
    pub distributor_id: Uuid,
}

#[derive(Deserialize)]
pub struct AddPoItemRequest {
    pub product_id: Uuid,
    pub ordered_quantity: i32,
    pub unit_cost: Decimal,
}

#[derive(Deserialize)]
pub struct UpdatePoStatusRequest {
    pub status: PoStatus,
}

pub async fn list_pos(
    _current_user: CurrentUser,
    State(state): State<AppState>,
) -> impl IntoResponse {
    let pos = sqlx::query_as::<_, PurchaseOrder>(
        "SELECT * FROM purchase_orders ORDER BY created_at DESC",
    )
    .fetch_all(&state.pool)
    .await;
    match pos {
        Ok(rows) => Json(rows).into_response(),
        Err(error) => AppError::from(error).into_response(),
    }
}

pub async fn create_po(
    _current_user: CurrentUser,
    State(state): State<AppState>,
    Json(payload): Json<CreatePoRequest>,
) -> impl IntoResponse {
    let result = sqlx::query_as::<_, PurchaseOrder>(
        "INSERT INTO purchase_orders (distributor_id) VALUES ($1) RETURNING *",
    )
    .bind(payload.distributor_id)
    .fetch_one(&state.pool)
    .await;
    match result {
        Ok(po) => (StatusCode::CREATED, Json(po)).into_response(),
        Err(error) => AppError::from(error).into_response(),
    }
}

pub async fn add_po_item(
    _current_user: CurrentUser,
    State(state): State<AppState>,
    Path(po_id): Path<Uuid>,
    Json(payload): Json<AddPoItemRequest>,
) -> impl IntoResponse {
    match do_add_po_item(state, po_id, payload).await {
        Ok(item) => (StatusCode::CREATED, Json(item)).into_response(),
        Err(error) => error.into_response(),
    }
}

async fn do_add_po_item(
    state: AppState,
    po_id: Uuid,
    payload: AddPoItemRequest,
) -> Result<PurchaseOrderItem, AppError> {
    // Only allow adding items to Draft POs.
    let status: Option<PoStatus> =
        sqlx::query_scalar("SELECT status FROM purchase_orders WHERE id = $1")
            .bind(po_id)
            .fetch_optional(&state.pool)
            .await?;

    match status {
        None => return Err(AppError::NotFound("Purchase order not found".into())),
        Some(PoStatus::Ordered) | Some(PoStatus::Received) => {
            return Err(AppError::BadRequest(
                "Cannot add items to a non-Draft purchase order".into(),
            ))
        }
        Some(PoStatus::Draft) => {}
    }

    let item = sqlx::query_as::<_, PurchaseOrderItem>(
        "INSERT INTO purchase_order_items
             (po_id, product_id, ordered_quantity, unit_cost)
         VALUES ($1, $2, $3, $4)
         RETURNING *",
    )
    .bind(po_id)
    .bind(payload.product_id)
    .bind(payload.ordered_quantity)
    .bind(payload.unit_cost)
    .fetch_one(&state.pool)
    .await?;

    Ok(item)
}

pub async fn update_po_status(
    current_user: CurrentUser,
    State(state): State<AppState>,
    Path(po_id): Path<Uuid>,
    Json(payload): Json<UpdatePoStatusRequest>,
) -> impl IntoResponse {
    match do_update_po_status(current_user, state, po_id, payload).await {
        Ok(po) => Json(po).into_response(),
        Err(error) => error.into_response(),
    }
}

async fn do_update_po_status(
    current_user: CurrentUser,
    state: AppState,
    po_id: Uuid,
    payload: UpdatePoStatusRequest,
) -> Result<PurchaseOrder, AppError> {
    let mut tx = state.pool.begin().await?;

    let po = sqlx::query_as::<_, PurchaseOrder>(
        "SELECT * FROM purchase_orders WHERE id = $1 FOR UPDATE",
    )
    .bind(po_id)
    .fetch_optional(&mut *tx)
    .await?
    .ok_or_else(|| AppError::NotFound("Purchase order not found".into()))?;

    // Enforce forward-only transitions: Draft→Ordered→Received.
    let valid = matches!(
        (&po.status, &payload.status),
        (PoStatus::Draft, PoStatus::Ordered) | (PoStatus::Ordered, PoStatus::Received)
    );
    if !valid {
        return Err(AppError::BadRequest(
            "Invalid status transition — only Draft→Ordered and Ordered→Received are allowed"
                .into(),
        ));
    }

    // When receiving a PO, apply stock movements for all items atomically.
    if matches!(payload.status, PoStatus::Received) {
        let items = sqlx::query_as::<_, PurchaseOrderItem>(
            "SELECT * FROM purchase_order_items WHERE po_id = $1",
        )
        .bind(po_id)
        .fetch_all(&mut *tx)
        .await?;

        for item in &items {
            crate::stock::move_stock(
                &mut tx,
                item.product_id,
                current_user.id,
                item.ordered_quantity,
                crate::stock::StockReason::PoReceived,
                Some(po_id),
            )
            .await?;

            sqlx::query(
                "UPDATE purchase_order_items
                 SET received_quantity = ordered_quantity
                 WHERE id = $1",
            )
            .bind(item.id)
            .execute(&mut *tx)
            .await?;
        }

        // Recalculate total_cost from items.
        let total: Decimal = items
            .iter()
            .map(|i| i.unit_cost * Decimal::from(i.ordered_quantity))
            .sum();

        sqlx::query("UPDATE purchase_orders SET total_cost = $2 WHERE id = $1")
            .bind(po_id)
            .bind(total)
            .execute(&mut *tx)
            .await?;
    }

    let updated = sqlx::query_as::<_, PurchaseOrder>(
        "UPDATE purchase_orders SET status = $2 WHERE id = $1 RETURNING *",
    )
    .bind(po_id)
    .bind(&payload.status)
    .fetch_one(&mut *tx)
    .await?;

    tx.commit().await?;
    Ok(updated)
}

pub async fn get_po_items(
    _current_user: CurrentUser,
    State(state): State<AppState>,
    Path(po_id): Path<Uuid>,
) -> impl IntoResponse {
    let items = sqlx::query_as::<_, PurchaseOrderItem>(
        "SELECT * FROM purchase_order_items WHERE po_id = $1 ORDER BY id",
    )
    .bind(po_id)
    .fetch_all(&state.pool)
    .await;
    match items {
        Ok(rows) => Json(json!({ "po_id": po_id, "items": rows })).into_response(),
        Err(error) => AppError::from(error).into_response(),
    }
}
