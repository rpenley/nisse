use axum::{
    extract::{Path, Query, State},
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
use crate::models::product::{CardCondition, InventoryRow};
use crate::state::AppState;

// ── Query params ──────────────────────────────────────────────────────────────

/// Optional filter for `GET /api/inventory`.
#[derive(Deserialize)]
pub struct ListParams {
    pub is_tcg_single: Option<bool>,
}

// ── Request bodies ────────────────────────────────────────────────────────────

/// Body for `POST /api/inventory`.
#[derive(Deserialize)]
pub struct CreateRequest {
    pub sku: String,
    pub name: String,
    pub price: Decimal,
    pub stock_quantity: i32,
    pub is_tcg_single: bool,
    // Only required when is_tcg_single = true
    pub game: Option<String>,
    pub set_name: Option<String>,
    pub condition: Option<CardCondition>,
    pub foil: Option<bool>,
}

/// Body for `PUT /api/inventory/:id` — all fields optional (patch semantics).
#[derive(Deserialize)]
pub struct UpdateRequest {
    pub name: Option<String>,
    pub price: Option<Decimal>,
    pub stock_quantity: Option<i32>,
    // TCG-specific fields — only applied if the product is a single
    pub game: Option<String>,
    pub set_name: Option<String>,
    pub condition: Option<CardCondition>,
    pub foil: Option<bool>,
}

// ── Shared SQL ────────────────────────────────────────────────────────────────

const LIST_QUERY: &str = "
    SELECT
        p.id, p.sku, p.name, p.price, p.stock_quantity, p.is_tcg_single,
        t.id   AS tcg_id,
        t.game, t.set_name, t.condition, t.foil
    FROM products p
    LEFT JOIN tcg_singles t ON t.product_id = p.id
";

// ── Handlers ──────────────────────────────────────────────────────────────────

/// `GET /api/inventory` — list all products (optionally filtered by type).
pub async fn list(
    _current_user: CurrentUser,
    State(state): State<AppState>,
    Query(params): Query<ListParams>,
) -> impl IntoResponse {
    match do_list(state, params).await {
        Ok(rows) => Json(rows).into_response(),
        Err(error) => error.into_response(),
    }
}

async fn do_list(state: AppState, params: ListParams) -> Result<Vec<InventoryRow>, AppError> {
    let rows = match params.is_tcg_single {
        Some(filter) => {
            sqlx::query_as::<_, InventoryRow>(&format!(
                "{} WHERE p.is_tcg_single = $1 ORDER BY p.name",
                LIST_QUERY
            ))
            .bind(filter)
            .fetch_all(&state.pool)
            .await?
        }
        None => {
            sqlx::query_as::<_, InventoryRow>(&format!("{} ORDER BY p.name", LIST_QUERY))
                .fetch_all(&state.pool)
                .await?
        }
    };
    Ok(rows)
}

/// `POST /api/inventory` — create a product (or TCG single via two-table transaction).
pub async fn create(
    _current_user: CurrentUser,
    State(state): State<AppState>,
    Json(payload): Json<CreateRequest>,
) -> impl IntoResponse {
    match do_create(state, payload).await {
        Ok(body) => (StatusCode::CREATED, body).into_response(),
        Err(AppError::Conflict(_)) => {
            AppError::Conflict("SKU already exists".into()).into_response()
        }
        Err(error) => error.into_response(),
    }
}

async fn do_create(
    state: AppState,
    payload: CreateRequest,
) -> Result<Json<serde_json::Value>, AppError> {
    if payload.is_tcg_single
        && (payload.game.is_none() || payload.set_name.is_none() || payload.condition.is_none())
    {
        return Err(AppError::BadRequest(
            "game, set_name, and condition are required for TCG singles".into(),
        ));
    }

    if !payload.is_tcg_single {
        let product = sqlx::query_as::<_, crate::models::product::Product>(
            "INSERT INTO products (sku, name, price, stock_quantity, is_tcg_single)
             VALUES ($1, $2, $3, $4, false)
             RETURNING *",
        )
        .bind(&payload.sku)
        .bind(&payload.name)
        .bind(payload.price)
        .bind(payload.stock_quantity)
        .fetch_one(&state.pool)
        .await?;
        return Ok(Json(json!(product)));
    }

    // TCG single — two-table transaction ──────────────────────────────────────
    //
    // 1. Begin transaction.
    // 2. INSERT into products (is_tcg_single = true).
    // 3. INSERT into tcg_singles using the returned product id.
    // 4. Commit — any failure in steps 2–3 auto-rolls back on tx drop.

    let mut tx = state.pool.begin().await?;

    let product = sqlx::query_as::<_, crate::models::product::Product>(
        "INSERT INTO products (sku, name, price, stock_quantity, is_tcg_single)
         VALUES ($1, $2, $3, $4, true)
         RETURNING *",
    )
    .bind(&payload.sku)
    .bind(&payload.name)
    .bind(payload.price)
    .bind(payload.stock_quantity)
    .fetch_one(&mut *tx)
    .await?;

    let single = sqlx::query_as::<_, crate::models::product::TcgSingle>(
        "INSERT INTO tcg_singles (product_id, game, set_name, condition, foil)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *",
    )
    .bind(product.id)
    .bind(payload.game.as_deref().unwrap())
    .bind(payload.set_name.as_deref().unwrap())
    .bind(payload.condition.as_ref().unwrap())
    .bind(payload.foil.unwrap_or(false))
    .fetch_one(&mut *tx)
    .await?;

    tx.commit().await?;

    Ok(Json(json!({ "product": product, "tcg_single": single })))
}

/// `PUT /api/inventory/:id` — patch an existing product.
pub async fn update(
    current_user: CurrentUser,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    Json(payload): Json<UpdateRequest>,
) -> impl IntoResponse {
    match do_update(current_user, state, id, payload).await {
        Ok(body) => body.into_response(),
        Err(error) => error.into_response(),
    }
}

async fn do_update(
    current_user: CurrentUser,
    state: AppState,
    id: Uuid,
    payload: UpdateRequest,
) -> Result<axum::response::Response, AppError> {
    let mut tx = state.pool.begin().await?;

    // Lock the row and read current values.
    let existing = sqlx::query_as::<_, crate::models::product::Product>(
        "SELECT * FROM products WHERE id = $1 FOR UPDATE",
    )
    .bind(id)
    .fetch_optional(&mut *tx)
    .await?
    .ok_or_else(|| AppError::NotFound("Product not found".into()))?;

    // Update non-stock fields (name, price).
    let updated = sqlx::query_as::<_, crate::models::product::Product>(
        "UPDATE products SET
             name  = COALESCE($2, name),
             price = COALESCE($3, price)
         WHERE id = $1
         RETURNING *",
    )
    .bind(id)
    .bind(&payload.name)
    .bind(payload.price)
    .fetch_one(&mut *tx)
    .await?;

    // If stock_quantity is changing, use move_stock so the ledger is written.
    let updated = if let Some(new_qty) = payload.stock_quantity {
        let delta = new_qty - existing.stock_quantity;
        if delta != 0 {
            let new_stock = crate::stock::move_stock(
                &mut tx,
                id,
                current_user.id,
                delta,
                crate::stock::StockReason::ManualAdjustment,
                None,
            )
            .await?;
            crate::models::product::Product {
                stock_quantity: new_stock,
                ..updated
            }
        } else {
            updated
        }
    } else {
        updated
    };

    // Update TCG single fields if applicable.
    if existing.is_tcg_single
        && (payload.game.is_some()
            || payload.set_name.is_some()
            || payload.condition.is_some()
            || payload.foil.is_some())
    {
        let single = sqlx::query_as::<_, crate::models::product::TcgSingle>(
            "UPDATE tcg_singles SET
                 game      = COALESCE($2, game),
                 set_name  = COALESCE($3, set_name),
                 condition = COALESCE($4, condition),
                 foil      = COALESCE($5, foil)
             WHERE product_id = $1
             RETURNING *",
        )
        .bind(id)
        .bind(&payload.game)
        .bind(&payload.set_name)
        .bind(&payload.condition)
        .bind(payload.foil)
        .fetch_one(&mut *tx)
        .await?;

        tx.commit().await?;
        return Ok(
            Json(json!({ "product": updated, "tcg_single": single })).into_response(),
        );
    }

    tx.commit().await?;
    Ok(Json(json!(updated)).into_response())
}

/// `DELETE /api/inventory/:id` — remove a product (CASCADE deletes tcg_singles row).
pub async fn delete(
    _current_user: CurrentUser,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> impl IntoResponse {
    let result = sqlx::query("DELETE FROM products WHERE id = $1")
        .bind(id)
        .execute(&state.pool)
        .await;

    match result {
        Ok(outcome) if outcome.rows_affected() == 0 => {
            AppError::NotFound("Product not found".into()).into_response()
        }
        Ok(_) => StatusCode::NO_CONTENT.into_response(),
        Err(error) => AppError::from(error).into_response(),
    }
}
