/**
 * GET /api/reputation/leaderboard
 *
 * Global reputation leaderboard
 *
 * Query params:
 * - dimension: Rank by dimension (overall, economic, social, expert, creator)
 * - tier: Filter by tier (optional)
 * - limit: Number of users (default 50, max 100)
 *
 * Response:
 * {
 *   "success": true,
 *   "dimension": "overall",
 *   "leaderboard": [
 *     {
 *       "rank": 1,
 *       "handle": "@alice",
 *       "score": 5250,
 *       "tier": "platinum",
 *       "badge_count": 7
 *     }
 *   ]
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
    const {
      dimension = 'overall',
      tier,
      limit = '50'
    } = req.query;

    const parsedLimit = Math.min(parseInt(limit), 100);

    // Validate dimension
    const validDimensions = ['overall', 'economic', 'social', 'expert', 'creator'];
    if (!validDimensions.includes(dimension)) {
      return res.status(400).json({
        error: `Invalid dimension. Must be one of: ${validDimensions.join(', ')}`
      });
    }

    // Build query
    const scoreField = dimension === 'overall' ? 'overall_score' : `${dimension}_score`;

    let leaderboard;
    if (tier) {
      leaderboard = await sql`
        SELECT
          handle,
          overall_score,
          economic_score,
          social_score,
          expert_score,
          creator_score,
          tier,
          tier_unlocked_at,
          badges
        FROM reputation_scores
        WHERE tier = ${tier}
        ORDER BY ${sql(scoreField)} DESC
        LIMIT ${parsedLimit}
      `;
    } else {
      leaderboard = await sql`
        SELECT
          handle,
          overall_score,
          economic_score,
          social_score,
          expert_score,
          creator_score,
          tier,
          tier_unlocked_at,
          badges
        FROM reputation_scores
        ORDER BY ${sql(scoreField)} DESC
        LIMIT ${parsedLimit}
      `;
    }

    // Get badge counts for each user
    const leaderboardWithBadges = [];

    for (let i = 0; i < leaderboard.length; i++) {
      const user = leaderboard[i];

      const badgeCount = await sql`
        SELECT COUNT(*) as count
        FROM badge_awards
        WHERE handle = ${user.handle}
      `;

      leaderboardWithBadges.push({
        rank: i + 1,
        handle: `@${user.handle}`,
        score: dimension === 'overall'
          ? user.overall_score
          : user[scoreField],
        overall_score: user.overall_score,
        dimension_scores: {
          economic: user.economic_score,
          social: user.social_score,
          expert: user.expert_score,
          creator: user.creator_score
        },
        tier: user.tier,
        tier_unlocked_at: user.tier_unlocked_at ? new Date(user.tier_unlocked_at).toISOString() : null,
        badge_count: parseInt(badgeCount[0].count),
        top_badges: (user.badges || []).slice(0, 3)
      });
    }

    return res.status(200).json({
      success: true,
      dimension,
      tier: tier || 'all',
      leaderboard: leaderboardWithBadges
    });

  } catch (error) {
    console.error('[Reputation] Leaderboard error:', error);
    return res.status(500).json({
      error: 'Failed to fetch leaderboard',
      details: error.message
    });
  }
};
