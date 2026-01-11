-- Expert Marketplace (ping.money integration)
-- Migration 004: Knowledge exchange routing
-- Date: 2026-01-10

-- Expert profiles: Skills, rates, availability
CREATE TABLE IF NOT EXISTS expert_profiles (
  id SERIAL PRIMARY KEY,
  handle TEXT NOT NULL UNIQUE,
  wallet_address TEXT NOT NULL,
  bio TEXT,
  skills JSONB DEFAULT '[]', -- ["blockchain", "WebSockets", "design"]
  hourly_rate NUMERIC(10, 2), -- Optional hourly rate
  min_escrow NUMERIC(10, 2) DEFAULT 5, -- Minimum escrow amount
  availability TEXT DEFAULT 'available', -- available, busy, offline
  response_time_avg INTEGER, -- Average response time in minutes
  completion_rate NUMERIC(5, 4) DEFAULT 0, -- % of completed escrows
  total_earnings NUMERIC(20, 6) DEFAULT 0,
  total_sessions INTEGER DEFAULT 0,
  rating_avg NUMERIC(3, 2) DEFAULT 0,
  rating_count INTEGER DEFAULT 0,
  tier TEXT DEFAULT 'bronze', -- bronze, silver, gold, platinum
  verified BOOLEAN DEFAULT FALSE,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Expert sessions: Track question/answer sessions
CREATE TABLE IF NOT EXISTS expert_sessions (
  id SERIAL PRIMARY KEY,
  session_id TEXT NOT NULL UNIQUE,
  asker_handle TEXT NOT NULL,
  expert_handle TEXT NOT NULL,
  question TEXT NOT NULL,
  answer TEXT,
  escrow_id TEXT, -- Links to blockchain escrow
  escrow_amount NUMERIC(10, 2),
  escrow_tx_hash TEXT,
  status TEXT DEFAULT 'pending', -- pending, in_progress, completed, disputed, cancelled
  started_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,
  rating INTEGER, -- 1-5 stars
  review TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);

-- Expert matching: Track routing decisions
CREATE TABLE IF NOT EXISTS expert_matches (
  id SERIAL PRIMARY KEY,
  question_id TEXT NOT NULL,
  asker_handle TEXT NOT NULL,
  matched_expert TEXT,
  match_score NUMERIC(5, 4), -- 0-1 confidence score
  match_reason JSONB, -- { skills: 0.8, availability: 1.0, rate: 0.6 }
  accepted BOOLEAN,
  rejected_reason TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_expert_profiles_handle ON expert_profiles(handle);
CREATE INDEX IF NOT EXISTS idx_expert_profiles_availability ON expert_profiles(availability, rating_avg DESC);
CREATE INDEX IF NOT EXISTS idx_expert_profiles_tier ON expert_profiles(tier);
CREATE INDEX IF NOT EXISTS idx_expert_profiles_skills ON expert_profiles USING GIN(skills);

CREATE INDEX IF NOT EXISTS idx_expert_sessions_status ON expert_sessions(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_expert_sessions_asker ON expert_sessions(asker_handle, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_expert_sessions_expert ON expert_sessions(expert_handle, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_expert_sessions_escrow ON expert_sessions(escrow_id);

CREATE INDEX IF NOT EXISTS idx_expert_matches_question ON expert_matches(question_id);
CREATE INDEX IF NOT EXISTS idx_expert_matches_expert ON expert_matches(matched_expert);

-- Comments
COMMENT ON TABLE expert_profiles IS 'Expert profiles for ping.money marketplace';
COMMENT ON TABLE expert_sessions IS 'Knowledge exchange sessions with escrow';
COMMENT ON TABLE expert_matches IS 'AI routing decisions and match quality';

COMMENT ON COLUMN expert_profiles.completion_rate IS 'Percentage of sessions completed successfully';
COMMENT ON COLUMN expert_profiles.response_time_avg IS 'Average response time in minutes';
COMMENT ON COLUMN expert_sessions.status IS 'pending | in_progress | completed | disputed | cancelled';
COMMENT ON COLUMN expert_matches.match_score IS 'AI confidence in match quality (0-1)';
