-- Create abandoned_carts table
CREATE TABLE IF NOT EXISTS abandoned_carts (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  cart_items JSONB NOT NULL,
  total_cents INTEGER NOT NULL,
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  emails_sent INTEGER DEFAULT 0,
  recovered BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast queries
CREATE INDEX IF NOT EXISTS idx_abandoned_carts_email ON abandoned_carts(email);
CREATE INDEX IF NOT EXISTS idx_abandoned_carts_recovered ON abandoned_carts(recovered);
CREATE INDEX IF NOT EXISTS idx_abandoned_carts_last_updated ON abandoned_carts(last_updated);

-- Add customer_phone column to orders table if it doesn't exist
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_phone TEXT;
