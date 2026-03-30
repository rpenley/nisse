use chrono::{DateTime, Utc};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// The payment method selected at checkout.
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::Type)]
#[sqlx(type_name = "payment_method", rename_all = "snake_case")]
#[serde(rename_all = "snake_case")]
pub enum PaymentMethod {
    Card,
    Cash,
    /// Full payment drawn from customer's store credit balance.
    StoreCredit,
    /// Part store credit, part cash/card.
    Split,
}

/// A completed sale header row.
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Sale {
    pub id: Uuid,
    pub customer_id: Option<Uuid>,
    pub user_id: Uuid,
    pub total_amount: Decimal,
    pub payment_method: PaymentMethod,
    pub created_at: DateTime<Utc>,
}

/// One line item within a sale (one row per distinct product).
#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct SaleItem {
    pub id: Uuid,
    pub sale_id: Uuid,
    pub product_id: Uuid,
    pub quantity: i32,
    pub unit_price: Decimal,
}
