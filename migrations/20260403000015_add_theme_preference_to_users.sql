ALTER TABLE users
ADD COLUMN theme_preference TEXT NOT NULL DEFAULT 'light'
CHECK (theme_preference IN ('light', 'dark'));
