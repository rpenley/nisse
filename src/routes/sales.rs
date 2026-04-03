use axum::{extract::State, http::StatusCode, response::IntoResponse, Json};
use rust_decimal::Decimal;
use serde::Deserialize;
use serde_json::json;
use uuid::Uuid;

use crate::auth::CurrentUser;
use crate::error::AppError;
use crate::models::customer::CreditActionType;
use crate::models::sale::{PaymentMethod, Sale};
use crate::state::AppState;

// ── Request body ──────────────────────────────────────────────────────────────

/// One product + quantity in the checkout cart.
#[derive(Deserialize)]
pub struct CartItem {
    pub product_id: Uuid,
    pub quantity: i32,
}

/// Full checkout request body sent by the POS frontend.
#[derive(Deserialize)]
pub struct CheckoutRequest {
    pub payment_method: PaymentMethod,
    /// Required when `payment_method` is `StoreCredit` or `Split`.
    pub customer_id: Option<Uuid>,
    /// For `Split` only: the store-credit portion. Must be `> 0` and `< total`.
    pub store_credit_amount: Option<Decimal>,
    pub items: Vec<CartItem>,
}

// ── Internal helpers ──────────────────────────────────────────────────────────

struct LineItem {
    product_id: Uuid,
    unit_price: Decimal,
    quantity: i32,
}

// ── Handler ───────────────────────────────────────────────────────────────────

/// `POST /api/sales/checkout` — complete a sale atomically.
///
/// The handler runs a five-phase transaction:
/// 1. Atomically decrement stock for every cart item (`WHERE stock >= qty`).
/// 2. Deduct store credit if applicable (`WHERE balance >= amount`).
/// 3. Insert the `sales` header row.
/// 4. Insert `sale_items` rows.
/// 5. Write a `store_credit_ledger` audit entry.
///
/// The `Transaction` is dropped (auto-rollback) on any early error return, so
/// partial mutations never persist.
pub async fn checkout(
    current_user: CurrentUser,
    State(state): State<AppState>,
    Json(payload): Json<CheckoutRequest>,
) -> impl IntoResponse {
    match do_checkout(current_user, state, payload).await {
        Ok(sale) => (
            StatusCode::CREATED,
            Json(json!({
                "sale_id": sale.id,
                "total":   sale.total_amount,
                "payment_method": sale.payment_method,
                "created_at":     sale.created_at,
            })),
        )
            .into_response(),
        Err(error) => error.into_response(),
    }
}

