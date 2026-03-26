# Nisse Phase 1: Foundation & Infrastructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bootstrap the Nisse ERP with a compiling Rust/Axum backend connected to PostgreSQL and Redis, all schema migrations applied, and a Next.js frontend with sidebar navigation.

**Architecture:** Rust/Axum backend exposes a `/health` endpoint that verifies both DB and Redis connectivity. sqlx manages typed queries and migrations against PostgreSQL 16. Redis client stored in shared AppState for Phase 2 session use. Next.js App Router frontend with Tailwind CSS lives in `/frontend`. All local dev infrastructure runs via docker-compose.

**Tech Stack:** Rust 2021 edition, Axum 0.7, sqlx 0.8, redis 0.27, PostgreSQL 16, Redis 7, Next.js 15, Tailwind CSS 3.

---

## File Map

**Create:**
- `docker-compose.yml` — Postgres 16 + Redis 7 local dev services
- `.env.example` — env var template (committed)
- `.env` — local values (gitignored)
- `Cargo.toml` — rewritten for nisse (replaces openapi boilerplate)
- `src/main.rs` — entry point: load config, connect DB+Redis, run migrations, start server
- `src/config.rs` — reads env vars into a `Config` struct
- `src/db.rs` — creates `PgPool` from `DATABASE_URL`
- `src/cache.rs` — creates `redis::Client` and exposes `ping()`
- `src/state.rs` — `AppState { pool, redis }` shared across handlers
- `src/routes/mod.rs` — assembles `Router` with all routes
- `src/routes/health.rs` — `GET /health` handler
- `migrations/20260326000001_create_users.sql`
- `migrations/20260326000002_create_customers.sql`
- `migrations/20260326000003_create_products.sql`
- `migrations/20260326000004_create_tcg_singles.sql`
- `migrations/20260326000005_create_sales.sql`
- `migrations/20260326000006_create_events.sql`
- `frontend/` — Next.js app (created by npx create-next-app)
- `frontend/src/components/Sidebar.tsx` — sidebar nav component
- `frontend/src/app/dashboard/page.tsx` — placeholder dashboard page

**Modify:**
- `.gitignore` — add `.env`, `frontend/node_modules/`, `frontend/.next/`
- `frontend/src/app/layout.tsx` — wrap all pages with Sidebar

**Delete:**
- `src/apis/`, `src/server/`, `src/header.rs`, `src/lib.rs`, `src/models.rs`, `src/types.rs`
- `openapi.yaml`, `openapitools.json`

**Port assignments (avoid conflict):**
- Backend: `PORT=8080`
- Next.js dev: default `3000`

---

### Task 1: Infrastructure — docker-compose and environment

**Files:**
- Create: `docker-compose.yml`
- Create: `.env.example`
- Create: `.env`
- Modify: `.gitignore`

- [ ] **Step 1: Create docker-compose.yml**

```yaml
version: "3.9"
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_USER: nisse
      POSTGRES_PASSWORD: nisse
      POSTGRES_DB: nisse
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7
    ports:
      - "6379:6379"

volumes:
  postgres_data:
```

- [ ] **Step 2: Create .env.example**

```
DATABASE_URL=postgres://nisse:nisse@localhost:5432/nisse
REDIS_URL=redis://localhost:6379
PORT=8080
```

- [ ] **Step 3: Create .env from the example**

```bash
cp .env.example .env
```

- [ ] **Step 4: Append to .gitignore**

Add these lines to the bottom of `.gitignore`:
```
.env
frontend/node_modules/
frontend/.next/
```

- [ ] **Step 5: Start infrastructure**

```bash
docker compose up -d
```

Verify both containers are running:
```bash
docker compose ps
```

Expected: two rows, `Status: running`, for `nisse-postgres-1` and `nisse-redis-1`.

- [ ] **Step 6: Commit**

```bash
git add docker-compose.yml .env.example .gitignore
git commit -m "infra: add docker-compose for postgres and redis"
```

---

### Task 2: Rewrite Cargo.toml

**Files:**
- Modify: `Cargo.toml`

- [ ] **Step 1: Replace the entire contents of Cargo.toml**

