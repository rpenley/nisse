# Nisse

Open-source ERP and Point of Sale system for local game stores. Handles inventory (sealed products and TCG singles), sales with store credit, customer management, and event scheduling.

**Stack:** Rust + Axum · PostgreSQL + sqlx · Redis · Next.js 16 (App Router) · Tailwind CSS v4

---

## Quick Start

### Option A — Fully containerised (recommended)

Requires Docker + Docker Compose only. No Rust or Node.js installation needed.

```bash
# Start all four services (postgres, redis, backend, frontend)
docker-compose up

# First time only: seed the default admin user
docker-compose exec backend cargo run seed
```

Open `http://localhost:4242` and log in with `admin` / `admin`. Both the backend and frontend support hot-reload — the backend uses `bacon` and the frontend uses Next.js dev mode, so source edits are picked up automatically without rebuilding images.

```bash
# Tear down (keeps database volume)
docker-compose down

# Tear down and wipe all data
docker-compose down -v
```

### Option B — Host-side development

Requires Rust (1.75+), Node.js 20+, and Docker + Docker Compose.

**1. Start infrastructure**

```bash
docker-compose up -d postgres redis
```

**2. Configure environment**

```bash
cp .env.example .env
```

**3. Install bacon**

```bash
cargo install --locked bacon
```

**4. Run the backend**

```bash
bacon webserver
```

Migrations run automatically on first start. API available at `http://localhost:8080`.

**5. Seed the default admin user**

```bash
cargo run seed
```

**6. Run the frontend**

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:4242` and log in with `admin` / `admin`.

---

## Project Structure

```
nisse/
├── src/
│   ├── main.rs              # Entry point: migration runner, seed flag, server start
│   ├── config.rs            # Environment variable loading (DATABASE_URL, REDIS_URL, PORT)
│   ├── state.rs             # Shared AppState (PgPool + Redis client)
│   ├── auth.rs              # Argon2 hashing, CurrentUser extractor (validates session cookie)
│   ├── session.rs           # Redis session create / get / delete
│   ├── error.rs             # AppError enum — all handlers return consistent JSON errors
│   ├── seed.rs              # `cargo run seed` inserts the default admin user
│   ├── models/
│   │   ├── user.rs          # UserRole enum (admin | cashier), User struct
│   │   ├── product.rs       # CardCondition enum, Product, TcgSingle, InventoryRow (JOIN view)
│   │   ├── sale.rs          # PaymentMethod enum, Sale, SaleItem
│   │   ├── customer.rs      # CreditActionType enum, Customer, StoreCreditLedger
│   │   └── event.rs         # RegistrationStatus, EventWithCount, EventRegistration
│   └── routes/
│       ├── mod.rs           # Router construction — all routes registered here
│       ├── auth.rs          # POST /auth/login, POST /auth/logout, GET /me
│       ├── inventory.rs     # GET/POST /inventory, PUT/DELETE /inventory/:id
│       ├── sales.rs         # POST /sales/checkout
│       ├── customers.rs     # GET/POST /customers, GET /customers/:id
│       ├── events.rs        # GET/POST /events, GET /events/:id, POST /events/:id/register
│       ├── purchase_orders.rs # GET/POST /purchase_orders, items, status; GET/POST /distributors
│       ├── dashboard.rs     # GET /dashboard/metrics
│       └── users.rs         # GET/POST /users, PATCH/DELETE /users/:id, PATCH /me/update
├── migrations/              # sqlx SQL migration files (applied automatically at startup)
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── (auth)/login/        # Login page (no sidebar layout)
│   │   │   └── (app)/               # App shell layout (sidebar + header)
│   │   │       ├── dashboard/        # KPI cards + recent activity feed
│   │   │       ├── pos/              # Cashier POS interface
│   │   │       ├── inventory/        # Product table + add/edit modals, search
│   │   │       ├── purchase-orders/  # PO list with expandable items
│   │   │       ├── customers/        # Customer list + detail panel with credit ledger
│   │   │       ├── calendar/         # Monthly event calendar + registration
│   │   │       ├── users/            # Admin: user list, create/edit/delete
│   │   │       ├── roles/            # Admin: role permission matrix
│   │   │       └── profile/          # Self-edit username and password
│   │   ├── components/
│   │   │   ├── Header.tsx           # Breadcrumb, username link to profile, logout button
│   │   │   └── Sidebar.tsx          # Navigation; admin section gated by /api/me role
│   │   ├── lib/
│   │   │   └── cart.ts              # Pure cart utilities (tested independently)
│   │   ├── proxy.ts                 # Route protection: redirects to /login if no session cookie
│   │   └── test/                    # Vitest tests and MSW mock handlers
│   ├── vitest.config.ts
│   └── next.config.ts               # Rewrites /api/* → http://localhost:8080/api/*
└── docker-compose.yml               # PostgreSQL 16 + Redis 7 + backend + frontend (→ :4242)
```

---

## API Reference

All endpoints live under `/api`. Every protected route requires a valid `session` cookie, which is set by a successful login.

### Auth

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/auth/login` | No | Body: `{ "username", "password" }`. Sets HTTP-only `session` cookie. |
| `POST` | `/api/auth/logout` | Yes | Deletes session from Redis and clears cookie. |
| `GET` | `/api/me` | Yes | Returns `{ id, username, role }` for the current user. |