async fn do_checkout(
    current_user: CurrentUser,
    state: AppState,
    payload: CheckoutRequest,
) -> Result<Sale, AppError> {
    // ── Basic validation ───────────────────────────────────────────────────

    if payload.items.is_empty() {
        return Err(AppError::BadRequest("Cart is empty".into()));
    }

    for item in &payload.items {
        if item.quantity <= 0 {
            return Err(AppError::BadRequest(
                "Quantity must be greater than zero".into(),
            ));
        }
    }

    let uses_credit = matches!(
        payload.payment_method,
        PaymentMethod::StoreCredit | PaymentMethod::Split
    );

    if uses_credit && payload.customer_id.is_none() {
        return Err(AppError::BadRequest(
            "customer_id is required for store credit payments".into(),
        ));
    }

    // ── Begin transaction ──────────────────────────────────────────────────

    let mut tx = state.pool.begin().await?;

    // ── Phase 1: lock product rows and compute line items ──────────────────
    //
    // SELECT FOR UPDATE locks each product row for the duration of the
    // transaction, preventing concurrent checkouts from racing on the last
    // unit. We validate stock here and read the server-side price; the actual
    // decrement happens in Phase 5 after the sale row is created.

    let mut line_items: Vec<LineItem> = Vec::new();
    let mut total = Decimal::ZERO;

    for item in &payload.items {
        let row: Option<(Uuid, String, Decimal, i32)> = sqlx::query_as(
            "SELECT id, name, price, stock_quantity
             FROM products
             WHERE id = $1
             FOR UPDATE",
        )
        .bind(item.product_id)
        .fetch_optional(&mut *tx)
        .await?;

        match row {
            Some((product_id, name, price, stock)) => {
                if stock < item.quantity {
                    return Err(AppError::BadRequest(format!(
                        "'{}' has insufficient stock",
                        name
                    )));
                }
                total += price * Decimal::from(item.quantity);
                line_items.push(LineItem {
                    product_id,
                    unit_price: price,
                    quantity: item.quantity,
                });
            }
            None => {
                return Err(AppError::BadRequest(format!(
                    "Product {} not found",
                    item.product_id
                )));
            }
        }
    }

    // ── Phase 2: store credit deduction ───────────────────────────────────
    //
    // Single-statement atomic test-and-decrement: the UPDATE only proceeds
    // when the customer has sufficient balance, preventing double-spend races.

    let credit_used = if uses_credit {
        let customer_id = payload.customer_id.unwrap();

        let credit_to_use = match payload.payment_method {
            PaymentMethod::StoreCredit => total,
            PaymentMethod::Split => match payload.store_credit_amount {
                Some(a) if a > Decimal::ZERO && a < total => a,
                Some(a) if a >= total => {
                    return Err(AppError::BadRequest(
                        "Store credit amount must be less than the total for a split payment"
                            .into(),
                    ));
                }
                _ => {
                    return Err(AppError::BadRequest(
                        "store_credit_amount must be greater than zero".into(),
                    ));
                }
            },
            _ => unreachable!(),
        };

        let decremented: Option<Decimal> = sqlx::query_scalar(
            "UPDATE customers
             SET store_credit_balance = store_credit_balance - $1
             WHERE id = $2 AND store_credit_balance >= $1
             RETURNING store_credit_balance",
        )
        .bind(credit_to_use)
        .bind(customer_id)
        .fetch_optional(&mut *tx)
        .await
        .unwrap_or(None);

        if decremented.is_none() {
            return Err(AppError::BadRequest("Insufficient store credit".into()));
        }

        Some((customer_id, credit_to_use))
    } else {
        None
    };

    // ── Phase 3: record the sale ───────────────────────────────────────────

    let sale: Sale = sqlx::query_as(
        "INSERT INTO sales (user_id, customer_id, total_amount, payment_method)
         VALUES ($1, $2, $3, $4)
         RETURNING *",
    )
    .bind(current_user.id)
    .bind(payload.customer_id)
    .bind(total)
    .bind(&payload.payment_method)
    .fetch_one(&mut *tx)
    .await?;

    // ── Phase 4: record line items ─────────────────────────────────────────

    for item in &line_items {
        sqlx::query(
            "INSERT INTO sale_items (sale_id, product_id, quantity, unit_price)
             VALUES ($1, $2, $3, $4)",
        )
        .bind(sale.id)
        .bind(item.product_id)
        .bind(item.quantity)
        .bind(item.unit_price)
        .execute(&mut *tx)
        .await?;
    }

    // ── Phase 5: decrement stock + write inventory ledger ─────────────────
    //
    // move_stock atomically updates stock_quantity and inserts a ledger row
    // referencing the sale. This runs after the sale row exists so the
    // reference_id FK is valid.

    for item in &line_items {
        crate::stock::move_stock(
            &mut tx,
            item.product_id,
            current_user.id,
            -item.quantity,
            crate::stock::StockReason::Sale,
            Some(sale.id),
        )
        .await?;
    }

    // ── Phase 6: audit ledger entry for credit used ────────────────────────

    if let Some((customer_id, credit_to_use)) = credit_used {
        sqlx::query(
            "INSERT INTO store_credit_ledger
                 (customer_id, staff_user_id, amount_changed, action_type, sale_id)
             VALUES ($1, $2, $3, $4, $5)",
        )
        .bind(customer_id)
        .bind(current_user.id)
        .bind(-credit_to_use)
        .bind(CreditActionType::Sale)
        .bind(sale.id)
        .execute(&mut *tx)
        .await?;
    }

    // ── Commit ─────────────────────────────────────────────────────────────

    tx.commit().await?;

    Ok(sale)
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use rust_decimal::prelude::FromPrimitive;
    use sqlx::PgPool;
    use uuid::Uuid;

    fn make_state(pool: PgPool) -> AppState {
        let redis = redis::Client::open("redis://127.0.0.1/").unwrap();
        AppState { pool, redis }
    }

    fn fake_user() -> CurrentUser {
        CurrentUser {
            id: Uuid::new_v4(),
            username: "test".into(),
            role: crate::models::user::UserRole::Cashier,
            theme_preference: "light".into(),
        }
    }

    /// Seed a product and optionally a customer. Returns `(product_id, customer_id)`.
    async fn seed(pool: &PgPool, stock: i32, credit: Option<&str>) -> (Uuid, Option<Uuid>) {
        let product_id: Uuid = sqlx::query_scalar(
            "INSERT INTO products (name, sku, price, stock_quantity, is_tcg_single)
             VALUES ('Widget', 'TEST-001', 10.00, $1, false)
             RETURNING id",
        )
        .bind(stock)
        .fetch_one(pool)
        .await
        .unwrap();

        // Also insert a user row to satisfy the FK on sales.user_id.
        sqlx::query(
            "INSERT INTO users (username, password_hash, role)
             VALUES ('teststaff', 'x', 'cashier')
             ON CONFLICT DO NOTHING",
        )
        .execute(pool)
        .await
        .unwrap();

        let customer_id = if let Some(balance) = credit {
            let balance: Decimal = balance.parse().unwrap();
            let id: Uuid = sqlx::query_scalar(
                "INSERT INTO customers (name, email, store_credit_balance)
                 VALUES ('Test Customer', 'test@example.com', $1)
                 RETURNING id",
            )
            .bind(balance)
            .fetch_one(pool)
            .await
            .unwrap();
            Some(id)
        } else {
            None
        };

        (product_id, customer_id)
    }

    /// Attempting to buy more than available stock must return a BadRequest
    /// error and must NOT modify stock_quantity (the transaction rolled back).
    #[sqlx::test(migrations = "./migrations")]
    async fn test_out_of_stock_rolls_back(pool: PgPool) {
        let (product_id, _) = seed(&pool, 1, None).await;

        let payload = CheckoutRequest {
            payment_method: PaymentMethod::Cash,
            customer_id: None,
            store_credit_amount: None,
            items: vec![CartItem {
                product_id,
                quantity: 99,
            }],
        };

        let result = do_checkout(fake_user(), make_state(pool.clone()), payload).await;
        assert!(matches!(result, Err(AppError::BadRequest(_))));

        let remaining: i32 =
            sqlx::query_scalar("SELECT stock_quantity FROM products WHERE id = $1")
                .bind(product_id)
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(remaining, 1);
    }

    /// Phase 1 (stock decrement) succeeds but Phase 2 (credit deduction)
    /// fails because the customer has $0 balance. The whole transaction must
    /// roll back, restoring stock_quantity to its original value.
    #[sqlx::test(migrations = "./migrations")]
    async fn test_credit_fail_rolls_back_stock(pool: PgPool) {
        let (product_id, customer_id) = seed(&pool, 1, Some("0.00")).await;

        let payload = CheckoutRequest {
            payment_method: PaymentMethod::StoreCredit,
            customer_id,
            store_credit_amount: None,
            items: vec![CartItem {
                product_id,
                quantity: 1,
            }],
        };

        let result = do_checkout(fake_user(), make_state(pool.clone()), payload).await;
        assert!(matches!(result, Err(AppError::BadRequest(_))));

        let remaining: i32 =
            sqlx::query_scalar("SELECT stock_quantity FROM products WHERE id = $1")
                .bind(product_id)
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(remaining, 1, "stock must be restored after rollback");
    }

    /// Empty cart is rejected before any database work.
    #[sqlx::test(migrations = "./migrations")]
    async fn test_rejects_empty_cart(pool: PgPool) {
        let payload = CheckoutRequest {
            payment_method: PaymentMethod::Cash,
            customer_id: None,
            store_credit_amount: None,
            items: vec![],
        };
        let result = do_checkout(fake_user(), make_state(pool), payload).await;
        assert!(matches!(result, Err(AppError::BadRequest(_))));
    }

    /// Split with credit_amount >= total must be rejected.
    #[sqlx::test(migrations = "./migrations")]
    async fn test_split_credit_exceeds_total(pool: PgPool) {
        let (product_id, customer_id) = seed(&pool, 5, Some("100.00")).await;

        let payload = CheckoutRequest {
            payment_method: PaymentMethod::Split,
            customer_id,
            store_credit_amount: Some(Decimal::from_f64(10.00).unwrap()), // == product price
            items: vec![CartItem {
                product_id,
                quantity: 1,
            }],
        };

        let result = do_checkout(fake_user(), make_state(pool), payload).await;
        assert!(matches!(result, Err(AppError::BadRequest(_))));
    }

    /// Happy-path cash sale: stock decrements, sale row created.
    #[sqlx::test(migrations = "./migrations")]
    async fn test_cash_checkout_happy_path(pool: PgPool) {
        let (product_id, _) = seed(&pool, 5, None).await;

        // Seed the user with a known ID so the FK resolves.
        let user_id: Uuid = sqlx::query_scalar("SELECT id FROM users WHERE username = 'teststaff'")
            .fetch_one(&pool)
            .await
            .unwrap();

        let user = CurrentUser {
            id: user_id,
            username: "teststaff".into(),
            role: crate::models::user::UserRole::Cashier,
            theme_preference: "light".into(),
        };

        let payload = CheckoutRequest {
            payment_method: PaymentMethod::Cash,
            customer_id: None,
            store_credit_amount: None,
            items: vec![CartItem {
                product_id,
                quantity: 2,
            }],
        };

        let result = do_checkout(user, make_state(pool.clone()), payload).await;
        assert!(result.is_ok(), "checkout should succeed: {:?}", result);

        let remaining: i32 =
            sqlx::query_scalar("SELECT stock_quantity FROM products WHERE id = $1")
                .bind(product_id)
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(remaining, 3);
    }
}
