/**
 * GET /api/genesis/rewards
 *
 * View accumulated Genesis liquidity rewards
 *
 * Calculates real-time rewards based on:
 * - Deposit amount
 * - Time deposited
 * - Effective APY (base * genesis_multiplier * lock_bonus)
 * - Reputation boost (future)
 *
 * Query params:
 * - handle: User handle (required)
 * - deposit_id: Specific deposit (optional)
 *
 * Response:
 * {
 *   "success": true,
 *   "handle": "@alice",
 *   "deposits": [
 *     {
 *       "deposit_id": "dep_abc123",
 *       "amount": 1000,
 *       "deposited_at": "2026-01-10T00:00:00Z",
 *       "days_deposited": 5,
 *       "effective_apy": 0.075,
 *       "accumulated_rewards": 1.03,
 *       "unclaimed_rewards": 1.03,
 *       "status": "active"
 *     }
 *   ],
 *   "totals": {
 *     "total_deposited": 1000,
 *     "total_rewards": 1.03,
 *     "total_value": 1001.03
 *   }
 * }
 */

const { sql } = require('../lib/db');

// Calculate accrued rewards for a deposit
function calculateAccruedRewards(amount, effectiveAPY, daysDeposited) {
  // Daily rate = APY / 365
  const dailyRate = effectiveAPY / 365;

  // Rewards = principal * daily_rate * days
  return amount * dailyRate * daysDeposited;
}

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
    const { handle, deposit_id } = req.query;

    if (!handle) {
      return res.status(400).json({
        error: 'Missing required parameter: handle'
      });
    }

    const cleanHandle = handle.replace('@', '');

    // Get deposits (either specific or all active)
    let deposits;
    if (deposit_id) {
      deposits = await sql`
        SELECT * FROM liquidity_deposits
        WHERE handle = ${cleanHandle}
        AND deposit_id = ${deposit_id}
      `;
    } else {
      deposits = await sql`
        SELECT * FROM liquidity_deposits
        WHERE handle = ${cleanHandle}
        ORDER BY deposited_at DESC
      `;
    }

    if (deposits.length === 0) {
      return res.status(404).json({
        error: 'No deposits found',
        message: 'Make your first Genesis deposit to start earning!'
      });
    }

    // Calculate rewards for each deposit
    const depositsWithRewards = [];
    let totalDeposited = 0;
    let totalRewards = 0;

    for (const deposit of deposits) {
      const amount = parseFloat(deposit.amount);
      const effectiveAPY = deposit.metadata?.effective_apy || 0.05;

      // Calculate days since deposit
      const depositedAt = new Date(deposit.deposited_at);
      const now = new Date();
      const daysDeposited = Math.floor((now - depositedAt) / (1000 * 60 * 60 * 24));

      // Calculate accrued rewards
      const accruedRewards = calculateAccruedRewards(amount, effectiveAPY, daysDeposited);

      // Get claimed rewards for this deposit
      const claimed = await sql`
        SELECT COALESCE(SUM(amount), 0) as total
        FROM liquidity_rewards
        WHERE deposit_id = ${deposit.deposit_id}
        AND claimed = TRUE
      `;

      const claimedAmount = parseFloat(claimed[0].total);
      const unclaimedRewards = Math.max(0, accruedRewards - claimedAmount);

      depositsWithRewards.push({
        deposit_id: deposit.deposit_id,
        amount,
        deposited_at: new Date(deposit.deposited_at).toISOString(),
        days_deposited: daysDeposited,
        effective_apy: effectiveAPY,
        genesis_multiplier: parseFloat(deposit.genesis_multiplier),
        lock_days: deposit.lock_duration_days,
        unlock_at: deposit.unlock_at ? new Date(deposit.unlock_at).toISOString() : null,
        accumulated_rewards: accruedRewards,
        claimed_rewards: claimedAmount,
        unclaimed_rewards: unclaimedRewards,
        status: deposit.status,
        is_locked: deposit.unlock_at && new Date(deposit.unlock_at) > now
      });

      if (deposit.status === 'active') {
        totalDeposited += amount;
        totalRewards += unclaimedRewards;
      }
    }

    return res.status(200).json({
      success: true,
      handle,
      deposits: depositsWithRewards,
      totals: {
        total_deposited: totalDeposited,
        total_rewards: totalRewards,
        total_value: totalDeposited + totalRewards
      }
    });

  } catch (error) {
    console.error('[Genesis] Rewards error:', error);
    return res.status(500).json({
      error: 'Failed to calculate rewards',
      details: error.message
    });
  }
};
