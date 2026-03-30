CREATE TABLE distributors (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name         TEXT NOT NULL,
    contact_info TEXT
);
