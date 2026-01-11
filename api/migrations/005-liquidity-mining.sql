-- Genesis Liquidity Mining
-- Migration 005: Bootstrap the economic flywheel
-- Date: 2026-01-10

-- Liquidity deposits: Track user deposits for yield farming
CREATE TABLE IF NOT EXISTS liquidity_deposits (
  id SERIAL PRIMARY KEY,
  handle TEXT NOT NULL,
  deposit_id TEXT NOT NULL UNIQUE,
  amount NUMERIC(20, 6) NOT NULL,
  deposit_tx_hash TEXT,
  withdraw_tx_hash TEXT,
  status TEXT DEFAULT 'active', -- active, withdrawn, locked
  deposited_at TIMESTAMP DEFAULT NOW(),
  withdrawn_at TIMESTAMP,
  lock_duration_days INTEGER DEFAULT 0, -- Optional lock period for bonus rewards
  unlock_at TIMESTAMP,
  genesis_multiplier NUMERIC(5, 4) DEFAULT 1.0, -- Bonus for early depositors
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);

-- Liquidity rewards: Track accumulated rewards
CREATE TABLE IF NOT EXISTS liquidity_rewards (
  id SERIAL PRIMARY KEY,
  handle TEXT NOT NULL,
  deposit_id TEXT NOT NULL,
  reward_type TEXT NOT NULL, -- base_yield, genesis_bonus, duration_bonus, reputation_boost
  amount NUMERIC(20, 6) NOT NULL,
  apy NUMERIC(5, 4), -- Annual percentage yield at time of reward
  claimed BOOLEAN DEFAULT FALSE,
  claim_tx_hash TEXT,
  reward_period_start TIMESTAMP,
  reward_period_end TIMESTAMP,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);

-- Genesis liquidity stats: Aggregate metrics
CREATE TABLE IF NOT EXISTS genesis_liquidity_stats (
  id SERIAL PRIMARY KEY,
  date DATE NOT NULL UNIQUE,
  total_deposits NUMERIC(20, 6) DEFAULT 0,
  total_depositors INTEGER DEFAULT 0,
  total_rewards_distributed NUMERIC(20, 6) DEFAULT 0,
  avg_deposit_size NUMERIC(20, 6) DEFAULT 0,
  total_value_locked NUMERIC(20, 6) DEFAULT 0, -- Current TVL
  base_apy NUMERIC(5, 4) DEFAULT 0.05, -- 5% base APY
  genesis_multiplier_max NUMERIC(5, 4) DEFAULT 2.0, -- Max 2x for Genesis
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_liquidity_deposits_handle ON liquidity_deposits(handle, deposited_at DESC);
CREATE INDEX IF NOT EXISTS idx_liquidity_deposits_status ON liquidity_deposits(status);
CREATE INDEX IF NOT EXISTS idx_liquidity_deposits_amount ON liquidity_deposits(amount DESC);

CREATE INDEX IF NOT EXISTS idx_liquidity_rewards_handle ON liquidity_rewards(handle, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_liquidity_rewards_deposit ON liquidity_rewards(deposit_id);
CREATE INDEX IF NOT EXISTS idx_liquidity_rewards_unclaimed ON liquidity_rewards(claimed) WHERE claimed = FALSE;

CREATE INDEX IF NOT EXISTS idx_genesis_stats_date ON genesis_liquidity_stats(date DESC);

-- Comments
COMMENT ON TABLE liquidity_deposits IS 'User deposits for Genesis liquidity mining';
COMMENT ON TABLE liquidity_rewards IS 'Accumulated rewards from liquidity provision';
COMMENT ON TABLE genesis_liquidity_stats IS 'Daily aggregate metrics for Genesis program';

COMMENT ON COLUMN liquidity_deposits.genesis_multiplier IS 'Bonus multiplier for early Genesis depositors (1.0-2.0x)';
COMMENT ON COLUMN liquidity_deposits.lock_duration_days IS 'Optional lock period for bonus APY';
COMMENT ON COLUMN liquidity_rewards.apy IS 'Annualized percentage yield at time of reward calculation';
COMMENT ON COLUMN genesis_liquidity_stats.base_apy IS 'Base APY for all depositors (before multipliers)';
