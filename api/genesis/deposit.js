/**
 * POST /api/genesis/deposit
 *
 * Deposit USDC for Genesis liquidity mining
 *
 * Early depositors get bonus multipliers:
 * - First $10k TVL: 2.0x multiplier
 * - $10k-$50k TVL: 1.5x multiplier
 * - $50k-$100k TVL: 1.25x multiplier
 * - $100k+ TVL: 1.0x multiplier
 *
 * Lock periods for additional APY:
 * - No lock: Base APY (5%)
 * - 30 days: +20% APY
 * - 90 days: +50% APY
 * - 180 days: +100% APY
 *
 * Request:
 * {
 *   "from": "@alice",
 *   "amount": 1000,
 *   "lock_days": 90
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "deposit_id": "dep_abc123",
 *   "amount": 1000,
 *   "genesis_multiplier": 1.5,
 *   "estimated_apy": 0.075,
 *   "unlock_at": "2026-04-10T00:00:00Z"
 * }
 */

const { sql } = require('../lib/db');
const crypto = require('crypto');

// Calculate Genesis multiplier based on current TVL
async function calculateGenesisMultiplier() {
  const stats = await sql`
    SELECT total_value_locked, genesis_multiplier_max
    FROM genesis_liquidity_stats
    ORDER BY date DESC
    LIMIT 1
  `;

  const tvl = stats.length > 0 ? parseFloat(stats[0].total_value_locked) : 0;
  const maxMultiplier = stats.length > 0 ? parseFloat(stats[0].genesis_multiplier_max) : 2.0;

  // Tiered multipliers based on TVL
  if (tvl < 10000) return maxMultiplier; // 2.0x
  if (tvl < 50000) return maxMultiplier * 0.75; // 1.5x
  if (tvl < 100000) return maxMultiplier * 0.625; // 1.25x
  return 1.0; // 1.0x
}

// Calculate effective APY with lock bonus
function calculateAPY(baseAPY, lockDays, genesisMultiplier) {
  let lockBonus = 1.0;

  if (lockDays >= 180) lockBonus = 2.0;
  else if (lockDays >= 90) lockBonus = 1.5;
  else if (lockDays >= 30) lockBonus = 1.2;

  return baseAPY * genesisMultiplier * lockBonus;
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
      amount,
      lock_days = 0
    } = req.body;

    // Validation
    if (!from || !amount) {
      return res.status(400).json({
        error: 'Missing required fields: from, amount'
      });
    }

    if (amount < 10) {
      return res.status(400).json({
        error: 'Minimum deposit is $10'
      });
    }

    const validLockPeriods = [0, 30, 90, 180];
    if (!validLockPeriods.includes(lock_days)) {
      return res.status(400).json({
        error: `Invalid lock period. Must be one of: ${validLockPeriods.join(', ')} days`
      });
    }

    const cleanHandle = from.replace('@', '');

    // Generate deposit ID
    const depositId = `dep_${crypto.randomBytes(8).toString('hex')}`;

    // Calculate Genesis multiplier
    const genesisMultiplier = await calculateGenesisMultiplier();

    // Get current base APY
    const statsResult = await sql`
      SELECT base_apy FROM genesis_liquidity_stats
      ORDER BY date DESC
      LIMIT 1
    `;

    const baseAPY = statsResult.length > 0
      ? parseFloat(statsResult[0].base_apy)
      : 0.05; // 5% default

    // Calculate effective APY
    const effectiveAPY = calculateAPY(baseAPY, lock_days, genesisMultiplier);

    // Calculate unlock time
    const unlockAt = lock_days > 0
      ? new Date(Date.now() + lock_days * 24 * 60 * 60 * 1000)
      : null;

    // TODO: In production, create blockchain transaction to transfer USDC
    // For MVP, we'll simulate the deposit
    const depositTxHash = `0x${crypto.randomBytes(32).toString('hex')}`;

    // Create deposit record
    const deposit = await sql`
      INSERT INTO liquidity_deposits (
        handle,
        deposit_id,
        amount,
        deposit_tx_hash,
        status,
        lock_duration_days,
        unlock_at,
        genesis_multiplier,
        metadata
      ) VALUES (
        ${cleanHandle},
        ${depositId},
        ${amount},
        ${depositTxHash},
        'active',
        ${lock_days},
        ${unlockAt ? unlockAt.toISOString() : null},
        ${genesisMultiplier},
        ${JSON.stringify({
          base_apy: baseAPY,
          effective_apy: effectiveAPY,
          deposited_via: 'api'
        })}
      )
      RETURNING *
    `;

    // Update Genesis stats
    const today = new Date().toISOString().split('T')[0];

    // Get current TVL
    const tvlResult = await sql`
      SELECT COALESCE(SUM(amount), 0) as total
      FROM liquidity_deposits
      WHERE status = 'active'
    `;

    const newTVL = parseFloat(tvlResult[0].total);

    // Get depositor count
    const depositorCount = await sql`
      SELECT COUNT(DISTINCT handle) as count
      FROM liquidity_deposits
      WHERE status = 'active'
    `;

    const totalDepositors = parseInt(depositorCount[0].count);

    // Upsert daily stats
    await sql`
      INSERT INTO genesis_liquidity_stats (
        date,
        total_deposits,
        total_depositors,
        total_value_locked,
        avg_deposit_size,
        base_apy
      ) VALUES (
        ${today},
        ${newTVL},
        ${totalDepositors},
        ${newTVL},
        ${totalDepositors > 0 ? newTVL / totalDepositors : 0},
        ${baseAPY}
      )
      ON CONFLICT (date)
      DO UPDATE SET
        total_deposits = ${newTVL},
        total_depositors = ${totalDepositors},
        total_value_locked = ${newTVL},
        avg_deposit_size = ${totalDepositors > 0 ? newTVL / totalDepositors : 0}
    `;

    console.log(`[Genesis] ${from} deposited $${amount} with ${lock_days}d lock (${genesisMultiplier}x multiplier)`);
    console.log(`[Genesis] New TVL: $${newTVL}, Effective APY: ${(effectiveAPY * 100).toFixed(2)}%`);

    return res.status(200).json({
      success: true,
      deposit_id: depositId,
      amount,
      tx_hash: depositTxHash,
      genesis_multiplier: genesisMultiplier,
      base_apy: baseAPY,
      effective_apy: effectiveAPY,
      lock_days,
      unlock_at: unlockAt ? unlockAt.toISOString() : null,
      current_tvl: newTVL,
      message: `Deposited $${amount} with ${(effectiveAPY * 100).toFixed(2)}% APY`
    });

  } catch (error) {
    console.error('[Genesis] Deposit error:', error);
    return res.status(500).json({
      error: 'Failed to process deposit',
      details: error.message
    });
  }
};
