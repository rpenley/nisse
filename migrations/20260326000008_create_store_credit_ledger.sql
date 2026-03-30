CREATE TYPE credit_action AS ENUM ('sale', 'trade_in', 'manual', 'refund');

CREATE TABLE store_credit_ledger (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id     UUID NOT NULL REFERENCES customers(id),
    staff_user_id   UUID NOT NULL REFERENCES users(id),
    -- Signed: positive = credit added, negative = credit spent
    amount_changed  NUMERIC(10, 2) NOT NULL,
    action_type     credit_action NOT NULL,
    -- ON DELETE SET NULL: administrative sale deletions don't cascade into the audit log
    sale_id         UUID REFERENCES sales(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fast customer history lookups
CREATE INDEX ON store_credit_ledger (customer_id);
-- Partial index: skip the NULL rows (trade-ins, manual adjustments)
CREATE INDEX ON store_credit_ledger (sale_id) WHERE sale_id IS NOT NULL;
