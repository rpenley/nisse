# Phase 8: Enterprise Expansion & UI Overhaul

**Date:** 2026-03-29
**Status:** Approved

---

## 1. Goals

Evolve Nisse from a functional MVP into a traceable, enterprise-grade ERP system:

1. Replace blind stock number mutations with a ledger-backed transaction model.
2. Add Purchase Orders (POs) as the formal receiving workflow.
3. Add product categories.
4. Expose a dashboard metrics API.
5. Wire up the dashboard page in the frontend.
6. Add a fixed top Header to the app shell; add Purchase Orders to sidebar nav.

Dark gruvbox theme throughout — light/dark mode toggle deferred to a later task.

---

## 2. Data Model

### 2.1 New migrations (strictly additive)

| Migration | Table | Purpose |
|-----------|-------|---------|
| `...010` | `categories` | Flat-with-optional-nesting product taxonomy |
| `...011` | ALTER `products` | Add `category_id FK → categories(id) NULLABLE` |
| `...012` | `inventory_transactions` | Ledger of every stock change |
| `...013` | `distributors` | Supplier records |
| `...014` | `purchase_orders` + `purchase_order_items` | PO header and line items |

### 2.2 Table schemas

**`categories`**
```sql
id         UUID PK
name       TEXT NOT NULL UNIQUE
parent_id  UUID REFERENCES categories(id) NULLABLE
```
Parent is nullable — flat categories are the common case; nesting is available without extra schema work.

**`products` ALTER**
```sql
ALTER TABLE products ADD COLUMN category_id UUID REFERENCES categories(id);
```
Nullable so all existing rows remain valid.

**`inventory_transactions`**
```sql
id              UUID PK
product_id      UUID NOT NULL REFERENCES products(id)
user_id         UUID NOT NULL REFERENCES users(id)
quantity_change INTEGER NOT NULL  -- negative = stock removed
reason          ENUM(Sale, PoReceived, ManualAdjustment, Shrinkage)
reference_id    UUID NULLABLE     -- sale_id or po_id
created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
```

**`distributors`**
```sql
id           UUID PK
name         TEXT NOT NULL
contact_info TEXT
```

**`purchase_orders`**
```sql
id              UUID PK
distributor_id  UUID NOT NULL REFERENCES distributors(id)
status          ENUM(Draft, Ordered, Received) NOT NULL DEFAULT 'Draft'
total_cost      NUMERIC(10,2) NOT NULL DEFAULT 0
created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
```

**`purchase_order_items`**
```sql
id                UUID PK
po_id             UUID NOT NULL REFERENCES purchase_orders(id)
product_id        UUID NOT NULL REFERENCES products(id)
ordered_quantity  INTEGER NOT NULL
received_quantity INTEGER NOT NULL DEFAULT 0
unit_cost         NUMERIC(10,2) NOT NULL
```

---

## 3. Rust Ledger Layer (`src/stock.rs`)

This is the complexity layer. The DB and frontend stay simple; Rust enforces the invariant that stock can never move without a ledger entry.

### 3.1 Public API

```rust
pub enum StockReason {
    Sale,
    PoReceived,
    ManualAdjustment,
    Shrinkage,
}

/// Atomically adjusts stock and writes the ledger entry on the provided
/// transaction. Returns the new stock_quantity.
///
/// For decrements (quantity_change < 0): fails with AppError::BadRequest
/// if the product has insufficient stock.
pub async fn move_stock(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    product_id: Uuid,
    user_id: Uuid,
    quantity_change: i32,
    reason: StockReason,
    reference_id: Option<Uuid>,
) -> Result<i32, AppError>
```

### 3.2 Callers updated

| File | Change |
|------|--------|
| `src/routes/sales.rs` | Phase 1 (stock decrement) replaced with `stock::move_stock(..., StockReason::Sale, Some(sale_id))` |
| `src/routes/inventory.rs` | `PUT /api/inventory/:id` stock_quantity update replaced with `stock::move_stock(..., StockReason::ManualAdjustment, None)` |
| `src/routes/purchase_orders.rs` (new) | PO `Received` transition calls `stock::move_stock(..., StockReason::PoReceived, Some(po_id))` per item |

**Note on sales.rs ordering:** The sale row must exist before logging inventory transactions (because `inventory_transactions.reference_id` points to `sales.id`). The transaction phases become: stock check → store credit → INSERT sale → INSERT sale_items → `move_stock` for each item → credit ledger → commit.

---

## 4. Purchase Orders API (`src/routes/purchase_orders.rs`)

| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/api/purchase_orders` | Create PO in `Draft` status |
| `GET` | `/api/purchase_orders` | List all POs (with items joined) |
| `POST` | `/api/purchase_orders/:id/items` | Add item to a Draft PO |
| `PATCH` | `/api/purchase_orders/:id/status` | Advance status |

**Status transition rules:**
- `Draft → Ordered`: No side effects, just updates status.
- `Ordered → Received`: Opens a transaction, calls `move_stock` for each item (quantity = `ordered_quantity`), sets `received_quantity` on each item, sets PO `status = Received`. Atomic — failure rolls back all stock changes.
- Backwards transitions are rejected with `400 Bad Request`.

Also needed: `GET/POST /api/distributors` for managing supplier records.

---

## 5. Dashboard API (`GET /api/dashboard/metrics`)

Single endpoint. Returns all metrics in one JSON object. Uses multiple SQL queries inside a single connection (no transaction needed — reads only).

### Response shape

```json
{
  "today_revenue": "342.50",
  "credit_liability": "1820.00",
  "low_stock_count": 3,
  "low_stock": [
    { "id": "...", "sku": "...", "name": "...", "stock_quantity": 1 }
  ],
  "total_customers": 47,
  "upcoming_events": [
    { "id": "...", "title": "...", "start_time": "...", "registration_count": 4 }
  ],
  "recent_activity": [
    {
      "type": "sale",
      "description": "Cash sale — 2 items",
      "amount": "34.50",
      "created_at": "..."
    },
    {
      "type": "stock_movement",
      "description": "PO Received: Dominaria United Booster",
      "amount": null,
      "created_at": "..."
    }
  ]
}
```

### SQL strategy

- **today_revenue:** `SELECT COALESCE(SUM(total_amount), 0) FROM sales WHERE created_at >= CURRENT_DATE`
- **credit_liability:** `SELECT COALESCE(SUM(store_credit_balance), 0) FROM customers`
- **low_stock:** `SELECT id, sku, name, stock_quantity FROM products WHERE stock_quantity < 3 ORDER BY stock_quantity`
- **total_customers:** `SELECT COUNT(*) FROM customers`
- **upcoming_events:** `SELECT e.*, COUNT(r.id) AS registration_count FROM events e LEFT JOIN event_registrations r ON r.event_id = e.id WHERE e.start_time > NOW() GROUP BY e.id ORDER BY e.start_time LIMIT 3`
- **recent_activity:** `UNION ALL` of last 10 rows across `sales` and `inventory_transactions` ordered by `created_at DESC LIMIT 10`

The threshold for low stock (< 3) is a constant defined in the handler. Not configurable yet.

---

## 6. Frontend

### 6.1 App shell (`(app)/layout.tsx`)

```
(app)/layout.tsx
  <div class="flex h-screen overflow-hidden">
    <Sidebar />                    ← fixed left column, existing + PO link
    <div class="flex-1 flex flex-col overflow-hidden">
      <Header />                   ← new fixed top bar
      <main class="flex-1 overflow-y-auto bg-[#1d2021] p-6">
        {children}
      </main>
    </div>
  </div>
```

Both `<Sidebar>` and `<Header>` are Server Components (no client state needed at this stage). The `<main>` is the only scrollable region.

### 6.2 Sidebar updates

- Add "Purchase Orders" link (`/purchase-orders`)
- Keep all existing links and gruvbox styling

### 6.3 Header (`src/components/Header.tsx`)

Server Component. Shows:
- Left: Breadcrumb (current page name derived from pathname — requires `"use client"` wrapper for `usePathname`)
- Right: Username display (read from session cookie server-side, or stub for now)

Simple, no search bar yet — search is deferred.

### 6.4 Dashboard page (`(app)/dashboard/page.tsx`)

Client component. Fetches `GET /api/dashboard/metrics` on mount.

Layout:
```
[KPI Card] [KPI Card] [KPI Card] [KPI Card]   ← 4-column grid
[Recent Activity Feed (2/3)]  [Action Items (1/3)]
```

**KPI Cards:** Today's Revenue, Credit Liability, Total Customers, Low Stock Count. Each card: `bg-[#282828] border border-[#3c3836] rounded p-4`.

**Recent Activity Feed:** List of `recent_activity` items with type badge, description, amount, and relative timestamp.

**Action Items:** Low stock list + upcoming events.

---

## 7. Out of Scope (this phase)

- Global search bar in Header
- User profile dropdown / logout from Header
- PO management UI page (routes wired, no page UI yet)
- Categories management UI
- Pagination on any data table
- Light/dark mode toggle
