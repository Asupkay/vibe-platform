/**
 * POST /api/ping/complete
 *
 * Complete expert session - release escrow to expert
 *
 * Called by asker when satisfied with expert's answer
 * Releases blockchain escrow and updates expert stats
 *
 * Request:
 * {
 *   "session_id": "sess_abc123",
 *   "from": "@bob",
 *   "rating": 5,
 *   "review": "Excellent help with WebSocket authentication!"
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "session_id": "sess_abc123",
 *   "amount_released": 48.75,
 *   "tx_hash": "0x...",
 *   "expert_earnings": 150.00
 * }
 */

const { sql } = require('../lib/db');
const { getDispatcher } = require('../../lib/cdp/contract-dispatcher');

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
      session_id,
      from,
      rating,
      review
    } = req.body;

    // Validation
    if (!session_id || !from) {
      return res.status(400).json({
        error: 'Missing required fields: session_id, from'
      });
    }

    if (rating && (rating < 1 || rating > 5)) {
      return res.status(400).json({
        error: 'Rating must be between 1 and 5'
      });
    }

    const cleanAsker = from.replace('@', '');

    // Get session
    const sessions = await sql`
      SELECT * FROM expert_sessions
      WHERE session_id = ${session_id}
      AND asker_handle = ${cleanAsker}
    `;

    if (sessions.length === 0) {
      return res.status(404).json({
        error: 'Session not found or you are not the asker'
      });
    }

    const session = sessions[0];

    // Check if already completed
    if (session.status === 'completed') {
      return res.status(400).json({
        error: 'Session already completed'
      });
    }

    // Get asker wallet data
    const { kv } = await import('@vercel/kv');
    const askerWalletData = await kv.get(`wallet:${cleanAsker}`);

    if (!askerWalletData) {
      return res.status(500).json({
        error: 'Wallet data not found'
      });
    }

    // Release escrow on blockchain
    console.log(`[PingComplete] Releasing escrow for session ${session_id}`);

    const dispatcher = getDispatcher();
    const escrowResult = await dispatcher.completeEscrow({
      escrowId: session.escrow_id,
      askerHandle: from,
      askerWalletData
    });

    const amountReleased = escrowResult.amountReleased;

    // Update session
    await sql`
      UPDATE expert_sessions
      SET
        status = 'completed',
        completed_at = NOW(),
        rating = ${rating || null},
        review = ${review || null}
      WHERE session_id = ${session_id}
    `;

    // Update expert profile stats
    const expert = await sql`
      SELECT * FROM expert_profiles
      WHERE handle = ${session.expert_handle}
    `;

    if (expert.length > 0) {
      const e = expert[0];
      const newRatingCount = e.rating_count + (rating ? 1 : 0);
      const newRatingAvg = rating
        ? ((e.rating_avg * e.rating_count) + rating) / newRatingCount
        : e.rating_avg;

      const newTotalSessions = e.total_sessions + 1;
      const newCompletionRate = newTotalSessions > 0
        ? (newTotalSessions - 1) / newTotalSessions * e.completion_rate + 1 / newTotalSessions
        : 1.0;

      await sql`
        UPDATE expert_profiles
        SET
          total_sessions = ${newTotalSessions},
          total_earnings = total_earnings + ${amountReleased},
          completion_rate = ${newCompletionRate},
          ${rating ? sql`rating_count = ${newRatingCount}, rating_avg = ${newRatingAvg},` : sql``}
          updated_at = NOW()
        WHERE handle = ${session.expert_handle}
      `;

      // Log expert earning
      await sql`
        INSERT INTO agent_earnings (
          agent_handle,
          earning_type,
          amount,
          source_handle,
          source_tx_hash,
          metadata
        ) VALUES (
          ${session.expert_handle},
          'service_fee',
          ${amountReleased},
          ${cleanAsker},
          ${escrowResult.tx_hash},
          ${JSON.stringify({
            session_id,
            question: session.question.substring(0, 100),
            rating
          })}
        )
      `;

      // If expert has agent treasury, update it
      const treasury = await sql`
        SELECT * FROM agent_treasuries
        WHERE agent_handle = ${session.expert_handle}
      `;

      if (treasury.length > 0) {
        await sql`
          UPDATE agent_treasuries
          SET
            total_earned = total_earned + ${amountReleased},
            current_balance = current_balance + ${amountReleased},
            updated_at = NOW()
          WHERE agent_handle = ${session.expert_handle}
        `;
      }
    }

    // Notify expert (async)
    const vercelUrl = process.env.VERCEL_URL || process.env.NEXT_PUBLIC_VERCEL_URL;
    if (vercelUrl) {
      fetch(`https://${vercelUrl}/api/messages/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'system',
          to: `@${session.expert_handle}`,
          text: `✅ Session completed!\n\nYou earned $${amountReleased} from ${from}\n${rating ? `Rating: ${'⭐'.repeat(rating)}` : ''}\n\nCheck: vibe wallet`
        })
      }).catch(console.error);
    }

    console.log(`[PingComplete] Session ${session_id} completed, expert earned $${amountReleased}`);

    return res.status(200).json({
      success: true,
      session_id,
      amount_released: amountReleased,
      tx_hash: escrowResult.tx_hash,
      expert_handle: `@${session.expert_handle}`,
      rating: rating || null,
      message: `Escrow released to @${session.expert_handle}`
    });

  } catch (error) {
    console.error('[PingComplete] Error:', error);
    return res.status(500).json({
      error: 'Failed to complete session',
      details: error.message
    });
  }
};
