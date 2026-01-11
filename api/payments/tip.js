/**
 * POST /api/payments/tip
 *
 * Instant peer-to-peer payment via X402 Micropayments
 * Waits for blockchain confirmation (~3 seconds)
 *
 * Request:
 * {
 *   "from": "@alice",
 *   "to": "@bob",
 *   "amount": 5,
 *   "message": "Thanks for the help!"
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "tx_hash": "0xabc123...",
 *   "status": "confirmed",
 *   "amount": 5,
 *   "fee": 0.125,
 *   "net_to_recipient": 4.875
 * }
 */

const { getDispatcher } = require('../../lib/cdp/contract-dispatcher');
const { sql } = require('../lib/db');
const crypto = require('crypto');

// Helper to get or create wallet (placeholder - will use actual implementation)
async function ensureWallet(handle, context) {
  // This should import from lib/cdp/wallet-helpers once it's available
  // For now, just return a placeholder
  const cleanHandle = handle.replace('@', '');

  // Get wallet address from database
  const result = await sql`
    SELECT wallet_address FROM users WHERE username = ${cleanHandle}
  `;

  if (result.length === 0 || !result[0].wallet_address) {
    throw new Error(`No wallet for ${handle}. User needs to create wallet first.`);
  }

  return result[0].wallet_address;
}

// Helper to get wallet balance (placeholder)
async function getBalance(handle) {
  // This should call the actual balance checker
  // For now, return a placeholder value
  return 100; // $100 placeholder
}

// Simple auth check (placeholder)
function requireAuth(req, handle) {
  // For MVP, we can use a simple token check
  // In production, use proper JWT validation
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return { authenticated: false, error: 'Missing Authorization header' };
  }

  // TODO: Implement proper auth validation
  return { authenticated: true };
}

// Rate limit check (placeholder)
async function checkRateLimit(kv, type, handle) {
  // For MVP, allow 10 tips per hour
  return {
    success: true,
    remaining: 9,
    reset: Date.now() + 3600000
  };
}

function setRateLimitHeaders(res, rateInfo) {
  res.setHeader('X-RateLimit-Remaining', rateInfo.remaining || 0);
  res.setHeader('X-RateLimit-Reset', rateInfo.reset || Date.now());
}

function rateLimitResponse(res, rateInfo) {
  setRateLimitHeaders(res, rateInfo);
  return res.status(429).json({
    error: 'Rate limit exceeded',
    remaining: 0,
    reset_at: new Date(rateInfo.reset).toISOString()
  });
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
    const { from, to, amount, message } = req.body;

    // Validation
    if (!from || !to || !amount) {
      return res.status(400).json({
        error: 'Missing required fields: from, to, amount'
      });
    }

    if (amount <= 0 || amount > 100) {
      return res.status(400).json({
        error: 'Amount must be between $0.01 and $100'
      });
    }

    // Auth
    const auth = requireAuth(req, from);
    if (!auth.authenticated) {
      return res.status(401).json({ error: auth.error });
    }

    // Rate limit
    const { kv } = await import('@vercel/kv');
    const rateInfo = await checkRateLimit(kv, 'tip', from.replace('@', ''));
    if (!rateInfo.success) {
      return rateLimitResponse(res, rateInfo);
    }
    setRateLimitHeaders(res, rateInfo);

    // Ensure wallets exist
    const fromWallet = await ensureWallet(from, 'tip_payment');
    const toWallet = await ensureWallet(to, 'tip_receive');

    // Check balance
    const balance = await getBalance(from);
    if (balance < amount) {
      return res.status(400).json({
        error: 'Insufficient balance',
        balance: `$${balance.toFixed(2)}`,
        needed: `$${amount.toFixed(2)}`
      });
    }

    // Get wallet data from KV
    const fromWalletData = await kv.get(`wallet:${from.replace('@', '')}`);
    if (!fromWalletData) {
      return res.status(500).json({
        error: 'Wallet data not found. Please recreate wallet.'
      });
    }

    // Generate request ID
    const requestId = crypto.randomBytes(16).toString('hex');

    // Call dispatcher (WAITS for confirmation)
    const dispatcher = getDispatcher();
    const result = await dispatcher.tip({
      from,
      to,
      amount,
      message,
      requestId,
      fromWalletData: fromWalletData,
      toAddress: toWallet
    });

    // Log to database - sender side
    await sql`
      INSERT INTO wallet_events (
        handle,
        event_type,
        wallet_address,
        amount,
        transaction_hash,
        tx_status,
        tx_confirmation_time,
        metadata
      ) VALUES (
        ${from.replace('@', '')},
        'tip_sent',
        ${fromWallet},
        ${amount},
        ${result.tx_hash},
        'confirmed',
        NOW(),
        ${JSON.stringify({
          to: to.replace('@', ''),
          message,
          requestId,
          fee: result.fee,
          contract: 'X402Micropayments'
        })}
      )
    `;

    // Log recipient side
    await sql`
      INSERT INTO wallet_events (
        handle,
        event_type,
        wallet_address,
        amount,
        transaction_hash,
        tx_status,
        tx_confirmation_time,
        metadata
      ) VALUES (
        ${to.replace('@', '')},
        'tip_received',
        ${toWallet},
        ${amount - result.fee},
        ${result.tx_hash},
        'confirmed',
        NOW(),
        ${JSON.stringify({
          from: from.replace('@', ''),
          message,
          requestId
        })}
      )
    `;

    // Notify recipient via DM (async, don't block)
    const vercelUrl = process.env.VERCEL_URL || process.env.NEXT_PUBLIC_VERCEL_URL;
    if (vercelUrl) {
      fetch(`https://${vercelUrl}/api/messages/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'system',
          to,
          text: `💰 ${from} tipped you $${amount}!${message ? ` "${message}"` : ''}\n\nCheck your wallet: vibe wallet`
        })
      }).catch(e => console.error('DM notification failed:', e));
    }

    return res.status(200).json({
      success: true,
      tx_hash: result.tx_hash,
      status: 'confirmed',
      amount,
      fee: result.fee,
      net_to_recipient: amount - result.fee,
      message: `Tipped ${to} $${amount}!`
    });

  } catch (error) {
    console.error('[TIP] Error:', error);
    return res.status(500).json({
      error: 'Tip failed',
      details: error.message
    });
  }
};
