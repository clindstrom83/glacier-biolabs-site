-- CS Auto-Responder interaction log
CREATE TABLE IF NOT EXISTS cs_interactions (
  id BIGSERIAL PRIMARY KEY,
  customer_email TEXT NOT NULL,
  subject TEXT,
  message_preview TEXT,
  response_type TEXT DEFAULT 'auto_replied',  -- 'auto_replied' or 'flagged'
  response_preview TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cs_interactions_email ON cs_interactions(customer_email);
CREATE INDEX IF NOT EXISTS idx_cs_interactions_created ON cs_interactions(created_at);

-- Customer Intelligence reports
CREATE TABLE IF NOT EXISTS intelligence_reports (
  id BIGSERIAL PRIMARY KEY,
  report_date DATE NOT NULL UNIQUE,
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add confirmation_sent column to orders if not exists
ALTER TABLE orders ADD COLUMN IF NOT EXISTS confirmation_sent BOOLEAN DEFAULT FALSE;