### Inventory

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/inventory` | List products. Optional: `?is_tcg_single=true\|false` |
| `POST` | `/api/inventory` | Create product (see body below). |
| `PUT` | `/api/inventory/:id` | Patch product — omit any field to leave it unchanged. |
| `DELETE` | `/api/inventory/:id` | Delete product. Cascades to `tcg_singles` row. |

**POST body:**
```json
{
  "sku": "MTG-001",
  "name": "Black Lotus",
  "price": 9999.99,
  "stock_quantity": 1,
  "is_tcg_single": true,
  "game": "Magic: The Gathering",
  "set_name": "Alpha",
  "condition": "NM",
  "foil": false
}
```

`condition` values: `NM` · `LP` · `MP` · `HP` · `DMG`

For non-TCG products, omit or set `is_tcg_single: false` and leave the card fields out.

### Sales / Checkout

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/sales/checkout` | Process a cart atomically. |

**POST body:**
```json
{
  "payment_method": "cash",
  "customer_id": null,
  "store_credit_amount": null,
  "items": [
    { "product_id": "<uuid>", "quantity": 2 }
  ]
}
```

`payment_method` values: `cash` · `card` · `store_credit` · `split`

- `store_credit` and `split` require `customer_id`.
- `split` additionally requires `store_credit_amount` (must be `> 0` and `< total`).

The handler runs a five-phase PostgreSQL transaction. Any failure rolls back the entire transaction — stock is never permanently decremented on a failed sale.

### Customers

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/customers` | List customers. Optional: `?q=<text>` searches name and email (max 20). |
| `POST` | `/api/customers` | Create customer. Body: `{ "name", "email" }` |
| `GET` | `/api/customers/:id` | Customer row plus last 20 store credit ledger entries. |

### Events

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/events` | List events. Optional: `?from=<ISO8601>&to=<ISO8601>` filters by `start_time`. |
| `POST` | `/api/events` | Create event (see body below). |
| `GET` | `/api/events/:id` | Event detail with full registrations list (includes customer names). |
| `POST` | `/api/events/:id/register` | Register a customer for the event. |

**POST /api/events body:**
```json
{
  "title": "FNM Draft",
  "description": "Friday Night Magic Booster Draft",
  "start_time": "2026-04-04T18:00:00Z",
  "end_time": "2026-04-04T22:00:00Z",
  "entry_fee": 15.00,
  "max_players": 16
}
```

Set `max_players` to `0` for no capacity limit.

**POST /api/events/:id/register body:**
```json
{
  "customer_id": "<uuid>",
  "pay_with_credit": false
}
```

When `pay_with_credit` is `true`, the `entry_fee` is deducted from the customer's store credit balance in the same transaction. The handler uses `SELECT ... FOR UPDATE` on the event row so concurrent registrations cannot exceed `max_players`.

---

## Error Responses

All errors return:

```json
{ "error": "Human-readable message" }
```

| Status | Cause |
|---|---|
| `400` | Validation failure or violated business rule (empty cart, insufficient stock, insufficient credit) |
| `401` | Missing or expired session cookie |
| `404` | Resource not found |
| `409` | Conflict: duplicate email, duplicate registration, event at capacity |
| `500` | Unexpected server error (details logged server-side only, never forwarded to client) |

---

## Authentication & Sessions

- Passwords are hashed with **Argon2id**.
- On login, a UUID v4 session token is stored in Redis under `session:<token>` with a **24-hour TTL**.
- The token is sent to the browser as an **HTTP-only, SameSite=Lax cookie**.
- The Next.js `proxy.ts` middleware checks for the cookie client-side and redirects unauthenticated requests to `/login` before the page renders.

---

## Store Credit

Every change to a customer's balance is written as an append-only row in `store_credit_ledger`. The `amount_changed` column is signed: positive for credits earned, negative for credits spent. The ledger is never modified after insert — it is the audit trail.

`customers.store_credit_balance` is the live running total, updated atomically in the same transaction as the ledger entry so they can never diverge.

`action_type` values: `sale` · `trade_in` · `manual` · `refund`

---

## TCG Singles

Products with `is_tcg_single = true` have a corresponding row in `tcg_singles` that stores card-specific metadata. Both rows are created and deleted in a single transaction. The inventory list endpoint returns a flat joined view (`InventoryRow`) so callers do not need to join themselves.

---

## Running Tests

### Backend

Requires a running PostgreSQL instance. `#[sqlx::test]` provisions an isolated throwaway database per test, runs all migrations, and tears it down afterward — no test pollution.

```bash
cargo test
```

Tests in `src/routes/sales.rs` verify the transaction rollback behaviour:

- **`test_credit_fail_rolls_back_stock`** — Phase 1 decrements stock, Phase 2 fails (customer has $0 credit). Asserts stock is restored to its original value after rollback.
- **`test_out_of_stock_rolls_back`** — Buying more than available stock fails and leaves stock unchanged.
- **`test_cash_checkout_happy_path`** — Full sale completes, stock decrements by the correct amount.
- **`test_rejects_empty_cart`** — Validation fires before any database work.
- **`test_split_credit_exceeds_total`** — Split with credit ≥ total is rejected.

### Frontend

No backend required. MSW intercepts all `/api/*` calls with fixture data.

```bash
cd frontend
npm test
```

Pure utility tests in `src/test/cart.test.ts` (14 tests) cover `cartTotal`, `splitBreakdown` (credit clamping to `[0, total]`), `adjustQuantity` (removes item when quantity reaches zero), and `addToCart` (increments existing item, appends new item).

---

## License

See [LICENSE](./LICENSE).
