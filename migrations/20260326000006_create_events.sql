CREATE TABLE events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    entry_fee NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    max_players INTEGER NOT NULL DEFAULT 0
);