```toml
[package]
name = "nisse"
version = "0.1.0"
edition = "2021"

[dependencies]
axum = "0.7"
tokio = { version = "1", features = ["full"] }
sqlx = { version = "0.8", features = ["runtime-tokio-native-tls", "postgres", "uuid", "chrono", "rust_decimal", "macros"] }
redis = { version = "0.27", features = ["tokio-comp"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
uuid = { version = "1", features = ["v4", "serde"] }
chrono = { version = "0.4", features = ["serde"] }
rust_decimal = { version = "1", features = ["serde-with-str"] }
dotenvy = "0.15"
tracing = "0.1"
tracing-subscriber = { version = "0.3", features = ["env-filter"] }
```

- [ ] **Step 2: Verify Cargo.toml parses**

```bash
cargo metadata --no-deps --quiet 2>&1 | head -3
```

Expected: JSON output starting with `{`, no parse errors.

---

### Task 3: Delete old boilerplate and stub main.rs

**Files:**
- Delete: `src/apis/`, `src/server/`, `src/header.rs`, `src/lib.rs`, `src/models.rs`, `src/types.rs`
- Delete: `openapi.yaml`, `openapitools.json`
- Create: `src/main.rs`

- [ ] **Step 1: Remove old source files**

```bash
rm -rf src/apis src/server src/header.rs src/lib.rs src/models.rs src/types.rs
rm -f openapi.yaml openapitools.json
```

- [ ] **Step 2: Create minimal src/main.rs stub**

```rust
fn main() {}
```

- [ ] **Step 3: Verify it compiles**

```bash
cargo check
```

Expected: `Finished` with no errors.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove openapi boilerplate, stub main.rs"
```

---

### Task 4: Config module

**Files:**
- Create: `src/config.rs`
- Modify: `src/main.rs`

- [ ] **Step 1: Create src/config.rs**

```rust
pub struct Config {
	pub database_url: String,
	pub redis_url: String,
	pub port: u16,
}

impl Config {
	pub fn from_env() -> Self {
		dotenvy::dotenv().ok();
		Self {
			database_url: std::env::var("DATABASE_URL")
				.expect("DATABASE_URL must be set"),
			redis_url: std::env::var("REDIS_URL")
				.expect("REDIS_URL must be set"),
			port: std::env::var("PORT")
				.unwrap_or_else(|_| "8080".to_string())
				.parse()
				.expect("PORT must be a valid port number"),
		}
	}
}
```

- [ ] **Step 2: Update src/main.rs**

```rust
mod config;

fn main() {
	let config = config::Config::from_env();
	println!("Config loaded. Port: {}", config.port);
}
```

- [ ] **Step 3: Verify compiles**

```bash
cargo check
```

Expected: `Finished` with no errors.

---

### Task 5: Database module

**Files:**
- Create: `src/db.rs`
- Modify: `src/main.rs`

- [ ] **Step 1: Create src/db.rs**

```rust
use sqlx::PgPool;

pub async fn create_pool(database_url: &str) -> PgPool {
	PgPool::connect(database_url)
		.await
		.expect("Failed to connect to PostgreSQL")
}
```

- [ ] **Step 2: Update src/main.rs**

```rust
mod config;
mod db;

#[tokio::main]
async fn main() {
	let config = config::Config::from_env();
	let pool = db::create_pool(&config.database_url).await;
	println!("Connected to PostgreSQL. Pool size: {}", pool.size());
}
```

- [ ] **Step 3: Verify compiles**

```bash
cargo check
```

Expected: `Finished` with no errors.

---

### Task 6: Cache module

**Files:**
- Create: `src/cache.rs`
- Modify: `src/main.rs`

- [ ] **Step 1: Create src/cache.rs**

```rust
use redis::Client;

pub fn create_client(redis_url: &str) -> Client {
	Client::open(redis_url).expect("Invalid Redis URL")
}

pub async fn ping(client: &Client) -> bool {
	match client.get_multiplexed_async_connection().await {
		Ok(mut connection) => {
			let result: Result<String, _> =
				redis::cmd("PING").query_async(&mut connection).await;
			result.map(|response| response == "PONG").unwrap_or(false)
		}
		Err(_) => false,
	}
}
```

- [ ] **Step 2: Update src/main.rs**

```rust
mod cache;
mod config;
mod db;

