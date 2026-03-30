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
