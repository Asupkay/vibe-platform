/**
 * POST /api/reputation/award
 *
 * Award reputation points for an action
 *
 * Point values by action type:
 * - tip_sent: 1 point per $1
 * - tip_received: 2 points per $1
 * - genesis_deposit: 5 points per $100
 * - expert_session_completed: 50 points
 * - expert_5star_rating: 25 bonus points
 * - message_sent: 1 point
 * - connection_made: 5 points
 *
 * Request:
 * {
 *   "handle": "@alice",
 *   "event_type": "expert_session_completed",
 *   "dimension": "expert",
 *   "points": 50,
 *   "source_id": "sess_abc123",
 *   "source_type": "expert_session"
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "new_score": 550,
 *   "points_awarded": 50,
 *   "tier": "silver",
 *   "tier_upgraded": false
 * }
 */

const { sql } = require('../lib/db');

// Calculate overall score from dimension scores
function calculateOverallScore(economic, social, expert, creator) {
  // Weighted average: economic 40%, expert 30%, social 20%, creator 10%
  return Math.floor(
    economic * 0.4 +
    expert * 0.3 +
    social * 0.2 +
    creator * 0.1
  );
}

// Determine tier based on overall score
async function determineTier(overallScore) {
  const tiers = await sql`
    SELECT tier, min_overall_score
    FROM tier_requirements
    ORDER BY min_overall_score DESC
  `;

  for (const tierReq of tiers) {
    if (overallScore >= tierReq.min_overall_score) {
      return tierReq.tier;
    }
  }

  return 'genesis';
}

module.exports = async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      handle,
      event_type,
      dimension,
      points,
      source_id,
      source_type,
      metadata = {}
    } = req.body;

    // Validation
    if (!handle || !event_type || !dimension || points === undefined) {
      return res.status(400).json({
        error: 'Missing required fields: handle, event_type, dimension, points'
      });
    }

    const validDimensions = ['economic', 'social', 'expert', 'creator'];
    if (!validDimensions.includes(dimension)) {
      return res.status(400).json({
        error: `Invalid dimension. Must be one of: ${validDimensions.join(', ')}`
      });
    }

    const cleanHandle = handle.replace('@', '');

    // Log reputation event
    await sql`
      INSERT INTO reputation_events (
        handle,
        event_type,
        points_awarded,
        dimension,
        source_id,
        source_type,
        metadata
      ) VALUES (
        ${cleanHandle},
        ${event_type},
        ${points},
        ${dimension},
        ${source_id || null},
        ${source_type || null},
        ${JSON.stringify(metadata)}
      )
    `;

    // Get or create reputation score
    let scoreRecord = await sql`
      SELECT * FROM reputation_scores
      WHERE handle = ${cleanHandle}
    `;

    if (scoreRecord.length === 0) {
      // Create new reputation record
      scoreRecord = await sql`
        INSERT INTO reputation_scores (
          handle,
          ${sql(dimension + '_score')} = ${points}
        ) VALUES (
          ${cleanHandle},
          ${points}
        )
        RETURNING *
      `;
    } else {
      // Update existing score
      const dimensionField = `${dimension}_score`;
      scoreRecord = await sql`
        UPDATE reputation_scores
        SET ${sql(dimensionField)} = ${sql(dimensionField)} + ${points},
            updated_at = NOW()
        WHERE handle = ${cleanHandle}
        RETURNING *
      `;
    }

    const score = scoreRecord[0];

    // Recalculate overall score
    const newOverallScore = calculateOverallScore(
      score.economic_score,
      score.social_score,
      score.expert_score,
      score.creator_score
    );

    // Determine new tier
    const newTier = await determineTier(newOverallScore);
    const oldTier = score.tier;
    const tierUpgraded = newTier !== oldTier;

    // Update overall score and tier
    const updated = await sql`
      UPDATE reputation_scores
      SET
        overall_score = ${newOverallScore},
        tier = ${newTier},
        ${tierUpgraded ? sql`tier_unlocked_at = NOW()` : sql``},
        updated_at = NOW()
      WHERE handle = ${cleanHandle}
      RETURNING *
    `;

    console.log(`[Reputation] ${handle} awarded ${points} ${dimension} points (${event_type})`);
    console.log(`[Reputation] New overall score: ${newOverallScore}, Tier: ${newTier}`);

    return res.status(200).json({
      success: true,
      new_score: newOverallScore,
      points_awarded: points,
      dimension,
      dimension_scores: {
        economic: updated[0].economic_score,
        social: updated[0].social_score,
        expert: updated[0].expert_score,
        creator: updated[0].creator_score
      },
      tier: newTier,
      tier_upgraded: tierUpgraded,
      previous_tier: tierUpgraded ? oldTier : null
    });

  } catch (error) {
    console.error('[Reputation] Award error:', error);
    return res.status(500).json({
      error: 'Failed to award reputation',
      details: error.message
    });
  }
};
