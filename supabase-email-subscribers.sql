-- Create email_subscribers table for storing all collected emails
CREATE TABLE IF NOT EXISTS email_subscribers (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  source TEXT DEFAULT 'unknown',  -- 'footer-signup', 'exit-intent', 'checkout'
  subscribed_at TIMESTAMPTZ DEFAULT NOW(),
  active BOOLEAN DEFAULT TRUE
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_email_subscribers_email ON email_subscribers(email);
CREATE INDEX IF NOT EXISTS idx_email_subscribers_source ON email_subscribers(source);
CREATE INDEX IF NOT EXISTS idx_email_subscribers_active ON email_subscribers(active);
