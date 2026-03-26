use redis::Client;
use sqlx::PgPool;

#[derive(Clone)]
pub struct AppState {
	pub pool: PgPool,
	pub redis: Client,
}
