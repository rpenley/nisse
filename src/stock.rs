use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::error::AppError;

/// Reason for a stock quantity change — stored in `inventory_transactions.reason`.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, sqlx::Type)]
#[sqlx(type_name = "stock_reason", rename_all = "snake_case")]
#[serde(rename_all = "snake_case")]
pub enum StockReason {
    Sale,
    PoReceived,
    ManualAdjustment,
    Shrinkage,
}

/// Atomically adjusts `products.stock_quantity` by `quantity_change` and writes
/// a corresponding row to `inventory_transactions`, both on the provided
/// transaction. Callers control the transaction boundary.
///
/// Returns the new `stock_quantity`.
///
/// Fails with `AppError::BadRequest` if the adjustment would make
/// `stock_quantity` go below zero.
pub async fn move_stock(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    product_id: Uuid,
    user_id: Uuid,
    quantity_change: i32,
    reason: StockReason,
    reference_id: Option<Uuid>,
) -> Result<i32, AppError> {
    let new_qty: Option<i32> = sqlx::query_scalar(
        "UPDATE products
         SET stock_quantity = stock_quantity + $1
         WHERE id = $2 AND stock_quantity + $1 >= 0
         RETURNING stock_quantity",
    )
    .bind(quantity_change)
    .bind(product_id)
    .fetch_optional(&mut **tx)
    .await?;

    let new_qty = new_qty.ok_or_else(|| {
        AppError::BadRequest("Insufficient stock or product not found".into())
    })?;

    sqlx::query(
        "INSERT INTO inventory_transactions
             (product_id, user_id, quantity_change, reason, reference_id)
         VALUES ($1, $2, $3, $4, $5)",
    )
    .bind(product_id)
    .bind(user_id)
    .bind(quantity_change)
    .bind(reason)
    .bind(reference_id)
    .execute(&mut **tx)
    .await?;

    Ok(new_qty)
}
