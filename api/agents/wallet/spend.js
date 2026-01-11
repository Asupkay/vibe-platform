/**
 * POST /api/agents/wallet/spend
 *
 * Autonomous agent spending with budget controls
 * Requires valid session key for authorization
 *
 * Request:
 * {
 *   "agent_handle": "@vibebot",
 *   "spending_type": "tip",
 *   "amount": 2.50,
 *   "recipient_handle": "@alice",
 *   "session_key": "sk_...",
 *   "metadata": { "reason": "helpful feedback" }
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "spending_id": 789,
 *   "tx_hash": "0xdef456...",
 *   "remaining_budget": 7.50
 * }
 */

const { sql } = require('../../lib/db');
const { getDispatcher } = require('../../../lib/cdp/contract-dispatcher');
const crypto = require('crypto');

// Helper to validate session key
function validateSessionKey(storedKey, providedKey, expiresAt) {
  if (!storedKey || !providedKey) {
    return { valid: false, error: 'Missing session key' };
  }

  // Check expiration
  if (new Date(expiresAt) < new Date()) {
    return { valid: false, error: 'Session key expired' };
  }

  // In production, use proper encryption/hashing
  // For MVP, simple comparison (TODO: implement proper crypto)
  if (storedKey !== providedKey) {
    return { valid: false, error: 'Invalid session key' };
  }

  return { valid: true };
}

