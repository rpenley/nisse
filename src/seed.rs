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
    let _ = category_ids;
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
    let category_names = ["Board Games", "TCG Sealed", "Miniatures", "RPGs", "Accessories"];
    let mut category_ids = Vec::new();
    for name in &category_names {
        let id: Uuid = sqlx::query_scalar(
            "INSERT INTO categories (name) VALUES ($1)
             ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
             RETURNING id",
        )
        .bind(name)
        .fetch_one(pool)
        .await
        .unwrap();
        category_ids.push(id);
    }

    // (sku, name, price, stock, category_index)
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

    println!(
        "Seeded {} categories, {} products",
        category_ids.len(),
        product_ids.len()
    );
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
    // Try insert first; fall back to SELECT if already exists.
    let id: Option<Uuid> = sqlx::query_scalar(
        "INSERT INTO distributors (name, contact_info)
         VALUES ('ACD Game Distributors', 'orders@acd.example.com')
         ON CONFLICT DO NOTHING
         RETURNING id",
    )
    .fetch_optional(pool)
    .await
    .unwrap();

    let id = match id {
        Some(id) => id,
        None => sqlx::query_scalar(
            "SELECT id FROM distributors WHERE name = 'ACD Game Distributors'",
        )
        .fetch_one(pool)
        .await
        .unwrap(),
    };

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
    let user_id: Uuid = sqlx::query_scalar("SELECT id FROM users WHERE username = 'admin'")
        .fetch_one(pool)
        .await
        .unwrap();

    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM sales")
        .fetch_one(pool)
        .await
        .unwrap();
    if count > 0 {
        println!("Sales already exist — skipping sale seed");
        return;
    }

    let mut tx = pool.begin().await.unwrap();

    let wingspan_id = product_ids[0]; // BG-001 Wingspan
    let sleeves_id = product_ids[12]; // ACC-001 Card Sleeves

    let (_, _, wingspan_price, _): (Uuid, String, Decimal, i32) = sqlx::query_as(
        "SELECT id, name, price, stock_quantity FROM products WHERE id = $1 FOR UPDATE",
    )
    .bind(wingspan_id)
    .fetch_one(&mut *tx)
    .await
    .unwrap();

    let (_, _, sleeves_price, _): (Uuid, String, Decimal, i32) = sqlx::query_as(
        "SELECT id, name, price, stock_quantity FROM products WHERE id = $1 FOR UPDATE",
    )
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
    .bind(customer_ids[0])
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
        &mut tx,
        wingspan_id,
        user_id,
        -1,
        crate::stock::StockReason::Sale,
        Some(sale.id),
    )
    .await
    .unwrap();

    crate::stock::move_stock(
        &mut tx,
        sleeves_id,
        user_id,
        -2,
        crate::stock::StockReason::Sale,
        Some(sale.id),
    )
    .await
    .unwrap();

    tx.commit().await.unwrap();
    println!("Seeded 1 sale totalling ${}", total);
}

async fn seed_po(pool: &PgPool, distributor_id: Uuid, product_ids: &[Uuid]) {
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM purchase_orders")
        .fetch_one(pool)
        .await
        .unwrap();
    if count > 0 {
        println!("POs already exist — skipping PO seed");
        return;
    }

    let po: crate::models::purchase_order::PurchaseOrder = sqlx::query_as(
        "INSERT INTO purchase_orders (distributor_id) VALUES ($1) RETURNING *",
    )
    .bind(distributor_id)
    .fetch_one(pool)
    .await
    .unwrap();

    // (product_index, ordered_quantity, unit_cost)
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
