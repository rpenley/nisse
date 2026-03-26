CREATE TABLE customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    store_credit_balance NUMERIC(10, 2) NOT NULL DEFAULT 0.00
);