#[tokio::main]
async fn main() {
	let config = config::Config::from_env();
	let pool = db::create_pool(&config.database_url).await;
	let redis = cache::create_client(&config.redis_url);
	let redis_ok = cache::ping(&redis).await;

	println!("PostgreSQL connected. Pool size: {}", pool.size());
	println!("Redis ping: {}", if redis_ok { "ok" } else { "FAILED" });
}
```

- [ ] **Step 3: Verify compiles**

```bash
cargo check
```

Expected: `Finished` with no errors.

- [ ] **Step 4: Run and verify both services respond**

Ensure `docker compose up -d` is running, then:

```bash
cargo run
```

Expected output:
```
PostgreSQL connected. Pool size: 1
Redis ping: ok
```

- [ ] **Step 5: Commit**

```bash
git add src/config.rs src/db.rs src/cache.rs src/main.rs
git commit -m "feat: config, db, and redis connectivity"
```

---

### Task 7: AppState, routes, and /health endpoint

**Files:**
- Create: `src/state.rs`
- Create: `src/routes/mod.rs`
- Create: `src/routes/health.rs`
- Modify: `src/main.rs`

- [ ] **Step 1: Create src/state.rs**

```rust
use redis::Client;
use sqlx::PgPool;

#[derive(Clone)]
pub struct AppState {
	pub pool: PgPool,
	pub redis: Client,
}
```

- [ ] **Step 2: Create src/routes/health.rs**

```rust
use axum::{extract::State, http::StatusCode, response::IntoResponse, Json};
use serde_json::json;

use crate::{cache, state::AppState};

pub async fn handler(State(state): State<AppState>) -> impl IntoResponse {
	let db_ok = sqlx::query("SELECT 1")
		.fetch_one(&state.pool)
		.await
		.is_ok();
	let redis_ok = cache::ping(&state.redis).await;

	let status = if db_ok && redis_ok {
		StatusCode::OK
	} else {
		StatusCode::SERVICE_UNAVAILABLE
	};

	(
		status,
		Json(json!({
			"status": if db_ok && redis_ok { "ok" } else { "degraded" },
			"db": if db_ok { "ok" } else { "error" },
			"redis": if redis_ok { "ok" } else { "error" },
		})),
	)
}
```

- [ ] **Step 3: Create src/routes/mod.rs**

```rust
use axum::{routing::get, Router};

use crate::state::AppState;

mod health;

pub fn create_router(state: AppState) -> Router {
	Router::new()
		.route("/health", get(health::handler))
		.with_state(state)
}
```

- [ ] **Step 4: Update src/main.rs**

```rust
mod cache;
mod config;
mod db;
mod routes;
mod state;

use state::AppState;

#[tokio::main]
async fn main() {
	tracing_subscriber::fmt::init();

	let config = config::Config::from_env();
	let pool = db::create_pool(&config.database_url).await;
	let redis = cache::create_client(&config.redis_url);

	let app_state = AppState { pool, redis };
	let app = routes::create_router(app_state);

	let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{}", config.port))
		.await
		.unwrap();
	tracing::info!("Listening on port {}", config.port);
	axum::serve(listener, app).await.unwrap();
}
```

- [ ] **Step 5: Verify compiles**

```bash
cargo check
```

Expected: `Finished` with no errors.

- [ ] **Step 6: Run and test /health**

```bash
cargo run &
sleep 3
curl -s http://localhost:8080/health
```

Expected:
```json
{"db":"ok","redis":"ok","status":"ok"}
```

Kill the server:
```bash
pkill -f "target/debug/nisse"
```

- [ ] **Step 7: Commit**

```bash
git add src/state.rs src/routes/ src/main.rs
git commit -m "feat: AppState and GET /health endpoint"
```

---

### Task 8: Database migrations

**Files:**
- Create: `migrations/20260326000001_create_users.sql`
- Create: `migrations/20260326000002_create_customers.sql`
- Create: `migrations/20260326000003_create_products.sql`
- Create: `migrations/20260326000004_create_tcg_singles.sql`
- Create: `migrations/20260326000005_create_sales.sql`
- Create: `migrations/20260326000006_create_events.sql`

- [ ] **Step 1: Install sqlx-cli**

```bash
cargo install sqlx-cli --no-default-features --features native-tls,postgres
```

- [ ] **Step 2: Create migrations/20260326000001_create_users.sql**

```sql
CREATE TYPE user_role AS ENUM ('admin', 'cashier');

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role user_role NOT NULL DEFAULT 'cashier'
);
```

- [ ] **Step 3: Create migrations/20260326000002_create_customers.sql**

```sql
CREATE TABLE customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    store_credit_balance NUMERIC(10, 2) NOT NULL DEFAULT 0.00
);
```

- [ ] **Step 4: Create migrations/20260326000003_create_products.sql**

```sql
CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sku TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    price NUMERIC(10, 2) NOT NULL,
    stock_quantity INTEGER NOT NULL DEFAULT 0,
    is_tcg_single BOOLEAN NOT NULL DEFAULT false
);
```

- [ ] **Step 5: Create migrations/20260326000004_create_tcg_singles.sql**

```sql
CREATE TYPE card_condition AS ENUM ('NM', 'LP', 'MP', 'HP', 'DMG');

