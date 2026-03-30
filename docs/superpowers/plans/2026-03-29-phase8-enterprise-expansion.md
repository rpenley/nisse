# Phase 8: Enterprise Expansion & UI Overhaul — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add inventory ledger, purchase orders, categories, a dashboard metrics API, and wire up the dashboard frontend page with a fixed header.

**Architecture:** Rust absorbs the enforcement complexity — all stock mutations flow through a single `stock::move_stock()` function that atomically writes both the `UPDATE products` and the `INSERT INTO inventory_transactions` on the caller's transaction. The DB and frontend stay simple: the DB is dumb storage, the frontend is a dumb consumer of `/api/dashboard/metrics`.

**Tech Stack:** Rust/Axum 0.7, sqlx 0.8, PostgreSQL, Next.js 16 App Router, React 19, Tailwind CSS v4.

---

## File Map

**Create:**
- `migrations/20260326000010_create_categories.sql`
- `migrations/20260326000011_add_category_to_products.sql`
- `migrations/20260326000012_create_inventory_transactions.sql`
- `migrations/20260326000013_create_distributors.sql`
- `migrations/20260326000014_create_purchase_orders.sql`
- `src/stock.rs` — `StockReason` enum + `move_stock()` helper
- `src/models/purchase_order.rs` — `Distributor`, `PurchaseOrder`, `PurchaseOrderItem` structs
- `src/routes/purchase_orders.rs` — PO + distributor CRUD
- `src/routes/dashboard.rs` — `GET /api/dashboard/metrics`
- `frontend/src/components/Header.tsx` — fixed top bar

**Modify:**
- `src/main.rs` — add `mod stock;`
- `src/models/mod.rs` — add `pub mod purchase_order;`
- `src/routes/mod.rs` — register PO + dashboard routes
- `src/routes/sales.rs` — replace Phase 1 stock UPDATE with SELECT FOR UPDATE; add Phase 5 move_stock calls
- `src/routes/inventory.rs` — replace stock_quantity COALESCE update with move_stock
- `src/seed.rs` — rich seed data (categories, products, customers, distributors, events, a sale)
- `frontend/src/app/(app)/layout.tsx` — add Header, fix shell structure
- `frontend/src/components/Sidebar.tsx` — add Purchase Orders link
- `frontend/src/app/(app)/dashboard/page.tsx` — full KPI dashboard

---

## Task 1: Migrations

**Files:**
- Create: `migrations/20260326000010_create_categories.sql`
- Create: `migrations/20260326000011_add_category_to_products.sql`
- Create: `migrations/20260326000012_create_inventory_transactions.sql`
- Create: `migrations/20260326000013_create_distributors.sql`
- Create: `migrations/20260326000014_create_purchase_orders.sql`

- [ ] **Step 1: Write migration 010 — categories table**

```sql
-- migrations/20260326000010_create_categories.sql
CREATE TABLE categories (
    id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name      TEXT NOT NULL UNIQUE,
    parent_id UUID REFERENCES categories(id)
);
```

- [ ] **Step 2: Write migration 011 — add category_id to products**

```sql
-- migrations/20260326000011_add_category_to_products.sql
ALTER TABLE products ADD COLUMN category_id UUID REFERENCES categories(id);
```

- [ ] **Step 3: Write migration 012 — inventory_transactions**

```sql
-- migrations/20260326000012_create_inventory_transactions.sql
CREATE TYPE stock_reason AS ENUM (
    'sale',
    'po_received',
    'manual_adjustment',
    'shrinkage'
);

CREATE TABLE inventory_transactions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id      UUID NOT NULL REFERENCES products(id),
    user_id         UUID NOT NULL REFERENCES users(id),
    quantity_change INTEGER NOT NULL,
    reason          stock_reason NOT NULL,
    reference_id    UUID,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ON inventory_transactions (product_id);
CREATE INDEX ON inventory_transactions (created_at DESC);
```

- [ ] **Step 4: Write migration 013 — distributors**

```sql
-- migrations/20260326000013_create_distributors.sql
CREATE TABLE distributors (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name         TEXT NOT NULL,
    contact_info TEXT
);
```

- [ ] **Step 5: Write migration 014 — purchase orders**

```sql
-- migrations/20260326000014_create_purchase_orders.sql
CREATE TYPE po_status AS ENUM ('draft', 'ordered', 'received');

CREATE TABLE purchase_orders (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    distributor_id UUID NOT NULL REFERENCES distributors(id),
    status         po_status NOT NULL DEFAULT 'draft',
    total_cost     NUMERIC(10, 2) NOT NULL DEFAULT 0,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE purchase_order_items (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    po_id             UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    product_id        UUID NOT NULL REFERENCES products(id),
    ordered_quantity  INTEGER NOT NULL CHECK (ordered_quantity > 0),
    received_quantity INTEGER NOT NULL DEFAULT 0,
    unit_cost         NUMERIC(10, 2) NOT NULL
);

CREATE INDEX ON purchase_orders (status);
CREATE INDEX ON purchase_order_items (po_id);
```

