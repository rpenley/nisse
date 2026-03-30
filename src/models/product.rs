use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::Type)]
#[sqlx(type_name = "card_condition", rename_all = "SCREAMING_SNAKE_CASE")]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum CardCondition {
    Nm,
    Lp,
    Mp,
    Hp,
    Dmg,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Product {
    pub id: Uuid,
    pub sku: String,
    pub name: String,
    pub price: Decimal,
    pub stock_quantity: i32,
    pub is_tcg_single: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct TcgSingle {
    pub id: Uuid,
    pub product_id: Uuid,
    pub game: String,
    pub set_name: String,
    pub condition: CardCondition,
    pub foil: bool,
}

/// Flat row returned by the inventory list JOIN query.
/// sqlx::FromRow flattens all columns from both tables into one struct.
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct InventoryRow {
    pub id: Uuid,
    pub sku: String,
    pub name: String,
    pub price: Decimal,
    pub stock_quantity: i32,
    pub is_tcg_single: bool,
    // Nullable because sealed products have no tcg_singles row
    pub tcg_id: Option<Uuid>,
    pub game: Option<String>,
    pub set_name: Option<String>,
    pub condition: Option<CardCondition>,
    pub foil: Option<bool>,
}
