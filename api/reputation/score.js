/**
 * GET /api/reputation/score
 *
 * Get reputation score and tier info for a user
 *
 * Query params:
 * - handle: User handle (required)
 *
 * Response:
 * {
 *   "success": true,
 *   "handle": "@alice",
 *   "overall_score": 1250,
 *   "tier": "silver",
 *   "scores": {
 *     "economic": 500,
 *     "social": 200,
 *     "expert": 400,
 *     "creator": 50
 *   },
 *   "badges": ["early_adopter", "generous_tipper"],
 *   "next_tier": "gold",
 *   "progress_to_next": 0.625,
 *   "tier_unlocks": {...},
 *   "rank": 42
 * }
 */

const { sql } = require('../lib/db');

module.exports = async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { handle } = req.query;

    if (!handle) {
      return res.status(400).json({
        error: 'Missing required parameter: handle'
      });
    }

    const cleanHandle = handle.replace('@', '');

    // Get reputation score
    const scoreResult = await sql`
      SELECT * FROM reputation_scores
      WHERE handle = ${cleanHandle}
    `;

    if (scoreResult.length === 0) {
      return res.status(404).json({
        error: 'Reputation score not found',
        message: 'Start earning reputation by participating in the ecosystem!'
      });
    }

    const score = scoreResult[0];

    // Get user's badges
    const badgesResult = await sql`
      SELECT b.badge_id, b.name, b.description, b.icon, b.category, b.rarity
      FROM badge_awards ba
      JOIN badges b ON ba.badge_id = b.badge_id
      WHERE ba.handle = ${cleanHandle}
      ORDER BY ba.awarded_at DESC
    `;

    // Get current tier unlocks
    const currentTierResult = await sql`
      SELECT * FROM tier_requirements
      WHERE tier = ${score.tier}
    `;

    const currentTier = currentTierResult[0];

    // Get next tier
    const nextTierResult = await sql`
      SELECT * FROM tier_requirements
      WHERE min_overall_score > ${score.overall_score}
      ORDER BY min_overall_score ASC
      LIMIT 1
    `;

    const nextTier = nextTierResult.length > 0 ? nextTierResult[0] : null;

    // Calculate progress to next tier
    let progressToNext = 1.0;
    if (nextTier) {
      const currentMin = currentTier.min_overall_score;
      const nextMin = nextTier.min_overall_score;
      const range = nextMin - currentMin;
      const progress = score.overall_score - currentMin;
      progressToNext = range > 0 ? progress / range : 0;
    }

    // Get global rank
    const rankResult = await sql`
      SELECT COUNT(*) + 1 as rank
      FROM reputation_scores
      WHERE overall_score > ${score.overall_score}
    `;

    const rank = parseInt(rankResult[0].rank);

    // Get total users for percentile
    const totalUsersResult = await sql`
      SELECT COUNT(*) as total
      FROM reputation_scores
    `;

    const totalUsers = parseInt(totalUsersResult[0].total);
    const percentile = totalUsers > 0 ? (1 - (rank - 1) / totalUsers) * 100 : 100;

    return res.status(200).json({
      success: true,
      handle,
      overall_score: score.overall_score,
      tier: score.tier,
      scores: {
        economic: score.economic_score,
        social: score.social_score,
        expert: score.expert_score,
        creator: score.creator_score
      },
      badges: badgesResult.map(b => ({
        id: b.badge_id,
        name: b.name,
        description: b.description,
        icon: b.icon,
        category: b.category,
        rarity: b.rarity
      })),
      rank,
      percentile: parseFloat(percentile.toFixed(2)),
      total_users: totalUsers,
      next_tier: nextTier ? nextTier.tier : null,
      progress_to_next: parseFloat(progressToNext.toFixed(4)),
      points_needed: nextTier ? nextTier.min_overall_score - score.overall_score : 0,
      tier_unlocks: currentTier.unlocks,
      tier_unlocked_at: score.tier_unlocked_at ? new Date(score.tier_unlocked_at).toISOString() : null
    });

  } catch (error) {
    console.error('[Reputation] Score error:', error);
    return res.status(500).json({
      error: 'Failed to fetch reputation score',
      details: error.message
    });
  }
};
