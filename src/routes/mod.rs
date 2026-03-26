use axum::{routing::get, Router};

use crate::state::AppState;

mod health;

pub fn create_router(state: AppState) -> Router {
	Router::new()
		.route("/health", get(health::handler))
		.with_state(state)
}