- [ ] **Step 6: Verify migrations apply cleanly**

```bash
cargo build 2>&1 | tail -5
```
Expected: no errors. sqlx will run migrations on server start; at compile time, if using `sqlx::query!` macros, you'd need `DATABASE_URL` set — but we use `query_as` with string literals, so compile is fine without a live DB.

- [ ] **Step 7: Commit**

```bash
git add migrations/
git commit -m "feat: migrations 010-014 — categories, inventory ledger, distributors, POs"
```

---

## Task 2: `src/stock.rs` — inventory ledger helper

**Files:**
- Create: `src/stock.rs`
- Modify: `src/main.rs`

This is the enforcement layer. Every stock mutation in the app must go through `move_stock`. It atomically updates `products.stock_quantity` and inserts into `inventory_transactions` on the provided transaction.

- [ ] **Step 1: Create `src/stock.rs`**

```rust
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
```

- [ ] **Step 2: Add `mod stock;` to `src/main.rs`**

Add after the existing `mod seed;` line:

```rust
mod stock;
```

Full updated module block (lines 1-11):
```rust
mod auth;
mod cache;
mod config;
mod db;
mod error;
mod models;
mod routes;
mod seed;
mod session;
mod state;
mod stock;
```

- [ ] **Step 3: Verify it compiles**

```bash
cargo build 2>&1 | grep -E "^error"
```
Expected: no output (no errors).

- [ ] **Step 4: Commit**

```bash
git add src/stock.rs src/main.rs
git commit -m "feat: stock::move_stock — atomic ledger-coupled stock mutations"
```

---

## Task 3: Retrofit `src/routes/sales.rs` checkout

**Files:**
- Modify: `src/routes/sales.rs`

The old Phase 1 combined stock-checking and price-reading in one `UPDATE ... RETURNING`. The new flow:
- Phase 1: `SELECT ... FOR UPDATE` to lock rows, read prices, validate stock levels
- Phase 2: store credit check/deduct (unchanged)
- Phase 3: INSERT sale
- Phase 4: INSERT sale_items
- Phase 5: `move_stock` per item (decrement + ledger, references sale_id)
- Phase 6: INSERT store_credit_ledger (unchanged)

- [ ] **Step 1: Replace `do_checkout` in `src/routes/sales.rs`**

Replace the entire `do_checkout` function (lines 74–253):

```rust
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
```

- [ ] **Step 2: Verify it compiles and existing tests pass**

```bash
cargo test --test '*' 2>&1 | tail -20
```

Note: `test_credit_fail_rolls_back_stock` still passes because stock is never decremented until Phase 5 — if Phase 2 fails (credit check), Phase 5 never runs. The rollback behavior is preserved even though stock isn't "restored" (it was never touched).

Expected output: all tests pass.

```bash
cargo build 2>&1 | grep -E "^error"
```
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/routes/sales.rs
git commit -m "feat: checkout uses move_stock for atomic ledger-coupled stock decrement"
```

---

## Task 4: Retrofit `src/routes/inventory.rs` stock update

**Files:**
- Modify: `src/routes/inventory.rs`

The `PUT /api/inventory/:id` handler currently updates `stock_quantity` directly via COALESCE. Replace this with `move_stock` when the quantity changes.

- [ ] **Step 1: Change the `update` handler signature to forward `current_user`**

Replace lines 181–190:
```rust
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
```

- [ ] **Step 2: Rewrite `do_update` to use a transaction + `move_stock`**

Replace the entire `do_update` function (lines 194–249):

```rust
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
            Json(serde_json::json!({ "product": updated, "tcg_single": single }))
                .into_response(),
        );
    }

    tx.commit().await?;
    Ok(Json(serde_json::json!(updated)).into_response())
}
```

- [ ] **Step 3: Verify it compiles and tests pass**

```bash
cargo build 2>&1 | grep -E "^error"
cargo test 2>&1 | tail -10
```
Expected: no errors, all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/routes/inventory.rs
git commit -m "feat: inventory PUT uses move_stock for ledger-coupled stock adjustment"
```

---

## Task 5: PO models and routes

**Files:**
- Create: `src/models/purchase_order.rs`
- Modify: `src/models/mod.rs`
- Create: `src/routes/purchase_orders.rs`
- Modify: `src/routes/mod.rs`

- [ ] **Step 1: Create `src/models/purchase_order.rs`**

