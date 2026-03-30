use redis::{AsyncCommands, Client};
use uuid::Uuid;

const SESSION_TTL_SECONDS: u64 = 86400; // 24 hours

pub async fn create(client: &Client, user_id: Uuid) -> Result<String, redis::RedisError> {
    let token = Uuid::new_v4().to_string();
    let key = format!("session:{}", token);
    let mut connection = client.get_multiplexed_async_connection().await?;
    connection
        .set_ex::<_, _, ()>(&key, user_id.to_string(), SESSION_TTL_SECONDS)
        .await?;
    Ok(token)
}

pub async fn get_user_id(client: &Client, token: &str) -> Option<Uuid> {
    let key = format!("session:{}", token);
    let mut connection = client.get_multiplexed_async_connection().await.ok()?;
    let value: Option<String> = connection.get(&key).await.ok()?;
    value.and_then(|s| Uuid::parse_str(&s).ok())
}

pub async fn delete(client: &Client, token: &str) -> Result<(), redis::RedisError> {
    let key = format!("session:{}", token);
    let mut connection = client.get_multiplexed_async_connection().await?;
    connection.del::<_, ()>(&key).await?;
    Ok(())
}
