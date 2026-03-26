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
