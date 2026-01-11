/**
 * GET /api/payments/history
 *
 * Paginated transaction history with cursor-based pagination
 *
 * Query params:
 * - handle: User handle (e.g., "@alice")
 * - limit: Number of transactions to return (default 50, max 100)
 * - cursor: Timestamp cursor for pagination (ISO 8601 string)
 *
 * Response:
 * {
 *   "success": true,
 *   "handle": "@alice",
 *   "transactions": [
 *     {
 *       "id": 123,
 *       "type": "tip_sent",
 *       "amount": 5,
 *       "to": "@bob",
 *       "tx_hash": "0xabc123...",
 *       "status": "confirmed",
 *       "created_at": "2026-01-10T15:30:00Z"
 *     }
 *   ],
 *   "has_more": true,
 *   "next_cursor": "2026-01-10T14:15:00Z"
 * }
 */

const { sql } = require('../lib/db');

module.exports = async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { handle, limit = '50', cursor } = req.query;

    // Validation
    if (!handle || typeof handle !== 'string') {
      return res.status(400).json({
        error: 'Missing required parameter: handle'
      });
    }

    const parsedLimit = Math.min(parseInt(limit), 100);
    const cleanHandle = handle.replace('@', '');

    // Cursor-based pagination
    let results;
    if (cursor) {
      // Query with cursor (get records older than cursor)
      results = await sql`
        SELECT
          id,
          event_type,
          wallet_address,
          amount,
          transaction_hash,
          tx_status,
          tx_confirmation_time,
          created_at,
          metadata
        FROM wallet_events
        WHERE handle = ${cleanHandle}
        AND created_at < ${cursor}
        ORDER BY created_at DESC
        LIMIT ${parsedLimit + 1}
      `;
    } else {
      // Query without cursor (get most recent)
      results = await sql`
        SELECT
          id,
          event_type,
          wallet_address,
          amount,
          transaction_hash,
          tx_status,
          tx_confirmation_time,
          created_at,
          metadata
        FROM wallet_events
        WHERE handle = ${cleanHandle}
        ORDER BY created_at DESC
        LIMIT ${parsedLimit + 1}
      `;
    }

    // Check if there are more results
    const hasMore = results.length > parsedLimit;
    const transactions = results.slice(0, parsedLimit);

    // Format transactions for response
    const formattedTransactions = transactions.map(tx => ({
      id: tx.id,
      type: tx.event_type,
      amount: tx.amount ? parseFloat(tx.amount) : null,
      to: tx.metadata?.to,
      from: tx.metadata?.from,
      message: tx.metadata?.message,
      description: tx.metadata?.description,
      tx_hash: tx.transaction_hash,
      status: tx.tx_status || 'unknown',
      created_at: tx.created_at ? new Date(tx.created_at).toISOString() : null,
      confirmed_at: tx.tx_confirmation_time ? new Date(tx.tx_confirmation_time).toISOString() : null
    }));

    return res.status(200).json({
      success: true,
      handle,
      transactions: formattedTransactions,
      has_more: hasMore,
      next_cursor: hasMore && transactions.length > 0
        ? new Date(transactions[transactions.length - 1].created_at).toISOString()
        : null
    });

  } catch (error) {
    console.error('[HISTORY] Error:', error);
    return res.status(500).json({
      error: 'Failed to fetch transaction history',
      details: error.message
    });
  }
};