```rust
use chrono::{DateTime, Utc};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::Type)]
#[sqlx(type_name = "po_status", rename_all = "snake_case")]
#[serde(rename_all = "snake_case")]
pub enum PoStatus {
    Draft,
    Ordered,
    Received,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct PurchaseOrder {
    pub id: Uuid,
    pub distributor_id: Uuid,
    pub status: PoStatus,
    pub total_cost: Decimal,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct PurchaseOrderItem {
    pub id: Uuid,
    pub po_id: Uuid,
    pub product_id: Uuid,
    pub ordered_quantity: i32,
    pub received_quantity: i32,
    pub unit_cost: Decimal,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Distributor {
    pub id: Uuid,
    pub name: String,
    pub contact_info: Option<String>,
}
```

- [ ] **Step 2: Add to `src/models/mod.rs`**

```rust
pub mod customer;
pub mod event;
pub mod product;
pub mod purchase_order;
pub mod sale;
pub mod user;
```

- [ ] **Step 3: Create `src/routes/purchase_orders.rs`**

```rust
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
            "Invalid status transition — only Draft→Ordered and Ordered→Received are allowed".into(),
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

        sqlx::query(
            "UPDATE purchase_orders SET total_cost = $2 WHERE id = $1",
        )
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
```

- [ ] **Step 4: Register routes in `src/routes/mod.rs`**

```rust
use axum::{
    routing::{get, patch, post, put},
    Router,
};

use crate::state::AppState;

mod auth;
mod customers;
mod dashboard;
mod events;
mod health;
mod inventory;
mod purchase_orders;
mod sales;

pub fn create_router(state: AppState) -> Router {
    let api_router = Router::new()
        .route("/auth/login", post(auth::login))
        .route("/auth/logout", post(auth::logout))
        .route("/me", get(auth::me))
        .route("/inventory", get(inventory::list).post(inventory::create))
        .route(
            "/inventory/{id}",
            put(inventory::update).delete(inventory::delete),
        )
        .route("/sales/checkout", post(sales::checkout))
        .route("/customers", get(customers::list).post(customers::create))
        .route("/customers/{id}", get(customers::get))
        .route("/events", get(events::list).post(events::create))
        .route("/events/{id}", get(events::get))
        .route("/events/{id}/register", post(events::register))
        .route(
            "/distributors",
            get(purchase_orders::list_distributors).post(purchase_orders::create_distributor),
        )
        .route(
            "/purchase_orders",
            get(purchase_orders::list_pos).post(purchase_orders::create_po),
        )
        .route(
            "/purchase_orders/{id}/items",
            get(purchase_orders::get_po_items).post(purchase_orders::add_po_item),
        )
        .route(
            "/purchase_orders/{id}/status",
            patch(purchase_orders::update_po_status),
        )
        .route("/dashboard/metrics", get(dashboard::metrics));

    Router::new()
        .route("/health", get(health::handler))
        .nest("/api", api_router)
        .with_state(state)
}
```

- [ ] **Step 5: Compile**

```bash
cargo build 2>&1 | grep -E "^error"
```
Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add src/models/purchase_order.rs src/models/mod.rs src/routes/purchase_orders.rs src/routes/mod.rs
git commit -m "feat: purchase orders — distributor and PO CRUD with ledger-coupled receiving"
```

---

## Task 6: Dashboard metrics endpoint

**Files:**
- Create: `src/routes/dashboard.rs`

- [ ] **Step 1: Create `src/routes/dashboard.rs`**

```rust
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

    let credit_liability: Decimal = sqlx::query_scalar(
        "SELECT COALESCE(SUM(store_credit_balance), 0) FROM customers",
    )
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

    let total_customers: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM customers")
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
```

- [ ] **Step 2: Verify the file is already registered in `src/routes/mod.rs`** (done in Task 5 Step 4 — `mod dashboard;` and the route are already there).

- [ ] **Step 3: Compile and run tests**

```bash
cargo build 2>&1 | grep -E "^error"
cargo test 2>&1 | tail -10
```
Expected: no errors, all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/routes/dashboard.rs
git commit -m "feat: GET /api/dashboard/metrics — revenue, credit, low stock, events, activity"
```

---

## Task 7: Expand seed data

**Files:**
- Modify: `src/seed.rs`

Replace the minimal seed with a rich dataset that gives the dashboard real numbers to display. Since data is disposable, seed aggressively.

- [ ] **Step 1: Replace `src/seed.rs`**

