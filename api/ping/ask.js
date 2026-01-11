/**
 * POST /api/ping/ask
 *
 * Ask a question - creates escrow + matches expert
 *
 * This is the main entry point for the expert marketplace:
 * 1. Match question to best expert
 * 2. Create blockchain escrow
 * 3. Notify expert
 * 4. Create session record
 *
 * Request:
 * {
 *   "from": "@bob",
 *   "question": "How do I implement WebSocket authentication?",
 *   "budget": 50,
 *   "preferred_expert": "@alice" (optional)
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "session_id": "sess_...",
 *   "expert_handle": "@alice",
 *   "escrow_id": "0x...",
 *   "escrow_amount": 50,
 *   "tx_hash": "0x...",
 *   "status": "pending"
 * }
 */

const { sql } = require('../lib/db');
const { getDispatcher } = require('../../lib/cdp/contract-dispatcher');
const { ethers } = require('ethers');
const crypto = require('crypto');

// Import matching logic from match.js
function calculateSkillMatch(question, expertSkills) {
  const questionLower = question.toLowerCase();
  const keywords = questionLower.split(/\s+/);

  let matchCount = 0;
  expertSkills.forEach(skill => {
    const skillLower = skill.toLowerCase();
    if (keywords.some(kw => kw.includes(skillLower) || skillLower.includes(kw))) {
      matchCount++;
    }
  });

  return expertSkills.length > 0 ? matchCount / expertSkills.length : 0;
}

function calculateMatchScore(skillScore, availability, rating, completionRate) {
  const weights = { skills: 0.5, availability: 0.2, rating: 0.2, completion: 0.1 };
  const availScore = availability === 'available' ? 1.0 : 0.5;
  const ratingScore = rating / 5;

  return (
    skillScore * weights.skills +
    availScore * weights.availability +
    ratingScore * weights.rating +
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
      from,
      question,
      budget,
      preferred_expert
    } = req.body;

    // Validation
    if (!from || !question || !budget) {
      return res.status(400).json({
        error: 'Missing required fields: from, question, budget'
      });
    }

    if (budget < 5) {
      return res.status(400).json({
        error: 'Minimum budget is $5'
      });
    }

    const cleanAsker = from.replace('@', '');

    // Get asker's wallet
    const askerUser = await sql`
      SELECT wallet_address FROM users WHERE username = ${cleanAsker}
    `;

    if (askerUser.length === 0 || !askerUser[0].wallet_address) {
      return res.status(404).json({
        error: 'Asker wallet not found. Create wallet first.'
      });
    }

    // Match expert (or use preferred)
    let expert;
    if (preferred_expert) {
      const cleanExpert = preferred_expert.replace('@', '');
      const expertResult = await sql`
        SELECT * FROM expert_profiles WHERE handle = ${cleanExpert}
      `;

      if (expertResult.length === 0) {
        return res.status(404).json({
          error: `Preferred expert ${preferred_expert} not found`
        });
      }

      expert = expertResult[0];
    } else {
      // Auto-match best expert
      const experts = await sql`
        SELECT * FROM expert_profiles
        WHERE availability = 'available'
        AND min_escrow <= ${budget}
        ORDER BY rating_avg DESC, total_sessions DESC
      `;

      if (experts.length === 0) {
        return res.status(404).json({
          error: 'No experts available for this budget'
        });
      }

      // Find best match
      const matches = experts.map(e => ({
        expert: e,
        score: calculateMatchScore(
          calculateSkillMatch(question, e.skills || []),
          e.availability,
          e.rating_avg || 0,
          e.completion_rate || 0
        )
      }));

      matches.sort((a, b) => b.score - a.score);
      expert = matches[0].expert;
    }

    // Generate session ID
    const sessionId = `sess_${crypto.randomBytes(8).toString('hex')}`;

    // Create escrow
    const escrowAmount = Math.min(budget, expert.hourly_rate || expert.min_escrow);
    const escrowId = ethers.id(`${sessionId}_${Date.now()}`);

    // Get asker wallet data from KV
    const { kv } = await import('@vercel/kv');
    const askerWalletData = await kv.get(`wallet:${cleanAsker}`);

    if (!askerWalletData) {
      return res.status(500).json({
        error: 'Asker wallet data not found'
      });
    }

    // Create blockchain escrow
    console.log(`[PingAsk] Creating escrow: ${escrowAmount} for session ${sessionId}`);

    const dispatcher = getDispatcher();
    const escrowResult = await dispatcher.createEscrow({
      from,
      to: `@${expert.handle}`,
      amount: escrowAmount,
      description: question.substring(0, 200),
      escrowId,
      timeoutHours: 48,
      fromWalletData: askerWalletData,
      toAddress: expert.wallet_address
    });

    // Create session record
    const session = await sql`
      INSERT INTO expert_sessions (
        session_id,
        asker_handle,
        expert_handle,
        question,
        escrow_id,
        escrow_amount,
        escrow_tx_hash,
        status,
        metadata
      ) VALUES (
        ${sessionId},
        ${cleanAsker},
        ${expert.handle},
        ${question},
        ${escrowId},
        ${escrowAmount},
        ${escrowResult.tx_hash},
        'pending',
        ${JSON.stringify({
          budget,
          matched_score: preferred_expert ? 1.0 : matches[0].score
        })}
      )
      RETURNING *
    `;

    // Notify expert via DM (async)
    const vercelUrl = process.env.VERCEL_URL || process.env.NEXT_PUBLIC_VERCEL_URL;
    if (vercelUrl) {
      fetch(`https://${vercelUrl}/api/messages/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'system',
          to: `@${expert.handle}`,
          text: `💼 New Question from ${from}\n\n"${question.substring(0, 200)}"\n\nEscrow: $${escrowAmount}\nRespond with: vibe ping answer ${sessionId}`
        })
      }).catch(console.error);
    }

    console.log(`[PingAsk] Session ${sessionId} created, matched to @${expert.handle}`);

    return res.status(200).json({
      success: true,
      session_id: sessionId,
      expert_handle: `@${expert.handle}`,
      expert_skills: expert.skills || [],
      escrow_id: escrowId,
      escrow_amount: escrowAmount,
      tx_hash: escrowResult.tx_hash,
      status: 'pending',
      timeout_hours: 48,
      message: `Question sent to @${expert.handle}. Escrow of $${escrowAmount} created.`
    });

  } catch (error) {
    console.error('[PingAsk] Error:', error);
    return res.status(500).json({
      error: 'Failed to process question',
      details: error.message
    });
  }
};