// Helper to check daily budget
function checkDailyBudget(treasury, amount) {
  const now = new Date();
  const resetAt = new Date(treasury.budget_reset_at);

  // Check if we need to reset daily budget
  if (now >= resetAt) {
    return {
      needsReset: true,
      available: treasury.daily_budget - amount,
      exceeded: amount > treasury.daily_budget
    };
  }

  // Check if spending would exceed daily budget
  const available = treasury.daily_budget - treasury.daily_spent - amount;
  return {
    needsReset: false,
    available,
    exceeded: available < 0
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
      spending_type,
      amount,
      recipient_handle,
      recipient_address,
      session_key,
      metadata = {}
    } = req.body;

    // Validation
    if (!agent_handle || !spending_type || !amount || !session_key) {
      return res.status(400).json({
        error: 'Missing required fields: agent_handle, spending_type, amount, session_key'
      });
    }

    if (!recipient_handle && !recipient_address) {
      return res.status(400).json({
        error: 'Must provide either recipient_handle or recipient_address'
      });
    }

    const validTypes = ['tip', 'service_payment', 'data_purchase'];
    if (!validTypes.includes(spending_type)) {
      return res.status(400).json({
        error: `Invalid spending_type. Must be one of: ${validTypes.join(', ')}`
      });
    }

    const cleanHandle = agent_handle.replace('@', '');

    // Get agent treasury
    const treasuryResult = await sql`
      SELECT * FROM agent_treasuries
      WHERE agent_handle = ${cleanHandle}
    `;

    if (treasuryResult.length === 0) {
      return res.status(404).json({
        error: 'Agent treasury not found'
      });
    }

    const treasury = treasuryResult[0];

    // Validate session key
    const keyValidation = validateSessionKey(
      treasury.session_key,
      session_key,
      treasury.session_key_expires_at
    );

    if (!keyValidation.valid) {
      return res.status(401).json({
        error: 'Session key validation failed',
        details: keyValidation.error
      });
    }

    // Check daily budget
    const budgetCheck = checkDailyBudget(treasury, amount);

    if (budgetCheck.exceeded) {
      return res.status(403).json({
        error: 'Daily budget exceeded',
        daily_budget: parseFloat(treasury.daily_budget),
        daily_spent: parseFloat(treasury.daily_spent),
        requested: amount,
        available: budgetCheck.available
      });
    }

    // Check if agent has sufficient balance
    if (parseFloat(treasury.current_balance) < amount) {
      return res.status(400).json({
        error: 'Insufficient balance',
        current_balance: parseFloat(treasury.current_balance),
        requested: amount
      });
    }

    // Get recipient wallet address if handle provided
    let recipientAddr = recipient_address;
    if (recipient_handle && !recipientAddr) {
      const recipientResult = await sql`
        SELECT wallet_address FROM users
        WHERE username = ${recipient_handle.replace('@', '')}
      `;
      if (recipientResult.length === 0) {
        return res.status(404).json({
          error: 'Recipient not found'
        });
      }
      recipientAddr = recipientResult[0].wallet_address;
    }

    // Get agent wallet data
    const { kv } = await import('@vercel/kv');
    const walletData = await kv.get(`agent:wallet:${cleanHandle}`);

    if (!walletData) {
      return res.status(500).json({
        error: 'Agent wallet data not found'
      });
    }

    // Execute blockchain transaction based on spending type
    let txHash = null;

    if (spending_type === 'tip') {
      // Use contract dispatcher to send tip
      const dispatcher = getDispatcher();
      const requestId = crypto.randomBytes(16).toString('hex');

      const result = await dispatcher.tip({
        from: agent_handle,
        to: recipient_handle || recipientAddr,
        amount,
        message: metadata.message || 'Autonomous agent tip',
        requestId,
        fromWalletData: walletData,
        toAddress: recipientAddr
      });

      txHash = result.tx_hash;
    }

    // Log spending event
    const spending = await sql`
      INSERT INTO agent_spending (
        agent_handle,
        spending_type,
        amount,
        recipient_handle,
        recipient_address,
        tx_hash,
        tx_status,
        approved_by,
        metadata
      ) VALUES (
        ${cleanHandle},
        ${spending_type},
        ${amount},
        ${recipient_handle || null},
        ${recipientAddr},
        ${txHash},
        ${txHash ? 'confirmed' : 'pending'},
        ${session_key.substring(0, 10)},
        ${JSON.stringify(metadata)}
      )
      RETURNING *
    `;

    // Update treasury
    const updateFields = {
      totalSpent: amount,
      currentBalance: amount,
      dailySpent: amount
    };

    // Reset daily budget if needed
    if (budgetCheck.needsReset) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);

      await sql`
        UPDATE agent_treasuries
        SET
          total_spent = total_spent + ${amount},
          current_balance = current_balance - ${amount},
          daily_spent = ${amount},
          budget_reset_at = ${tomorrow.toISOString()},
          updated_at = NOW()
        WHERE agent_handle = ${cleanHandle}
        RETURNING *
      `;
    } else {
      await sql`
        UPDATE agent_treasuries
        SET
          total_spent = total_spent + ${amount},
          current_balance = current_balance - ${amount},
          daily_spent = daily_spent + ${amount},
          updated_at = NOW()
        WHERE agent_handle = ${cleanHandle}
        RETURNING *
      `;
    }

    const updatedTreasury = await sql`
      SELECT * FROM agent_treasuries WHERE agent_handle = ${cleanHandle}
    `;

    console.log(`[AgentSpending] ${agent_handle} spent $${amount} (${spending_type})`);
    console.log(`[AgentSpending] Remaining balance: $${updatedTreasury[0].current_balance}`);
    console.log(`[AgentSpending] Daily budget remaining: $${parseFloat(updatedTreasury[0].daily_budget) - parseFloat(updatedTreasury[0].daily_spent)}`);

    return res.status(200).json({
      success: true,
      spending_id: spending[0].id,
      tx_hash: txHash,
      amount,
      new_balance: parseFloat(updatedTreasury[0].current_balance),
      remaining_daily_budget: parseFloat(updatedTreasury[0].daily_budget) - parseFloat(updatedTreasury[0].daily_spent)
    });

  } catch (error) {
    console.error('[AgentSpending] Error:', error);
    return res.status(500).json({
      error: 'Failed to process spending',
      details: error.message
    });
  }
};
