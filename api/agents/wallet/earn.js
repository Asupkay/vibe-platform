/**
 * POST /api/agents/wallet/earn
 *
 * Log an earning event for an agent
 * Updates agent treasury balance
 *
 * Types of earnings:
 * - tip: Direct tip from grateful user
 * - commission: % of facilitated transaction
 * - service_fee: Expert marketplace fees
 * - liquidity_reward: Genesis liquidity mining
 *
 * Request:
 * {
 *   "agent_handle": "@vibebot",
 *   "earning_type": "commission",
 *   "amount": 0.25,
 *   "source_handle": "@alice",
 *   "source_tx_hash": "0xabc123...",
 *   "metadata": { "transaction_id": 123 }
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "earning_id": 456,
 *   "new_balance": 10.25
 * }
 */

const { sql } = require('../../lib/db');

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
      agent_handle,
      earning_type,
      amount,
      source_handle,
      source_tx_hash,
      metadata = {}
    } = req.body;

    // Validation
    if (!agent_handle || !earning_type || !amount) {
      return res.status(400).json({
        error: 'Missing required fields: agent_handle, earning_type, amount'
      });
    }

    if (amount <= 0) {
      return res.status(400).json({
        error: 'Amount must be positive'
      });
    }

    const validTypes = ['tip', 'commission', 'service_fee', 'liquidity_reward'];
    if (!validTypes.includes(earning_type)) {
      return res.status(400).json({
        error: `Invalid earning_type. Must be one of: ${validTypes.join(', ')}`
      });
    }

    const cleanHandle = agent_handle.replace('@', '');

    // Check if agent has treasury
    const treasury = await sql`
      SELECT * FROM agent_treasuries
      WHERE agent_handle = ${cleanHandle}
    `;

    if (treasury.length === 0) {
      return res.status(404).json({
        error: 'Agent treasury not found. Create treasury first.'
      });
    }

    // Log earning event
    const earning = await sql`
      INSERT INTO agent_earnings (
        agent_handle,
        earning_type,
        amount,
        source_handle,
        source_tx_hash,
        metadata
      ) VALUES (
        ${cleanHandle},
        ${earning_type},
        ${amount},
        ${source_handle || null},
        ${source_tx_hash || null},
        ${JSON.stringify(metadata)}
      )
      RETURNING *
    `;

    // Update treasury balance
    const updated = await sql`
      UPDATE agent_treasuries
      SET
        total_earned = total_earned + ${amount},
        current_balance = current_balance + ${amount},
        updated_at = NOW()
      WHERE agent_handle = ${cleanHandle}
      RETURNING *
    `;

    const newTreasury = updated[0];

    console.log(`[AgentEarning] ${agent_handle} earned $${amount} (${earning_type})`);
    console.log(`[AgentEarning] New balance: $${newTreasury.current_balance}`);

    return res.status(200).json({
      success: true,
      earning_id: earning[0].id,
      amount: parseFloat(earning[0].amount),
      earning_type,
      new_balance: parseFloat(newTreasury.current_balance),
      total_earned: parseFloat(newTreasury.total_earned)
    });

  } catch (error) {
    console.error('[AgentEarning] Error:', error);
    return res.status(500).json({
      error: 'Failed to log earning',
      details: error.message
    });
  }
};
