CREATE TYPE card_condition AS ENUM ('NM', 'LP', 'MP', 'HP', 'DMG');

CREATE TABLE tcg_singles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    game TEXT NOT NULL,
    set_name TEXT NOT NULL,
    condition card_condition NOT NULL DEFAULT 'NM',
    foil BOOLEAN NOT NULL DEFAULT false
);
