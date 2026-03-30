FROM rust:latest

RUN apt-get update && apt-get install -y pkg-config libssl-dev

RUN cargo install --locked bacon

WORKDIR /app

EXPOSE 8080

CMD ["bacon", "--headless", "webserver"]
