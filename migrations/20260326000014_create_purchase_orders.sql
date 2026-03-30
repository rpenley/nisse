CREATE TYPE po_status AS ENUM ('draft', 'ordered', 'received');

CREATE TABLE purchase_orders (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    distributor_id UUID NOT NULL REFERENCES distributors(id),
    status         po_status NOT NULL DEFAULT 'draft',
    total_cost     NUMERIC(10, 2) NOT NULL DEFAULT 0,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE purchase_order_items (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    po_id             UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    product_id        UUID NOT NULL REFERENCES products(id),
    ordered_quantity  INTEGER NOT NULL CHECK (ordered_quantity > 0),
    received_quantity INTEGER NOT NULL DEFAULT 0,
    unit_cost         NUMERIC(10, 2) NOT NULL
);

CREATE INDEX ON purchase_orders (status);
CREATE INDEX ON purchase_order_items (po_id);