CREATE TABLE tcg_singles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    game TEXT NOT NULL,
    set_name TEXT NOT NULL,
    condition card_condition NOT NULL DEFAULT 'NM',
    foil BOOLEAN NOT NULL DEFAULT false
);
```

- [ ] **Step 6: Create migrations/20260326000005_create_sales.sql**

```sql
CREATE TYPE payment_method AS ENUM ('card', 'cash', 'store_credit', 'split');

CREATE TABLE sales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID REFERENCES customers(id),
    user_id UUID NOT NULL REFERENCES users(id),
    total_amount NUMERIC(10, 2) NOT NULL,
    payment_method payment_method NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

- [ ] **Step 7: Create migrations/20260326000006_create_events.sql**

```sql
CREATE TABLE events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    entry_fee NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    max_players INTEGER NOT NULL DEFAULT 0
);
```

- [ ] **Step 8: Run migrations**

```bash
sqlx migrate run --database-url postgres://nisse:nisse@localhost:5432/nisse
```

Expected output (6 lines):
```
Applied 20260326000001/migrate create users
Applied 20260326000002/migrate create customers
Applied 20260326000003/migrate create products
Applied 20260326000004/migrate create tcg singles
Applied 20260326000005/migrate create sales
Applied 20260326000006/migrate create events
```

- [ ] **Step 9: Verify schema in psql**

```bash
docker exec -it nisse-postgres-1 psql -U nisse -d nisse -c "\dt"
```

Expected: 7 rows — `_sqlx_migrations` plus the 6 application tables.

- [ ] **Step 10: Commit**

```bash
git add migrations/
git commit -m "feat: initial schema migrations for all 6 tables"
```

---

### Task 9: Run migrations at startup

**Files:**
- Modify: `src/main.rs`

- [ ] **Step 1: Update main.rs to embed and run migrations on startup**

```rust
mod cache;
mod config;
mod db;
mod routes;
mod state;

use state::AppState;

#[tokio::main]
async fn main() {
	tracing_subscriber::fmt::init();

	let config = config::Config::from_env();
	let pool = db::create_pool(&config.database_url).await;

	sqlx::migrate!("./migrations")
		.run(&pool)
		.await
		.expect("Failed to run database migrations");

	let redis = cache::create_client(&config.redis_url);

	let app_state = AppState { pool, redis };
	let app = routes::create_router(app_state);

	let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{}", config.port))
		.await
		.unwrap();
	tracing::info!("Nisse listening on port {}", config.port);
	axum::serve(listener, app).await.unwrap();
}
```

- [ ] **Step 2: Build release to confirm embed works**

```bash
cargo build
```

Expected: `Finished` with no errors. (sqlx embeds migration SQL files at compile time.)

- [ ] **Step 3: Run server and hit /health**

```bash
cargo run &
sleep 3
curl -s http://localhost:8080/health
pkill -f "target/debug/nisse"
```

Expected:
```json
{"db":"ok","redis":"ok","status":"ok"}
```

- [ ] **Step 4: Commit**

```bash
git add src/main.rs
git commit -m "feat: run sqlx migrations at server startup"
```

---

### Task 10: Initialize Next.js frontend

**Files:**
- Create: `frontend/` (via npx)

- [ ] **Step 1: Scaffold the Next.js app**

From the project root:
```bash
npx create-next-app@latest frontend --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"
```

Accept all prompts with defaults (or `--yes` if the version supports it). This creates `frontend/` with App Router, Tailwind CSS, TypeScript, and `src/` layout.

