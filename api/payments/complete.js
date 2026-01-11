/**
 * POST /api/payments/complete
 *
 * Release escrow funds to expert (waits for confirmation)
 *
 * Request:
 * {
 *   "escrow_id": "0x1234abcd...",
 *   "from": "@alice"
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "tx_hash": "0xghi789...",
 *   "status": "confirmed",
 *   "amount_released": 48.75
 * }
 */

const { getDispatcher } = require('../../lib/cdp/contract-dispatcher');
const { sql } = require('../lib/db');

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
    const { escrow_id, from } = req.body;

    // Validation
    if (!escrow_id || !from) {
      return res.status(400).json({
        error: 'Missing required fields: escrow_id, from'
      });
    }

    // Auth check
    const auth = requireAuth(req, from);
    if (!auth.authenticated) {
      return res.status(401).json({ error: auth.error });
    }

    // Verify escrow exists and belongs to user
    const escrowRecord = await sql`
      SELECT * FROM wallet_events
      WHERE metadata->>'escrowId' = ${escrow_id}
      AND handle = ${from.replace('@', '')}
      AND event_type = 'escrow_created'
    `;

    if (escrowRecord.length === 0) {
      return res.status(404).json({
        error: 'Escrow not found or you are not the creator'
      });
    }

    const metadata = escrowRecord[0].metadata;

    // Check if already completed
    if (metadata.completed) {
      return res.status(400).json({
        error: 'Escrow already completed'
      });
    }

    // Get wallet data
    const { kv } = await import('@vercel/kv');
    const fromWalletData = await kv.get(`wallet:${from.replace('@', '')}`);
    if (!fromWalletData) {
      return res.status(500).json({ error: 'Wallet data not found' });
    }

    // Call dispatcher (WAITS for confirmation)
    const dispatcher = getDispatcher();
    const result = await dispatcher.completeEscrow({
      escrowId: escrow_id,
      askerHandle: from,
      askerWalletData: fromWalletData
    });

    // Update status to confirmed
    await sql`
      UPDATE wallet_events
      SET tx_status = 'confirmed',
          tx_confirmation_time = NOW(),
          metadata = jsonb_set(metadata, '{completed}', 'true')
      WHERE metadata->>'escrowId' = ${escrow_id}
      AND event_type = 'escrow_created'
    `;

    // Log completion event for recipient
    await sql`
      INSERT INTO wallet_events (
        handle,
        event_type,
        amount,
        transaction_hash,
        tx_status,
        tx_confirmation_time,
        metadata
      ) VALUES (
        ${metadata.to},
        'escrow_completed',
        ${result.amountReleased},
        ${result.tx_hash},
        'confirmed',
        NOW(),
        ${JSON.stringify({
          from: from.replace('@', ''),
          escrowId: escrow_id,
          fee: result.fee
        })}
      )
    `;

    // Notify expert
    const vercelUrl = process.env.VERCEL_URL || process.env.NEXT_PUBLIC_VERCEL_URL;
    if (vercelUrl) {
      fetch(`https://${vercelUrl}/api/messages/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'system',
          to: `@${metadata.to}`,
          text: `✅ Escrow completed!\n\nYou received $${result.amountReleased} from ${from}\n\nCheck: vibe wallet`
        })
      }).catch(console.error);
    }

    return res.status(200).json({
      success: true,
      tx_hash: result.tx_hash,
      status: 'confirmed',
      amount_released: result.amountReleased,
      message: `Funds released to @${metadata.to}`
    });

  } catch (error) {
    console.error('[COMPLETE] Error:', error);
    return res.status(500).json({
      error: 'Escrow completion failed',
      details: error.message
    });
  }
};
