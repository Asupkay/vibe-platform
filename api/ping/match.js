/**
 * POST /api/ping/match
 *
 * Intelligent expert matching - AI-powered routing
 *
 * Matches questions to experts based on:
 * - Skill relevance (NLP similarity)
 * - Availability status
 * - Rating and completion rate
 * - Price compatibility
 * - Response time history
 *
 * Request:
 * {
 *   "question": "How do I implement WebSocket authentication with JWT?",
 *   "budget": 50,
 *   "urgency": "normal",
 *   "asker_handle": "@bob"
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "matches": [
 *     {
 *       "expert_handle": "@alice",
 *       "match_score": 0.87,
 *       "reasons": {
 *         "skills": 0.9,
 *         "availability": 1.0,
 *         "rating": 0.8,
 *         "price": 0.85
 *       },
 *       "estimated_cost": 45,
 *       "avg_response_time": 15
 *     }
 *   ]
 * }
 */

const { sql } = require('../lib/db');

// Simple keyword-based skill matching (in production, use embeddings)
function calculateSkillMatch(question, expertSkills) {
  const questionLower = question.toLowerCase();
  const keywords = questionLower.split(/\s+/);

  let matchCount = 0;
  let totalSkills = expertSkills.length;

  expertSkills.forEach(skill => {
    const skillLower = skill.toLowerCase();
    // Check if any keyword contains the skill or vice versa
    if (keywords.some(kw => kw.includes(skillLower) || skillLower.includes(kw))) {
      matchCount++;
    }
  });

  return totalSkills > 0 ? matchCount / totalSkills : 0;
}

// Calculate price compatibility score
function calculatePriceScore(budget, expertRate, minEscrow) {
  if (!budget) return 1.0; // No budget constraint

  const estimatedCost = expertRate || minEscrow;

  if (budget >= estimatedCost * 2) return 1.0; // Very affordable
  if (budget >= estimatedCost) return 0.8; // Affordable
  if (budget >= estimatedCost * 0.75) return 0.6; // Slightly above budget
  return 0.3; // Too expensive
}

// Calculate overall match score
function calculateMatchScore(skillScore, availability, rating, priceScore, completionRate) {
  const weights = {
    skills: 0.4,
    availability: 0.2,
    rating: 0.2,
    price: 0.1,
    completion: 0.1
  };

  const availScore = availability === 'available' ? 1.0 : availability === 'busy' ? 0.5 : 0.1;
  const ratingScore = rating / 5; // Normalize to 0-1

  return (
    skillScore * weights.skills +
    availScore * weights.availability +
    ratingScore * weights.rating +
    priceScore * weights.price +
    completionRate * weights.completion
  );
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
      question,
      budget,
      urgency = 'normal',
      asker_handle,
      limit = 5
    } = req.body;

    // Validation
    if (!question) {
      return res.status(400).json({
        error: 'Missing required field: question'
      });
    }

    // Get all available experts
    const experts = await sql`
      SELECT * FROM expert_profiles
      WHERE availability IN ('available', 'busy')
      ORDER BY rating_avg DESC, total_sessions DESC
    `;

    if (experts.length === 0) {
      return res.status(404).json({
        error: 'No experts available',
        message: 'No registered experts found. Be the first to register!'
      });
    }

    // Calculate match scores for each expert
    const matches = experts.map(expert => {
      const skillScore = calculateSkillMatch(question, expert.skills || []);
      const priceScore = calculatePriceScore(
        budget,
        expert.hourly_rate,
        expert.min_escrow
      );

      const matchScore = calculateMatchScore(
        skillScore,
        expert.availability,
        expert.rating_avg || 0,
        priceScore,
        expert.completion_rate || 0
      );

      return {
        expert,
        match_score: matchScore,
        skill_score: skillScore,
        price_score: priceScore
      };
    });

    // Sort by match score and take top N
    matches.sort((a, b) => b.match_score - a.match_score);
    const topMatches = matches.slice(0, limit);

    // Format response
    const formattedMatches = topMatches.map(m => ({
      expert_handle: `@${m.expert.handle}`,
      match_score: parseFloat(m.match_score.toFixed(2)),
      reasons: {
        skills: parseFloat(m.skill_score.toFixed(2)),
        availability: m.expert.availability === 'available' ? 1.0 : m.expert.availability === 'busy' ? 0.5 : 0.1,
        rating: parseFloat(((m.expert.rating_avg || 0) / 5).toFixed(2)),
        price: parseFloat(m.price_score.toFixed(2)),
        completion_rate: parseFloat((m.expert.completion_rate || 0).toFixed(2))
      },
      expert_skills: m.expert.skills || [],
      expert_rating: parseFloat(m.expert.rating_avg || 0),
      total_sessions: m.expert.total_sessions,
      min_escrow: parseFloat(m.expert.min_escrow),
      hourly_rate: m.expert.hourly_rate ? parseFloat(m.expert.hourly_rate) : null,
      avg_response_time: m.expert.response_time_avg,
      tier: m.expert.tier
    }));

    // Log match for analytics (if asker provided)
    if (asker_handle && formattedMatches.length > 0) {
      const topMatch = formattedMatches[0];
      const questionId = `q_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      await sql`
        INSERT INTO expert_matches (
          question_id,
          asker_handle,
          matched_expert,
          match_score,
          match_reason,
          metadata
        ) VALUES (
          ${questionId},
          ${asker_handle.replace('@', '')},
          ${topMatch.expert_handle.replace('@', '')},
          ${topMatch.match_score},
          ${JSON.stringify(topMatch.reasons)},
          ${JSON.stringify({ question, budget, urgency })}
        )
      `;
    }

    console.log(`[ExpertMatch] Found ${formattedMatches.length} matches for question`);

    return res.status(200).json({
      success: true,
      question_preview: question.substring(0, 100),
      matches: formattedMatches,
      total_experts: experts.length
    });

  } catch (error) {
    console.error('[ExpertMatch] Error:', error);
    return res.status(500).json({
      error: 'Failed to match expert',
      details: error.message
    });
  }
};
