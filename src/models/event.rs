use chrono::{DateTime, Utc};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::Type)]
#[sqlx(type_name = "registration_status", rename_all = "lowercase")]
pub enum RegistrationStatus {
    Paid,
    Pending,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct EventWithCount {
    pub id: Uuid,
    pub title: String,
    pub description: Option<String>,
    pub start_time: DateTime<Utc>,
    pub end_time: DateTime<Utc>,
    pub entry_fee: Decimal,
    pub max_players: i32,
    pub registered_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct EventRegistration {
    pub id: Uuid,
    pub event_id: Uuid,
    pub customer_id: Uuid,
    pub payment_status: RegistrationStatus,
    pub registered_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct RegistrationWithCustomer {
    pub id: Uuid,
    pub customer_id: Uuid,
    pub customer_name: String,
    pub payment_status: RegistrationStatus,
    pub registered_at: DateTime<Utc>,
}
