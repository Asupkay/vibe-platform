/**
 * POST /api/agents/wallet/create
 *
 * Create an agent treasury - gives an agent economic agency
 *
 * Request:
 * {
 *   "agent_handle": "@vibebot",
 *   "daily_budget": 10,
 *   "tier": "genesis"
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "agent_handle": "@vibebot",
 *   "wallet_address": "0x...",
 *   "daily_budget": 10,
 *   "tier": "genesis"
 * }
 */

const { sql } = require('../../lib/db');
const { Wallet, Coinbase } = require('@coinbase/coinbase-sdk');

async function createAgentWallet(agentHandle) {
  // Configure Coinbase SDK
  const apiKeyName = process.env.CDP_API_KEY_NAME;
  const privateKey = process.env.CDP_API_KEY_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!apiKeyName || !privateKey) {
    throw new Error('CDP API credentials not configured');
  }

  Coinbase.configure({ apiKeyName, privateKey });

  // Create wallet on Base
  const wallet = await Wallet.create({
    networkId: process.env.NODE_ENV === 'production' ? 'base-mainnet' : 'base-sepolia'
  });

  const address = await wallet.getDefaultAddress();
  const walletId = wallet.getId();

  console.log(`[AgentWallet] Created wallet for ${agentHandle}: ${address}`);

  // Export wallet data for storage
  const walletData = await wallet.export();

  // Store wallet data in KV
  const { kv } = await import('@vercel/kv');
  const cleanHandle = agentHandle.replace('@', '');
  await kv.set(`agent:wallet:${cleanHandle}`, JSON.stringify(walletData));

  return {
    address: address.getId(),
    walletId,
    walletData
  };
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
      agent_handle,
      daily_budget = 10,
      tier = 'genesis',
      commission_rate = 0.025
    } = req.body;

    // Validation
    if (!agent_handle) {
      return res.status(400).json({
        error: 'Missing required field: agent_handle'
      });
    }

    const cleanHandle = agent_handle.replace('@', '');

    // Check if agent already has treasury
    const existing = await sql`
      SELECT * FROM agent_treasuries
      WHERE agent_handle = ${cleanHandle}
    `;

    if (existing.length > 0) {
      return res.status(400).json({
        error: 'Agent already has a treasury',
        treasury: existing[0]
      });
    }

    // Create wallet
    console.log(`[AgentTreasury] Creating wallet for ${agent_handle}...`);
    const wallet = await createAgentWallet(agent_handle);

    // Create treasury record
    const result = await sql`
      INSERT INTO agent_treasuries (
        agent_handle,
        wallet_address,
        daily_budget,
        tier,
        commission_rate,
        metadata
      ) VALUES (
        ${cleanHandle},
        ${wallet.address},
        ${daily_budget},
        ${tier},
        ${commission_rate},
        ${JSON.stringify({
          walletId: wallet.walletId,
          createdAt: new Date().toISOString()
        })}
      )
      RETURNING *
    `;

    const treasury = result[0];

    console.log(`[AgentTreasury] Treasury created for ${agent_handle}`);

    return res.status(200).json({
      success: true,
      agent_handle,
      wallet_address: treasury.wallet_address,
      daily_budget: parseFloat(treasury.daily_budget),
      tier: treasury.tier,
      commission_rate: parseFloat(treasury.commission_rate),
      created_at: treasury.created_at
    });

  } catch (error) {
    console.error('[AgentTreasury] Create error:', error);
    return res.status(500).json({
      error: 'Failed to create agent treasury',
      details: error.message
    });
  }
};
