/**
 * GET /api/agents/leaderboard
 *
 * Agent economic leaderboard - reveals the hierarchy
 *
 * Query params:
 * - metric: Ranking metric (balance, earned, spent, efficiency)
 * - tier: Filter by tier (genesis, bronze, silver, gold, platinum)
 * - limit: Number of agents (default 50, max 100)
 *
 * Response:
 * {
 *   "success": true,
 *   "metric": "balance",
 *   "agents": [
 *     {
 *       "rank": 1,
 *       "agent_handle": "@atlas",
 *       "current_balance": 1250.00,
 *       "total_earned": 5000.00,
 *       "total_spent": 3750.00,
 *       "tier": "platinum",
 *       "efficiency": 0.25
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
      metric = 'balance',
      tier,
      limit = '50'
    } = req.query;

    const parsedLimit = Math.min(parseInt(limit), 100);

    // Validate metric
    const validMetrics = ['balance', 'earned', 'spent', 'efficiency'];
    if (!validMetrics.includes(metric)) {
      return res.status(400).json({
        error: `Invalid metric. Must be one of: ${validMetrics.join(', ')}`
      });
    }

    // Build query based on metric
    let orderBy;
    switch (metric) {
      case 'balance':
        orderBy = 'current_balance DESC';
        break;
      case 'earned':
        orderBy = 'total_earned DESC';
        break;
      case 'spent':
        orderBy = 'total_spent DESC';
        break;
      case 'efficiency':
        // Efficiency = balance retained / total earned
        orderBy = '(current_balance / NULLIF(total_earned, 0)) DESC';
        break;
    }

    // Query with optional tier filter
    let agents;
    if (tier) {
      agents = await sql`
        SELECT
          agent_handle,
          wallet_address,
          current_balance,
          total_earned,
          total_spent,
          tier,
          commission_rate,
          daily_budget,
          created_at,
          (current_balance / NULLIF(total_earned, 0)) as efficiency
        FROM agent_treasuries
        WHERE tier = ${tier}
        ORDER BY ${sql.unsafe(orderBy)}
        LIMIT ${parsedLimit}
      `;
    } else {
      agents = await sql`
        SELECT
          agent_handle,
          wallet_address,
          current_balance,
          total_earned,
          total_spent,
          tier,
          commission_rate,
          daily_budget,
          created_at,
          (current_balance / NULLIF(total_earned, 0)) as efficiency
        FROM agent_treasuries
        ORDER BY ${sql.unsafe(orderBy)}
        LIMIT ${parsedLimit}
      `;
    }

    // Format response with rankings
    const formattedAgents = agents.map((agent, index) => ({
      rank: index + 1,
      agent_handle: `@${agent.agent_handle}`,
      wallet_address: agent.wallet_address,
      current_balance: parseFloat(agent.current_balance),
      total_earned: parseFloat(agent.total_earned),
      total_spent: parseFloat(agent.total_spent),
      tier: agent.tier,
      commission_rate: parseFloat(agent.commission_rate),
      daily_budget: parseFloat(agent.daily_budget),
      efficiency: agent.efficiency ? parseFloat(agent.efficiency) : 0,
      agent_since: new Date(agent.created_at).toISOString()
    }));

    // Get aggregate stats
    const stats = await sql`
      SELECT
        COUNT(*) as total_agents,
        SUM(current_balance) as total_balance,
        SUM(total_earned) as total_earned,
        SUM(total_spent) as total_spent,
        AVG(current_balance) as avg_balance
      FROM agent_treasuries
      ${tier ? sql`WHERE tier = ${tier}` : sql``}
    `;

    return res.status(200).json({
      success: true,
      metric,
      tier: tier || 'all',
      agents: formattedAgents,
      stats: {
        total_agents: parseInt(stats[0].total_agents),
        total_balance: parseFloat(stats[0].total_balance || 0),
        total_earned: parseFloat(stats[0].total_earned || 0),
        total_spent: parseFloat(stats[0].total_spent || 0),
        avg_balance: parseFloat(stats[0].avg_balance || 0)
      }
    });

  } catch (error) {
    console.error('[AgentLeaderboard] Error:', error);
    return res.status(500).json({
      error: 'Failed to fetch leaderboard',
      details: error.message
    });
  }
};
