-- Reputation System
-- Migration 006: Social capital and tier unlocks
-- Date: 2026-01-10

-- Reputation scores: Track reputation across dimensions
CREATE TABLE IF NOT EXISTS reputation_scores (
  id SERIAL PRIMARY KEY,
  handle TEXT NOT NULL UNIQUE,
  overall_score INTEGER DEFAULT 0, -- Composite score 0-10000
  economic_score INTEGER DEFAULT 0, -- Based on transactions, liquidity
  social_score INTEGER DEFAULT 0, -- Based on connections, messages
  expert_score INTEGER DEFAULT 0, -- Based on sessions, ratings
  creator_score INTEGER DEFAULT 0, -- Based on contributions, artifacts
  tier TEXT DEFAULT 'genesis', -- genesis, bronze, silver, gold, platinum, diamond
  badges JSONB DEFAULT '[]', -- ["early_adopter", "liquidity_provider", "top_expert"]
  tier_unlocked_at TIMESTAMP,
  next_tier TEXT,
  progress_to_next_tier NUMERIC(5, 4) DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Reputation events: Track actions that build reputation
CREATE TABLE IF NOT EXISTS reputation_events (
  id SERIAL PRIMARY KEY,
  handle TEXT NOT NULL,
  event_type TEXT NOT NULL,
  points_awarded INTEGER NOT NULL,
  dimension TEXT NOT NULL, -- economic, social, expert, creator
  source_id TEXT, -- Related transaction/session/message ID
  source_type TEXT, -- tip, deposit, expert_session, message, etc
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);

-- Tier requirements: Define what unlocks each tier
CREATE TABLE IF NOT EXISTS tier_requirements (
  tier TEXT PRIMARY KEY,
  min_overall_score INTEGER NOT NULL,
  min_economic_score INTEGER,
  min_social_score INTEGER,
  min_expert_score INTEGER,
  min_creator_score INTEGER,
  required_badges JSONB DEFAULT '[]',
  unlocks JSONB DEFAULT '{}', -- Privileges unlocked at this tier
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);

-- Badges: Achievements and accomplishments
CREATE TABLE IF NOT EXISTS badges (
  badge_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT, -- Emoji or icon identifier
  category TEXT, -- economic, social, expert, creator, special
  rarity TEXT DEFAULT 'common', -- common, rare, epic, legendary
  unlock_criteria JSONB NOT NULL, -- Conditions to earn this badge
  total_awarded INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Badge awards: Track who has which badges
CREATE TABLE IF NOT EXISTS badge_awards (
  id SERIAL PRIMARY KEY,
  handle TEXT NOT NULL,
  badge_id TEXT NOT NULL,
  awarded_at TIMESTAMP DEFAULT NOW(),
  metadata JSONB DEFAULT '{}',
  UNIQUE(handle, badge_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_reputation_scores_handle ON reputation_scores(handle);
CREATE INDEX IF NOT EXISTS idx_reputation_scores_tier ON reputation_scores(tier);
CREATE INDEX IF NOT EXISTS idx_reputation_scores_overall ON reputation_scores(overall_score DESC);

CREATE INDEX IF NOT EXISTS idx_reputation_events_handle ON reputation_events(handle, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reputation_events_type ON reputation_events(event_type);
CREATE INDEX IF NOT EXISTS idx_reputation_events_dimension ON reputation_events(dimension);

CREATE INDEX IF NOT EXISTS idx_badge_awards_handle ON badge_awards(handle);
CREATE INDEX IF NOT EXISTS idx_badge_awards_badge ON badge_awards(badge_id);

-- Comments
COMMENT ON TABLE reputation_scores IS 'User reputation across multiple dimensions';
COMMENT ON TABLE reputation_events IS 'Actions that build reputation over time';
COMMENT ON TABLE tier_requirements IS 'Requirements to unlock each tier';
COMMENT ON TABLE badges IS 'Achievement badges and their unlock criteria';
COMMENT ON TABLE badge_awards IS 'Track which users have earned which badges';

COMMENT ON COLUMN reputation_scores.overall_score IS 'Composite score 0-10000, weighted average of dimensions';
COMMENT ON COLUMN reputation_scores.tier IS 'Current tier: genesis, bronze, silver, gold, platinum, diamond';
COMMENT ON COLUMN reputation_events.points_awarded IS 'Reputation points awarded for this event';
COMMENT ON COLUMN badges.rarity IS 'Badge rarity: common, rare, epic, legendary';

-- Seed tier requirements
INSERT INTO tier_requirements (tier, min_overall_score, min_economic_score, min_social_score, min_expert_score, unlocks) VALUES
  ('genesis', 0, 0, 0, 0, '{"daily_budget": 10, "tip_limit": 100, "features": ["basic_tips", "messages"]}'),
  ('bronze', 100, 50, 0, 0, '{"daily_budget": 25, "tip_limit": 500, "features": ["escrow", "expert_sessions"]}'),
  ('silver', 500, 200, 100, 0, '{"daily_budget": 50, "tip_limit": 1000, "features": ["agent_wallets", "liquidity_mining"]}'),
  ('gold', 2000, 500, 200, 200, '{"daily_budget": 100, "tip_limit": 5000, "features": ["priority_matching", "custom_badges"]}'),
  ('platinum', 5000, 1000, 500, 500, '{"daily_budget": 250, "tip_limit": 10000, "features": ["vip_support", "protocol_governance"]}'),
  ('diamond', 10000, 2000, 1000, 1000, '{"daily_budget": 500, "tip_limit": 50000, "features": ["everything"]}')
ON CONFLICT (tier) DO NOTHING;

-- Seed common badges
INSERT INTO badges (badge_id, name, description, icon, category, rarity, unlock_criteria) VALUES
  ('early_adopter', 'Early Adopter', 'Joined during Genesis phase', '🌱', 'special', 'rare', '{"requirement": "joined_before_genesis_end"}'),
  ('liquidity_provider', 'Liquidity Provider', 'Deposited $1000+ in Genesis', '💧', 'economic', 'rare', '{"min_deposit": 1000}'),
  ('top_expert', 'Top Expert', 'Completed 50+ expert sessions with 4.5+ rating', '🎓', 'expert', 'epic', '{"min_sessions": 50, "min_rating": 4.5}'),
  ('generous_tipper', 'Generous Tipper', 'Tipped $500+ total', '💰', 'social', 'common', '{"min_tips": 500}'),
  ('trusted_expert', 'Trusted Expert', '100% completion rate on 20+ sessions', '⭐', 'expert', 'legendary', '{"min_sessions": 20, "completion_rate": 1.0}'),
  ('network_builder', 'Network Builder', 'Connected with 100+ people', '🌐', 'social', 'rare', '{"min_connections": 100}'),
  ('genesis_whale', 'Genesis Whale', 'First to deposit $10k+', '🐋', 'economic', 'legendary', '{"first_to_milestone": 10000}')
ON CONFLICT (badge_id) DO NOTHING;
