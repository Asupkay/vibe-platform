-- Agent Treasury System
-- Migration 003: Enable agents as economic actors
-- Date: 2026-01-10

-- Agent treasuries: Track agent earnings, spending, and budget
CREATE TABLE IF NOT EXISTS agent_treasuries (
  id SERIAL PRIMARY KEY,
  agent_handle TEXT NOT NULL UNIQUE,
  wallet_address TEXT NOT NULL,
  total_earned NUMERIC(20, 6) DEFAULT 0,
  total_spent NUMERIC(20, 6) DEFAULT 0,
  current_balance NUMERIC(20, 6) DEFAULT 0,
  daily_budget NUMERIC(20, 6) DEFAULT 10, -- Default $10/day spending limit
  daily_spent NUMERIC(20, 6) DEFAULT 0,
  budget_reset_at TIMESTAMP DEFAULT NOW(),
  session_key TEXT, -- For autonomous spending (encrypted)
  session_key_expires_at TIMESTAMP,
  commission_rate NUMERIC(5, 4) DEFAULT 0.0250, -- 2.5% default
  tier TEXT DEFAULT 'genesis', -- genesis, bronze, silver, gold, platinum
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Agent earnings: Individual earning events
CREATE TABLE IF NOT EXISTS agent_earnings (
  id SERIAL PRIMARY KEY,
  agent_handle TEXT NOT NULL,
  earning_type TEXT NOT NULL, -- tip, commission, service_fee, liquidity_reward
  amount NUMERIC(20, 6) NOT NULL,
  source_handle TEXT, -- Who paid/triggered this earning
  source_tx_hash TEXT, -- Related blockchain transaction
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);

-- Agent spending: Track autonomous spending
CREATE TABLE IF NOT EXISTS agent_spending (
  id SERIAL PRIMARY KEY,
  agent_handle TEXT NOT NULL,
  spending_type TEXT NOT NULL, -- tip, service_payment, data_purchase
  amount NUMERIC(20, 6) NOT NULL,
  recipient_handle TEXT,
  recipient_address TEXT,
  tx_hash TEXT,
  tx_status TEXT DEFAULT 'pending',
  approved_by TEXT, -- Which session key approved this
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_agent_treasuries_handle ON agent_treasuries(agent_handle);
CREATE INDEX IF NOT EXISTS idx_agent_treasuries_balance ON agent_treasuries(current_balance DESC);
CREATE INDEX IF NOT EXISTS idx_agent_treasuries_tier ON agent_treasuries(tier);

CREATE INDEX IF NOT EXISTS idx_agent_earnings_handle ON agent_earnings(agent_handle, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_earnings_type ON agent_earnings(earning_type);

CREATE INDEX IF NOT EXISTS idx_agent_spending_handle ON agent_spending(agent_handle, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_spending_status ON agent_spending(tx_status);

-- Comments for documentation
COMMENT ON TABLE agent_treasuries IS 'Agent wallets and economic state';
COMMENT ON TABLE agent_earnings IS 'Individual earning events for agents';
COMMENT ON TABLE agent_spending IS 'Agent autonomous spending log';

COMMENT ON COLUMN agent_treasuries.daily_budget IS 'Max agent can spend per day (resets at budget_reset_at)';
COMMENT ON COLUMN agent_treasuries.session_key IS 'Encrypted session key for autonomous spending';
COMMENT ON COLUMN agent_treasuries.commission_rate IS 'Commission % on facilitated transactions';
COMMENT ON COLUMN agent_treasuries.tier IS 'Agent tier: genesis, bronze, silver, gold, platinum';