- [ ] **Step 2: Verify the dev server starts**

```bash
cd frontend && npm run dev &
sleep 5
curl -s http://localhost:3000 | grep -c "html"
pkill -f "next dev"
cd ..
```

Expected: a number greater than 0 (HTML was returned).

- [ ] **Step 3: Commit**

```bash
git add frontend/
git commit -m "feat: initialize Next.js 15 frontend with Tailwind"
```

---

### Task 11: Sidebar component and root layout

**Files:**
- Create: `frontend/src/components/Sidebar.tsx`
- Create: `frontend/src/app/dashboard/page.tsx`
- Modify: `frontend/src/app/layout.tsx`

- [ ] **Step 1: Create frontend/src/components/Sidebar.tsx**

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
	{ href: "/dashboard", label: "Dashboard" },
	{ href: "/pos", label: "POS" },
	{ href: "/inventory", label: "Inventory" },
	{ href: "/customers", label: "Customers" },
	{ href: "/calendar", label: "Calendar" },
];

export default function Sidebar() {
	const pathname = usePathname();

	return (
		<aside className="w-56 min-h-screen bg-[#282828] border-r border-[#3c3836] flex flex-col">
			<div className="px-4 py-5 border-b border-[#3c3836]">
				<span className="text-[#fabd2f] font-mono text-lg font-bold tracking-wide">
					Nisse
				</span>
			</div>
			<nav className="flex-1 px-2 py-4 space-y-1">
				{NAV_ITEMS.map(({ href, label }) => {
					const active =
						pathname === href || pathname.startsWith(href + "/");
					return (
						<Link
							key={href}
							href={href}
							className={`block px-3 py-2 rounded font-mono text-sm transition-colors ${
								active
									? "bg-[#3c3836] text-[#ebdbb2]"
									: "text-[#928374] hover:bg-[#3c3836] hover:text-[#ebdbb2]"
							}`}
						>
							{label}
						</Link>
					);
				})}
			</nav>
		</aside>
	);
}
```

- [ ] **Step 2: Replace frontend/src/app/layout.tsx**

```tsx
import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "@/components/Sidebar";

export const metadata: Metadata = {
	title: "Nisse ERP",
	description: "Point of Sale & ERP for game shops",
};

export default function RootLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<html lang="en">
			<body className="bg-[#282828] text-[#ebdbb2] font-mono">
				<div className="flex min-h-screen">
					<Sidebar />
					<main className="flex-1 p-6">{children}</main>
				</div>
			</body>
		</html>
	);
}
```

- [ ] **Step 3: Create frontend/src/app/dashboard/page.tsx**

```tsx
export default function Dashboard() {
	return (
		<div>
			<h1 className="text-[#fabd2f] text-2xl font-bold mb-4">
				Dashboard
			</h1>
			<p className="text-[#928374]">Phase 2: Auth coming next.</p>
		</div>
	);
}
```

- [ ] **Step 4: Verify the frontend builds cleanly**

```bash
cd frontend && npm run build 2>&1 | tail -8
cd ..
```

Expected: output contains `✓ Compiled successfully` or `Route (app)` table with no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/Sidebar.tsx frontend/src/app/layout.tsx frontend/src/app/dashboard/
git commit -m "feat: sidebar navigation and root layout with gruvbox theme"
```

---

### Task 12: Final connectivity verification

- [ ] **Step 1: Ensure docker services are running**

```bash
docker compose ps
```

Expected: both `nisse-postgres-1` and `nisse-redis-1` in `running` state.

- [ ] **Step 2: Start backend and confirm /health**

```bash
cargo run &
sleep 3
curl -s http://localhost:8080/health | python3 -m json.tool
pkill -f "target/debug/nisse"
```

Expected:
```json
{
    "db": "ok",
    "redis": "ok",
    "status": "ok"
}
```

- [ ] **Step 3: Start frontend and confirm it serves**

```bash
cd frontend && npm run dev &
sleep 5
curl -s http://localhost:3000/dashboard | grep -o "Nisse ERP" | head -1
pkill -f "next dev"
cd ..
```

Expected: `Nisse ERP` (from the page title in HTML).

- [ ] **Step 4: Phase 1 complete — report to user**

Both backend (`/health` → 200) and frontend (Next.js serving with sidebar) are functional. Ready for Phase 2: Authentication & Redis sessions.