```rust
use rust_decimal::Decimal;
use sqlx::PgPool;
use std::str::FromStr;
use uuid::Uuid;

use crate::auth::hash_password;

pub async fn run(pool: &PgPool) {
    seed_users(pool).await;
    let (category_ids, product_ids) = seed_catalog(pool).await;
    let customer_ids = seed_customers(pool).await;
    let distributor_id = seed_distributor(pool).await;
    seed_events(pool).await;
    seed_sale(pool, &product_ids, &customer_ids).await;
    seed_po(pool, distributor_id, &product_ids).await;
    println!("Seed complete.");
    let _ = (category_ids,);
}

async fn seed_users(pool: &PgPool) {
    let hash = hash_password("admin").unwrap();
    sqlx::query(
        "INSERT INTO users (username, password_hash, role)
         VALUES ($1, $2, 'admin')
         ON CONFLICT (username) DO UPDATE SET password_hash = $2",
    )
    .bind("admin")
    .bind(&hash)
    .execute(pool)
    .await
    .unwrap();

    let cashier_hash = hash_password("cashier").unwrap();
    sqlx::query(
        "INSERT INTO users (username, password_hash, role)
         VALUES ($1, $2, 'cashier')
         ON CONFLICT (username) DO UPDATE SET password_hash = $2",
    )
    .bind("cashier")
    .bind(&cashier_hash)
    .execute(pool)
    .await
    .unwrap();

    println!("Users: admin/admin, cashier/cashier");
}

async fn seed_catalog(pool: &PgPool) -> (Vec<Uuid>, Vec<Uuid>) {
    // Categories
    let category_names = ["Board Games", "TCG Sealed", "Miniatures", "RPGs", "Accessories"];
    let mut category_ids = Vec::new();
    for name in &category_names {
        let id: Uuid = sqlx::query_scalar(
            "INSERT INTO categories (name) VALUES ($1)
             ON CONFLICT (name) DO UPDATE SET name = $1
             RETURNING id",
        )
        .bind(name)
        .fetch_one(pool)
        .await
        .unwrap();
        category_ids.push(id);
    }

    // Products: (sku, name, price, stock, category_index)
    let products: &[(&str, &str, &str, i32, usize)] = &[
        ("BG-001", "Wingspan", "49.99", 8, 0),
        ("BG-002", "Ticket to Ride", "44.99", 5, 0),
        ("BG-003", "Catan", "39.99", 12, 0),
        ("BG-004", "Pandemic", "34.99", 2, 0),
        ("TCG-001", "Magic: The Gathering — Commander Precon", "44.99", 1, 1),
        ("TCG-002", "Pokemon Scarlet & Violet Booster Box", "139.99", 0, 1),
        ("TCG-003", "Lorcana Booster Pack", "5.99", 24, 1),
        ("TCG-004", "One Piece Booster Box", "89.99", 3, 1),
        ("MINI-001", "Warhammer 40K Starter Set", "65.00", 4, 2),
        ("MINI-002", "Citadel Base Paint Set", "35.00", 7, 2),
        ("RPG-001", "D&D Player's Handbook (2024)", "49.99", 6, 3),
        ("RPG-002", "Pathfinder Core Rulebook", "59.99", 2, 3),
        ("ACC-001", "Card Sleeves (100pk)", "3.99", 48, 4),
        ("ACC-002", "Dice Tower", "19.99", 1, 4),
        ("ACC-003", "Play Mat — Forest", "24.99", 0, 4),
    ];

    let mut product_ids = Vec::new();
    for (sku, name, price, stock, category_index) in products {
        let price = Decimal::from_str(price).unwrap();
        let id: Uuid = sqlx::query_scalar(
            "INSERT INTO products (sku, name, price, stock_quantity, is_tcg_single, category_id)
             VALUES ($1, $2, $3, $4, false, $5)
             ON CONFLICT (sku) DO UPDATE SET
                 name = EXCLUDED.name,
                 price = EXCLUDED.price,
                 stock_quantity = EXCLUDED.stock_quantity,
                 category_id = EXCLUDED.category_id
             RETURNING id",
        )
        .bind(sku)
        .bind(name)
        .bind(price)
        .bind(stock)
        .bind(category_ids[*category_index])
        .fetch_one(pool)
        .await
        .unwrap();
        product_ids.push(id);
    }

    println!("Seeded {} categories, {} products", category_ids.len(), product_ids.len());
    (category_ids, product_ids)
}

async fn seed_customers(pool: &PgPool) -> Vec<Uuid> {
    let customers: &[(&str, &str, &str)] = &[
        ("Alice Merriweather", "alice@example.com", "45.00"),
        ("Bob Thornton", "bob@example.com", "0.00"),
        ("Carol Nightshade", "carol@example.com", "120.50"),
        ("Dave Holloway", "dave@example.com", "10.00"),
        ("Eve Castleton", "eve@example.com", "0.00"),
    ];

    let mut ids = Vec::new();
    for (name, email, credit) in customers {
        let credit = Decimal::from_str(credit).unwrap();
        let id: Uuid = sqlx::query_scalar(
            "INSERT INTO customers (name, email, store_credit_balance)
             VALUES ($1, $2, $3)
             ON CONFLICT (email) DO UPDATE SET
                 name = EXCLUDED.name,
                 store_credit_balance = EXCLUDED.store_credit_balance
             RETURNING id",
        )
        .bind(name)
        .bind(email)
        .bind(credit)
        .fetch_one(pool)
        .await
        .unwrap();
        ids.push(id);
    }

    println!("Seeded {} customers", ids.len());
    ids
}

async fn seed_distributor(pool: &PgPool) -> Uuid {
    let id: Uuid = sqlx::query_scalar(
        "INSERT INTO distributors (name, contact_info)
         VALUES ('ACD Game Distributors', 'orders@acd.example.com')
         ON CONFLICT DO NOTHING
         RETURNING id",
    )
    .fetch_optional(pool)
    .await
    .unwrap()
    .unwrap_or_else(|| {
        sqlx::query_scalar("SELECT id FROM distributors WHERE name = 'ACD Game Distributors'")
            .fetch_one(pool)
            .try_into()
            .unwrap_or_else(|_| Uuid::new_v4())
    });

    println!("Seeded distributor");
    id
}

async fn seed_events(pool: &PgPool) {
    let events: &[(&str, &str, &str, &str, i32)] = &[
        (
            "Friday Night Magic — Draft",
            "A weekly booster draft event. All skill levels welcome.",
            "2026-04-04 18:00:00+00",
            "2026-04-04 22:00:00+00",
            16,
        ),
        (
            "Pokemon League — Spring Cup",
            "Competitive Standard format Pokemon tournament.",
            "2026-04-06 10:00:00+00",
            "2026-04-06 17:00:00+00",
            32,
        ),
        (
            "D&D One-Shot: The Lost Mine",
            "Drop-in D&D session for beginners. Characters provided.",
            "2026-04-11 13:00:00+00",
            "2026-04-11 17:00:00+00",
            6,
        ),
        (
            "Board Game Night",
            "Open board game night. Bring your own or borrow from the library.",
            "2026-04-18 17:00:00+00",
            "2026-04-18 22:00:00+00",
            0,
        ),
    ];

    for (title, description, start, end, max_players) in events {
        sqlx::query(
            "INSERT INTO events (title, description, start_time, end_time, entry_fee, max_players)
             VALUES ($1, $2, $3::TIMESTAMPTZ, $4::TIMESTAMPTZ, 5.00, $5)
             ON CONFLICT DO NOTHING",
        )
        .bind(title)
        .bind(description)
        .bind(start)
        .bind(end)
        .bind(max_players)
        .execute(pool)
        .await
        .unwrap();
    }

    println!("Seeded {} events", events.len());
}

async fn seed_sale(pool: &PgPool, product_ids: &[Uuid], customer_ids: &[Uuid]) {
    // Get the admin user's ID.
    let user_id: Uuid =
        sqlx::query_scalar("SELECT id FROM users WHERE username = 'admin'")
            .fetch_one(pool)
            .await
            .unwrap();

    // Check if any sales already exist to avoid duplicating.
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM sales")
        .fetch_one(pool)
        .await
        .unwrap();
    if count > 0 {
        println!("Sales already exist — skipping sale seed");
        return;
    }

    let mut tx = pool.begin().await.unwrap();

    // Sale 1: cash sale for Wingspan + card sleeves
    let wingspan_id = product_ids[0]; // BG-001 Wingspan, price 49.99, stock 8
    let sleeves_id = product_ids[12]; // ACC-001 Card Sleeves, price 3.99, stock 48

    // Lock and get prices.
    let (_, _, wingspan_price, _): (Uuid, String, Decimal, i32) =
        sqlx::query_as("SELECT id, name, price, stock_quantity FROM products WHERE id = $1 FOR UPDATE")
            .bind(wingspan_id)
            .fetch_one(&mut *tx)
            .await
            .unwrap();

    let (_, _, sleeves_price, _): (Uuid, String, Decimal, i32) =
        sqlx::query_as("SELECT id, name, price, stock_quantity FROM products WHERE id = $1 FOR UPDATE")
            .bind(sleeves_id)
            .fetch_one(&mut *tx)
            .await
            .unwrap();

    let total = wingspan_price + sleeves_price * Decimal::from(2u32);

    let sale: crate::models::sale::Sale = sqlx::query_as(
        "INSERT INTO sales (user_id, customer_id, total_amount, payment_method)
         VALUES ($1, $2, $3, 'cash') RETURNING *",
    )
    .bind(user_id)
    .bind(customer_ids[0]) // Alice
    .bind(total)
    .fetch_one(&mut *tx)
    .await
    .unwrap();

    sqlx::query(
        "INSERT INTO sale_items (sale_id, product_id, quantity, unit_price) VALUES ($1, $2, 1, $3)",
    )
    .bind(sale.id)
    .bind(wingspan_id)
    .bind(wingspan_price)
    .execute(&mut *tx)
    .await
    .unwrap();

    sqlx::query(
        "INSERT INTO sale_items (sale_id, product_id, quantity, unit_price) VALUES ($1, $2, 2, $3)",
    )
    .bind(sale.id)
    .bind(sleeves_id)
    .bind(sleeves_price)
    .execute(&mut *tx)
    .await
    .unwrap();

    crate::stock::move_stock(
        &mut tx, wingspan_id, user_id, -1,
        crate::stock::StockReason::Sale, Some(sale.id),
    ).await.unwrap();

    crate::stock::move_stock(
        &mut tx, sleeves_id, user_id, -2,
        crate::stock::StockReason::Sale, Some(sale.id),
    ).await.unwrap();

    tx.commit().await.unwrap();
    println!("Seeded 1 sale totalling ${}", total);
}

async fn seed_po(pool: &PgPool, distributor_id: Uuid, product_ids: &[Uuid]) {
    // Check if any POs exist already.
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM purchase_orders")
        .fetch_one(pool)
        .await
        .unwrap();
    if count > 0 {
        println!("POs already exist — skipping PO seed");
        return;
    }

    // Create a Draft PO for restocking out-of-stock items.
    let po: crate::models::purchase_order::PurchaseOrder = sqlx::query_as(
        "INSERT INTO purchase_orders (distributor_id) VALUES ($1) RETURNING *",
    )
    .bind(distributor_id)
    .fetch_one(pool)
    .await
    .unwrap();

    let items: &[(usize, i32, &str)] = &[
        (1, 6, "39.99"),   // Ticket to Ride
        (5, 4, "109.99"),  // Pokemon Booster Box
        (14, 5, "18.50"),  // Play Mat
    ];

    for (product_index, qty, cost) in items {
        let unit_cost = Decimal::from_str(cost).unwrap();
        sqlx::query(
            "INSERT INTO purchase_order_items
                 (po_id, product_id, ordered_quantity, unit_cost)
             VALUES ($1, $2, $3, $4)",
        )
        .bind(po.id)
        .bind(product_ids[*product_index])
        .bind(qty)
        .bind(unit_cost)
        .execute(pool)
        .await
        .unwrap();
    }

    println!("Seeded 1 Draft PO with 3 items");
}
```

