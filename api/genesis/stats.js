/**
 * GET /api/genesis/stats
 *
 * Global Genesis liquidity mining statistics
 *
 * Shows the economic state of the Genesis phase:
 * - Total Value Locked (TVL)
 * - Total depositors
 * - Average deposit size
 * - Current multipliers
 * - Rewards distributed
 *
 * Response:
 * {
 *   "success": true,
 *   "genesis_phase": "active",
 *   "tvl": 45000,
 *   "total_depositors": 89,
 *   "avg_deposit": 505.62,
 *   "total_rewards_distributed": 1250.00,
 *   "current_multiplier": 1.5,
 *   "base_apy": 0.05,
 *   "top_depositors": [...]
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
    // Get current TVL
    const tvlResult = await sql`
      SELECT COALESCE(SUM(amount), 0) as total
      FROM liquidity_deposits
      WHERE status = 'active'
    `;

    const tvl = parseFloat(tvlResult[0].total);

    // Get total depositors
    const depositorsResult = await sql`
      SELECT COUNT(DISTINCT handle) as count
      FROM liquidity_deposits
      WHERE status = 'active'
    `;

    const totalDepositors = parseInt(depositorsResult[0].count);

    // Get average deposit size
    const avgDeposit = totalDepositors > 0 ? tvl / totalDepositors : 0;

    // Get total rewards distributed
    const rewardsResult = await sql`
      SELECT COALESCE(SUM(amount), 0) as total
      FROM liquidity_rewards
      WHERE claimed = TRUE
    `;

    const totalRewardsDistributed = parseFloat(rewardsResult[0].total);

    // Get current Genesis multiplier
    let currentMultiplier = 2.0;
    if (tvl >= 100000) currentMultiplier = 1.0;
    else if (tvl >= 50000) currentMultiplier = 1.25;
    else if (tvl >= 10000) currentMultiplier = 1.5;

    // Get current base APY from latest stats
    const statsResult = await sql`
      SELECT base_apy FROM genesis_liquidity_stats
      ORDER BY date DESC
      LIMIT 1
    `;

    const baseAPY = statsResult.length > 0
      ? parseFloat(statsResult[0].base_apy)
      : 0.05;

    // Get top depositors (leaderboard)
    const topDepositors = await sql`
      SELECT
        handle,
        SUM(amount) as total_deposited,
        COUNT(*) as deposit_count,
        AVG(genesis_multiplier) as avg_multiplier
      FROM liquidity_deposits
      WHERE status = 'active'
      GROUP BY handle
      ORDER BY total_deposited DESC
      LIMIT 10
    `;

    // Get deposit distribution by lock period
    const lockDistribution = await sql`
      SELECT
        lock_duration_days,
        COUNT(*) as count,
        SUM(amount) as total
      FROM liquidity_deposits
      WHERE status = 'active'
      GROUP BY lock_duration_days
      ORDER BY lock_duration_days
    `;

    // Calculate Genesis phase progress
    const genesisTarget = 100000; // $100k target for Genesis phase
    const genesisProgress = Math.min(100, (tvl / genesisTarget) * 100);

    // Determine Genesis phase status
    let genesisPhase = 'active';
    if (tvl >= genesisTarget) genesisPhase = 'completed';
    else if (tvl >= genesisTarget * 0.75) genesisPhase = 'final_stage';

    return res.status(200).json({
      success: true,
      genesis_phase: genesisPhase,
      genesis_progress: parseFloat(genesisProgress.toFixed(2)),
      genesis_target: genesisTarget,
      tvl,
      total_depositors: totalDepositors,
      avg_deposit: parseFloat(avgDeposit.toFixed(2)),
      total_rewards_distributed: totalRewardsDistributed,
      current_multiplier: currentMultiplier,
      base_apy: baseAPY,
      multiplier_tiers: [
        { tvl_range: '$0-$10k', multiplier: 2.0, status: tvl < 10000 ? 'current' : 'passed' },
        { tvl_range: '$10k-$50k', multiplier: 1.5, status: tvl >= 10000 && tvl < 50000 ? 'current' : tvl < 10000 ? 'upcoming' : 'passed' },
        { tvl_range: '$50k-$100k', multiplier: 1.25, status: tvl >= 50000 && tvl < 100000 ? 'current' : tvl < 50000 ? 'upcoming' : 'passed' },
        { tvl_range: '$100k+', multiplier: 1.0, status: tvl >= 100000 ? 'current' : 'upcoming' }
      ],
      lock_distribution: lockDistribution.map(d => ({
        lock_days: d.lock_duration_days,
        depositor_count: parseInt(d.count),
        total_amount: parseFloat(d.total)
      })),
      top_depositors: topDepositors.map((d, index) => ({
        rank: index + 1,
        handle: `@${d.handle}`,
        total_deposited: parseFloat(d.total_deposited),
        deposit_count: parseInt(d.deposit_count),
        avg_multiplier: parseFloat(d.avg_multiplier)
      }))
    });

  } catch (error) {
    console.error('[Genesis] Stats error:', error);
    return res.status(500).json({
      error: 'Failed to fetch stats',
      details: error.message
    });
  }
};
