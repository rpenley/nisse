ALTER TABLE events ADD COLUMN description TEXT;

CREATE TYPE registration_status AS ENUM ('paid', 'pending');

CREATE TABLE event_registrations (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id         UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    customer_id      UUID NOT NULL REFERENCES customers(id),
    payment_status   registration_status NOT NULL DEFAULT 'pending',
    registered_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (event_id, customer_id)
);

CREATE INDEX ON event_registrations (event_id);
CREATE INDEX ON event_registrations (customer_id);
