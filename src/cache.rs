use redis::Client;

pub fn create_client(redis_url: &str) -> Client {
	Client::open(redis_url).expect("Invalid Redis URL")
}

pub async fn ping(client: &Client) -> bool {
	match client.get_multiplexed_async_connection().await {
		Ok(mut connection) => {
			let result: Result<String, _> =
				redis::cmd("PING").query_async(&mut connection).await;
			result.map(|response| response == "PONG").unwrap_or(false)
		}
		Err(_) => false,
	}
}