- [ ] **Step 2: Compile**

```bash
cargo build 2>&1 | grep -E "^error"
```
Expected: no errors.

- [ ] **Step 3: Run the seed against your local DB**

```bash
cargo run seed
```
Expected output:
```
Users: admin/admin, cashier/cashier
Seeded 5 categories, 15 products
Seeded 5 customers
Seeded distributor
Seeded 4 events
Seeded 1 sale totalling $...
Seeded 1 Draft PO with 3 items
Seed complete.
```

- [ ] **Step 4: Commit**

```bash
git add src/seed.rs
git commit -m "feat: rich seed data — categories, products, customers, distributor, events, sale, PO"
```

---

## Task 8: Frontend app shell — Header + layout

**Files:**
- Create: `frontend/src/components/Header.tsx`
- Modify: `frontend/src/app/(app)/layout.tsx`
- Modify: `frontend/src/components/Sidebar.tsx`

- [ ] **Step 1: Create `frontend/src/components/Header.tsx`**

This is a Client Component because it uses `usePathname` for breadcrumbs.

```tsx
"use client";

import { usePathname } from "next/navigation";

const ROUTE_LABELS: Record<string, string> = {
	"/dashboard": "Dashboard",
	"/pos": "Point of Sale",
	"/inventory": "Inventory",
	"/purchase-orders": "Purchase Orders",
	"/customers": "Customers",
	"/calendar": "Calendar",
	"/settings": "Settings",
};

export default function Header() {
	const pathname = usePathname();
	const label =
		Object.entries(ROUTE_LABELS).find(([route]) =>
			pathname === route || pathname.startsWith(route + "/"),
		)?.[1] ?? "Nisse";

	return (
		<header className="h-12 flex items-center justify-between px-6 border-b border-[#3c3836] bg-[#282828] shrink-0">
			<span className="text-[#a89984] font-mono text-sm">
				<span className="text-[#665c54]">Nisse</span>
				<span className="text-[#504945] mx-1">/</span>
				<span className="text-[#ebdbb2]">{label}</span>
			</span>
			<span className="text-[#665c54] font-mono text-xs">
				admin
			</span>
		</header>
	);
}
```

