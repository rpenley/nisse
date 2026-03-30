use axum::{
    routing::{get, patch, post, put},
    Router,
};

use crate::state::AppState;

mod auth;
mod customers;
mod dashboard;
mod events;
mod health;
mod inventory;
mod purchase_orders;
mod sales;

pub fn create_router(state: AppState) -> Router {
    let api_router = Router::new()
        .route("/auth/login", post(auth::login))
        .route("/auth/logout", post(auth::logout))
        .route("/me", get(auth::me))
        .route("/inventory", get(inventory::list).post(inventory::create))
        .route(
            "/inventory/{id}",
            put(inventory::update).delete(inventory::delete),
        )
        .route("/sales/checkout", post(sales::checkout))
        .route("/customers", get(customers::list).post(customers::create))
        .route("/customers/{id}", get(customers::get))
        .route("/events", get(events::list).post(events::create))
        .route("/events/{id}", get(events::get))
        .route("/events/{id}/register", post(events::register))
        .route(
            "/distributors",
            get(purchase_orders::list_distributors).post(purchase_orders::create_distributor),
        )
        .route(
            "/purchase_orders",
            get(purchase_orders::list_pos).post(purchase_orders::create_po),
        )
        .route(
            "/purchase_orders/{id}/items",
            get(purchase_orders::get_po_items).post(purchase_orders::add_po_item),
        )
        .route(
            "/purchase_orders/{id}/status",
            patch(purchase_orders::update_po_status),
        )
        .route("/dashboard/metrics", get(dashboard::metrics));

    Router::new()
        .route("/health", get(health::handler))
        .nest("/api", api_router)
        .with_state(state)
}
