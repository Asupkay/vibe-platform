/**
 * POST /api/payments/escrow
 *
 * Create escrow for services (larger amounts, returns pending immediately)
 *
 * Request:
 * {
 *   "from": "@alice",
 *   "to": "@bob",
 *   "amount": 50,
 *   "description": "WebSocket debugging help",
 *   "timeout_hours": 48
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "escrow_id": "0x1234abcd...",
 *   "tx_hash": "0xdef456...",
 *   "status": "pending",
 *   "amount": 50,
 *   "timeout": "2026-01-12T14:30:00Z"
 * }
 */

const { getDispatcher } = require('../../lib/cdp/contract-dispatcher');
const { sql } = require('../lib/db');
const { ethers } = require('ethers');

// Helper functions (same as tip.js - should be extracted to shared lib)
async function ensureWallet(handle, context) {
  const cleanHandle = handle.replace('@', '');
  const result = await sql`
    SELECT wallet_address FROM users WHERE username = ${cleanHandle}
  `;
  if (result.length === 0 || !result[0].wallet_address) {
    throw new Error(`No wallet for ${handle}`);
  }
  return result[0].wallet_address;
}

async function getBalance(handle) {
  return 1000; // Placeholder
}

function requireAuth(req, handle) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return { authenticated: false, error: 'Missing Authorization header' };
  }
  return { authenticated: true };
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
    const { from, to, amount, description, timeout_hours = 48 } = req.body;

    // Validation
    if (!from || !to || !amount || !description) {
      return res.status(400).json({
        error: 'Missing required fields: from, to, amount, description'
      });
    }

    if (amount < 5 || amount > 10000) {
      return res.status(400).json({
        error: 'Amount must be between $5 and $10,000'
      });
    }

    // Auth
    const auth = requireAuth(req, from);
    if (!auth.authenticated) {
      return res.status(401).json({ error: auth.error });
    }

    // Ensure wallets
    const fromWallet = await ensureWallet(from, 'escrow_payment');
    const toWallet = await ensureWallet(to, 'escrow_receive');

    // Check balance
    const balance = await getBalance(from);
    if (balance < amount) {
      return res.status(400).json({
        error: 'Insufficient balance',
        balance: `$${balance.toFixed(2)}`,
        needed: `$${amount.toFixed(2)}`
      });
    }

    // Generate escrow ID (unique hash based on participants + timestamp)
    const escrowId = ethers.id(from + to + Date.now().toString());

    // Get wallet data
    const { kv } = await import('@vercel/kv');
    const fromWalletData = await kv.get(`wallet:${from.replace('@', '')}`);
    if (!fromWalletData) {
      return res.status(500).json({ error: 'Wallet data not found' });
    }

    // Call dispatcher (DOES NOT WAIT)
    const dispatcher = getDispatcher();
    const result = await dispatcher.createEscrow({
      from,
      to,
      amount,
      description,
      escrowId,
      timeoutHours: timeout_hours,
      fromWalletData: fromWalletData,
      toAddress: toWallet
    });

    // Calculate expiry
    const expiresAt = new Date(Date.now() + timeout_hours * 3600 * 1000);

    // Log to database (status: pending)
    await sql`
      INSERT INTO wallet_events (
        handle,
        event_type,
        wallet_address,
        amount,
        transaction_hash,
        tx_status,
        metadata
      ) VALUES (
        ${from.replace('@', '')},
        'escrow_created',
        ${fromWallet},
        ${amount},
        ${result.tx_hash},
        'pending',
        ${JSON.stringify({
          to: to.replace('@', ''),
          description,
          escrowId,
          timeoutHours: timeout_hours,
          expiresAt: expiresAt.toISOString(),
          contract: 'VibeEscrow'
        })}
      )
    `;

    // Notify expert (async)
    const vercelUrl = process.env.VERCEL_URL || process.env.NEXT_PUBLIC_VERCEL_URL;
    if (vercelUrl) {
      fetch(`https://${vercelUrl}/api/messages/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'system',
          to,
          text: `💼 New Escrow from ${from}\n\nAmount: $${amount}\nTask: ${description}\n\nYou have ${timeout_hours} hours to complete.\nApproval releases funds.`
        })
      }).catch(console.error);
    }

    return res.status(200).json({
      success: true,
      escrow_id: escrowId,
      tx_hash: result.tx_hash,
      status: 'pending',
      amount,
      timeout: expiresAt.toISOString(),
      message: `Escrow created. ${to} has ${timeout_hours} hours to deliver.`
    });

  } catch (error) {
    console.error('[ESCROW] Error:', error);
    return res.status(500).json({
      error: 'Escrow creation failed',
      details: error.message
    });
  }
};