- [ ] **Step 2: Update `frontend/src/app/(app)/layout.tsx`**

```tsx
import Header from "@/components/Header";
import Sidebar from "@/components/Sidebar";

export default function AppLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<div className="flex h-screen overflow-hidden">
			<Sidebar />
			<div className="flex flex-col flex-1 overflow-hidden">
				<Header />
				<main className="flex-1 overflow-y-auto bg-[#1d2021] p-6">
					{children}
				</main>
			</div>
		</div>
	);
}
```

- [ ] **Step 3: Add "Purchase Orders" link to `frontend/src/components/Sidebar.tsx`**

Update the `NAV_ITEMS` array:

```tsx
const NAV_ITEMS = [
	{ href: "/dashboard", label: "Dashboard" },
	{ href: "/pos", label: "POS" },
	{ href: "/inventory", label: "Inventory" },
	{ href: "/purchase-orders", label: "Purchase Orders" },
	{ href: "/customers", label: "Customers" },
	{ href: "/calendar", label: "Calendar" },
];
```

- [ ] **Step 4: Verify the frontend builds**

```bash
cd frontend && npm run build 2>&1 | tail -15
```
Expected: build succeeds with no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/Header.tsx frontend/src/app/(app)/layout.tsx frontend/src/components/Sidebar.tsx
git commit -m "feat: app shell — fixed Header with breadcrumb, Sidebar gets Purchase Orders link"
```

---

## Task 9: Dashboard page

**Files:**
- Modify: `frontend/src/app/(app)/dashboard/page.tsx`

Replace the stub with a fully wired dashboard consuming `GET /api/dashboard/metrics`.

- [ ] **Step 1: Replace `frontend/src/app/(app)/dashboard/page.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface LowStockProduct {
	id: string;
	sku: string;
	name: string;
	stock_quantity: number;
}

