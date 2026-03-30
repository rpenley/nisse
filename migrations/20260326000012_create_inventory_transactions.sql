CREATE TYPE stock_reason AS ENUM (
    'sale',
    'po_received',
    'manual_adjustment',
    'shrinkage'
);

CREATE TABLE inventory_transactions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id      UUID NOT NULL REFERENCES products(id),
    user_id         UUID NOT NULL REFERENCES users(id),
    quantity_change INTEGER NOT NULL,
    reason          stock_reason NOT NULL,
    reference_id    UUID,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ON inventory_transactions (product_id);
CREATE INDEX ON inventory_transactions (created_at DESC);
