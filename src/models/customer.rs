use chrono::{DateTime, Utc};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::Type)]
#[sqlx(type_name = "credit_action", rename_all = "snake_case")]
#[serde(rename_all = "snake_case")]
pub enum CreditActionType {
    Sale,
    TradeIn,
    Manual,
    Refund,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Customer {
    pub id: Uuid,
    pub name: String,
    pub email: String,
    pub store_credit_balance: Decimal,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct StoreCreditLedger {
    pub id: Uuid,
    pub customer_id: Uuid,
    pub staff_user_id: Uuid,
    pub amount_changed: Decimal,
    pub action_type: CreditActionType,
    pub sale_id: Option<Uuid>,
    pub created_at: DateTime<Utc>,
}