interface UpcomingEvent {
	id: string;
	title: string;
	start_time: string;
	registration_count: number;
}

interface ActivityEntry {
	type: "sale" | "stock_movement";
	description: string;
	amount: string | null;
	created_at: string;
}

interface DashboardMetrics {
	today_revenue: string;
	credit_liability: string;
	low_stock_count: number;
	low_stock: LowStockProduct[];
	total_customers: number;
	upcoming_events: UpcomingEvent[];
	recent_activity: ActivityEntry[];
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Dashboard() {
	const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		fetch("/api/dashboard/metrics", { credentials: "include" })
			.then((r) => {
				if (!r.ok) throw new Error("Failed to load metrics");
				return r.json();
			})
			.then((data: DashboardMetrics) => setMetrics(data))
			.catch(() => setError("Could not load dashboard metrics"))
			.finally(() => setLoading(false));
	}, []);

	if (loading) {
		return (
			<p className="text-[#928374] font-mono text-sm">Loading…</p>
		);
	}

	if (error || !metrics) {
		return (
			<p className="text-[#fb4934] font-mono text-sm">
				{error ?? "Unknown error"}
			</p>
		);
	}

	return (
		<div className="space-y-6">
			{/* KPI row */}
			<div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
				<KpiCard
					label="Today's Revenue"
					value={`$${parseFloat(metrics.today_revenue).toFixed(2)}`}
					color="yellow"
				/>
				<KpiCard
					label="Credit Liability"
					value={`$${parseFloat(metrics.credit_liability).toFixed(2)}`}
					color="blue"
				/>
				<KpiCard
					label="Total Customers"
					value={String(metrics.total_customers)}
					color="green"
				/>
				<KpiCard
					label="Low Stock Items"
					value={String(metrics.low_stock_count)}
					color={metrics.low_stock_count > 0 ? "red" : "green"}
				/>
			</div>

			{/* Middle row: activity feed + action items */}
			<div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
				{/* Recent activity — 2/3 width */}
				<div className="xl:col-span-2 bg-[#282828] border border-[#3c3836] p-4">
					<h2 className="text-[#fabd2f] font-mono font-bold text-sm mb-4 uppercase tracking-wider">
						Recent Activity
					</h2>
					{metrics.recent_activity.length === 0 ? (
						<p className="text-[#665c54] font-mono text-sm">
							No activity yet.
						</p>
					) : (
						<ul className="space-y-2">
							{metrics.recent_activity.map((entry, index) => (
								<ActivityRow key={index} entry={entry} />
							))}
						</ul>
					)}
				</div>

				{/* Action items — 1/3 width */}
				<div className="space-y-4">
					{/* Low stock alerts */}
					<div className="bg-[#282828] border border-[#3c3836] p-4">
						<h2 className="text-[#fb4934] font-mono font-bold text-sm mb-3 uppercase tracking-wider">
							Low Stock
						</h2>
						{metrics.low_stock.length === 0 ? (
							<p className="text-[#665c54] font-mono text-xs">
								All stock levels OK.
							</p>
						) : (
							<ul className="space-y-2">
								{metrics.low_stock.map((product) => (
									<li
										key={product.id}
										className="flex justify-between items-baseline"
									>
										<span className="text-[#ebdbb2] font-mono text-xs truncate mr-2">
											{product.name}
										</span>
										<span
											className={`font-mono text-xs shrink-0 ${
												product.stock_quantity === 0
													? "text-[#fb4934]"
													: "text-[#fe8019]"
											}`}
										>
											×{product.stock_quantity}
										</span>
									</li>
								))}
							</ul>
						)}
					</div>

					{/* Upcoming events */}
					<div className="bg-[#282828] border border-[#3c3836] p-4">
						<h2 className="text-[#83a598] font-mono font-bold text-sm mb-3 uppercase tracking-wider">
							Upcoming Events
						</h2>
						{metrics.upcoming_events.length === 0 ? (
							<p className="text-[#665c54] font-mono text-xs">
								No upcoming events.
							</p>
						) : (
							<ul className="space-y-3">
								{metrics.upcoming_events.map((event) => (
									<li key={event.id}>
										<p className="text-[#ebdbb2] font-mono text-xs leading-tight">
											{event.title}
										</p>
										<div className="flex justify-between mt-1">
											<span className="text-[#665c54] font-mono text-xs">
												{new Date(
													event.start_time,
												).toLocaleDateString("en-US", {
													month: "short",
													day: "numeric",
													hour: "numeric",
													minute: "2-digit",
												})}
											</span>
											<span className="text-[#928374] font-mono text-xs">
												{event.registration_count} reg.
											</span>
										</div>
									</li>
								))}
							</ul>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}

// ── Sub-components ────────────────────────────────────────────────────────────

type KpiColor = "yellow" | "blue" | "green" | "red";

const COLOR_MAP: Record<KpiColor, string> = {
	yellow: "text-[#fabd2f]",
	blue: "text-[#83a598]",
	green: "text-[#b8bb26]",
	red: "text-[#fb4934]",
};

function KpiCard({
	label,
	value,
	color,
}: {
	label: string;
	value: string;
	color: KpiColor;
}) {
	return (
		<div className="bg-[#282828] border border-[#3c3836] p-4">
			<p className="text-[#928374] font-mono text-xs uppercase tracking-wider mb-2">
				{label}
			</p>
			<p className={`font-mono text-2xl font-bold ${COLOR_MAP[color]}`}>
				{value}
			</p>
		</div>
	);
}

function ActivityRow({ entry }: { entry: ActivityEntry }) {
	const isSale = entry.type === "sale";
	return (
		<li className="flex items-start justify-between gap-3 py-1 border-b border-[#3c3836] last:border-0">
			<div className="flex items-start gap-2 min-w-0">
				<span
					className={`shrink-0 font-mono text-xs px-1.5 py-0.5 border mt-0.5 ${
						isSale
							? "border-[#b8bb26] text-[#b8bb26]"
							: "border-[#83a598] text-[#83a598]"
					}`}
				>
					{isSale ? "SALE" : "INV"}
				</span>
				<span className="text-[#ebdbb2] font-mono text-xs leading-relaxed truncate">
					{entry.description}
				</span>
			</div>
			<div className="text-right shrink-0">
				{entry.amount !== null && (
					<p className="text-[#fabd2f] font-mono text-xs font-bold">
						${parseFloat(entry.amount).toFixed(2)}
					</p>
				)}
				<p className="text-[#665c54] font-mono text-xs">
					{new Date(entry.created_at).toLocaleTimeString("en-US", {
						hour: "numeric",
						minute: "2-digit",
					})}
				</p>
			</div>
		</li>
	);
}
```

- [ ] **Step 2: Build the frontend**

```bash
cd frontend && npm run build 2>&1 | tail -15
```
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/(app)/dashboard/page.tsx
git commit -m "feat: dashboard page — KPI cards, activity feed, low stock + upcoming events"
```

---

## Self-Review

### Spec coverage check

| Spec requirement | Task covering it |
|---|---|
| `categories` table | Task 1 (migration 010) |
| `products.category_id` FK | Task 1 (migration 011) |
| `inventory_transactions` table | Task 1 (migration 012) |
| Rule: no direct stock UPDATE without ledger | Task 2 (`stock::move_stock`) |
| `distributors` table | Task 1 (migration 013) |
| `purchase_orders` + `purchase_order_items` | Task 1 (migration 014) |
| Rule: PO `Received` triggers atomic stock + ledger | Task 5 (`update_po_status`) |
| `GET /api/dashboard/metrics` endpoint | Task 6 |
| Today's revenue, credit liability, low stock, upcoming events, recent activity | Task 6 |
| Sidebar + Header (fixed shell) | Task 8 |
| Dashboard KPI cards + activity feed + action items | Task 9 |
| Seed data for dashboard to display | Task 7 |
| `sales.rs` checkout uses `move_stock` | Task 3 |
| `inventory.rs` PUT uses `move_stock` | Task 4 |

### Items explicitly deferred (out of scope this phase)
- PO management UI page
- Categories management UI
- Global search bar in Header
- User profile dropdown
- Table pagination
- Light/dark mode toggle
