/**
 * GET /api/agents/wallet/treasury
 *
 * Agent treasury dashboard - full economic state
 *
 * Query params:
 * - agent_handle: Agent handle (required)
 * - include_history: Include recent earnings/spending (default: true)
 *
 * Response:
 * {
 *   "success": true,
 *   "agent_handle": "@vibebot",
 *   "wallet_address": "0x...",
 *   "balances": {
 *     "current": 42.50,
 *     "total_earned": 100.00,
 *     "total_spent": 57.50
 *   },
 *   "budget": {
 *     "daily_limit": 10,
 *     "daily_spent": 2.50,
 *     "daily_remaining": 7.50,
 *     "resets_at": "2026-01-11T00:00:00Z"
 *   },
 *   "tier": "gold",
 *   "commission_rate": 0.025,
 *   "recent_earnings": [...],
 *   "recent_spending": [...]
 * }
 */

const { sql } = require('../../lib/db');

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
    const { agent_handle, include_history = 'true' } = req.query;

    if (!agent_handle) {
      return res.status(400).json({
        error: 'Missing required parameter: agent_handle'
      });
    }

    const cleanHandle = agent_handle.replace('@', '');

    // Get treasury
    const treasury = await sql`
      SELECT * FROM agent_treasuries
      WHERE agent_handle = ${cleanHandle}
    `;

    if (treasury.length === 0) {
      return res.status(404).json({
        error: 'Agent treasury not found'
      });
    }

    const t = treasury[0];

    const response = {
      success: true,
      agent_handle,
      wallet_address: t.wallet_address,
      balances: {
        current: parseFloat(t.current_balance),
        total_earned: parseFloat(t.total_earned),
        total_spent: parseFloat(t.total_spent)
      },
      budget: {
        daily_limit: parseFloat(t.daily_budget),
        daily_spent: parseFloat(t.daily_spent),
        daily_remaining: parseFloat(t.daily_budget) - parseFloat(t.daily_spent),
        resets_at: new Date(t.budget_reset_at).toISOString()
      },
      tier: t.tier,
      commission_rate: parseFloat(t.commission_rate),
      session_key_active: !!t.session_key && new Date(t.session_key_expires_at) > new Date(),
      created_at: new Date(t.created_at).toISOString(),
      updated_at: new Date(t.updated_at).toISOString()
    };

    // Include transaction history if requested
    if (include_history === 'true') {
      // Recent earnings (last 20)
      const earnings = await sql`
        SELECT * FROM agent_earnings
        WHERE agent_handle = ${cleanHandle}
        ORDER BY created_at DESC
        LIMIT 20
      `;

      response.recent_earnings = earnings.map(e => ({
        id: e.id,
        type: e.earning_type,
        amount: parseFloat(e.amount),
        source: e.source_handle,
        tx_hash: e.source_tx_hash,
        metadata: e.metadata,
        created_at: new Date(e.created_at).toISOString()
      }));

      // Recent spending (last 20)
      const spending = await sql`
        SELECT * FROM agent_spending
        WHERE agent_handle = ${cleanHandle}
        ORDER BY created_at DESC
        LIMIT 20
      `;

      response.recent_spending = spending.map(s => ({
        id: s.id,
        type: s.spending_type,
        amount: parseFloat(s.amount),
        recipient: s.recipient_handle || s.recipient_address,
        tx_hash: s.tx_hash,
        status: s.tx_status,
        metadata: s.metadata,
        created_at: new Date(s.created_at).toISOString()
      }));

      // Earnings breakdown by type
      const earningsByType = await sql`
        SELECT
          earning_type,
          COUNT(*) as count,
          SUM(amount) as total
        FROM agent_earnings
        WHERE agent_handle = ${cleanHandle}
        GROUP BY earning_type
      `;

      response.earnings_breakdown = earningsByType.map(e => ({
        type: e.earning_type,
        count: parseInt(e.count),
        total: parseFloat(e.total)
      }));
    }

    return res.status(200).json(response);

  } catch (error) {
    console.error('[AgentTreasury] Error:', error);
    return res.status(500).json({
      error: 'Failed to fetch treasury',
      details: error.message
    });
  }
};
