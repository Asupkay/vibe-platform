/**
 * POST /api/agents/wallet/session-key
 *
 * Generate or revoke session keys for autonomous spending
 *
 * Actions:
 * - generate: Create new session key with expiration
 * - revoke: Invalidate existing session key
 * - refresh: Extend expiration of existing key
 *
 * Request (generate):
 * {
 *   "agent_handle": "@vibebot",
 *   "action": "generate",
 *   "expires_in_hours": 24,
 *   "daily_budget": 10
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "session_key": "sk_...",
 *   "expires_at": "2026-01-11T14:30:00Z",
 *   "daily_budget": 10
 * }
 */

const { sql } = require('../../lib/db');
const crypto = require('crypto');

// Generate secure session key
function generateSessionKey() {
  // sk_[32 random bytes as hex]
  return 'sk_' + crypto.randomBytes(32).toString('hex');
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
      action,
      expires_in_hours = 24,
      daily_budget
    } = req.body;

    // Validation
    if (!agent_handle || !action) {
      return res.status(400).json({
        error: 'Missing required fields: agent_handle, action'
      });
    }

    const validActions = ['generate', 'revoke', 'refresh'];
    if (!validActions.includes(action)) {
      return res.status(400).json({
        error: `Invalid action. Must be one of: ${validActions.join(', ')}`
      });
    }

    const cleanHandle = agent_handle.replace('@', '');

    // Get treasury
    const treasury = await sql`
      SELECT * FROM agent_treasuries
      WHERE agent_handle = ${cleanHandle}
    `;

    if (treasury.length === 0) {
      return res.status(404).json({
        error: 'Agent treasury not found'
      });
    }

    const t = treasury[0];

    // Handle different actions
    switch (action) {
      case 'generate': {
        // Generate new session key
        const sessionKey = generateSessionKey();
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + expires_in_hours);

        // Update treasury with new session key
        const updated = await sql`
          UPDATE agent_treasuries
          SET
            session_key = ${sessionKey},
            session_key_expires_at = ${expiresAt.toISOString()},
            ${daily_budget ? sql`daily_budget = ${daily_budget},` : sql``}
            updated_at = NOW()
          WHERE agent_handle = ${cleanHandle}
          RETURNING *
        `;

        console.log(`[SessionKey] Generated for ${agent_handle}, expires in ${expires_in_hours}h`);

        return res.status(200).json({
          success: true,
          action: 'generate',
          session_key: sessionKey,
          expires_at: expiresAt.toISOString(),
          expires_in_hours,
          daily_budget: parseFloat(daily_budget || updated[0].daily_budget)
        });
      }

      case 'revoke': {
        // Revoke existing session key
        await sql`
          UPDATE agent_treasuries
          SET
            session_key = NULL,
            session_key_expires_at = NULL,
            updated_at = NOW()
          WHERE agent_handle = ${cleanHandle}
        `;

        console.log(`[SessionKey] Revoked for ${agent_handle}`);

        return res.status(200).json({
          success: true,
          action: 'revoke',
          message: 'Session key revoked'
        });
      }

      case 'refresh': {
        // Extend expiration of existing key
        if (!t.session_key) {
          return res.status(400).json({
            error: 'No active session key to refresh'
          });
        }

        const newExpiresAt = new Date();
        newExpiresAt.setHours(newExpiresAt.getHours() + expires_in_hours);

        await sql`
          UPDATE agent_treasuries
          SET
            session_key_expires_at = ${newExpiresAt.toISOString()},
            updated_at = NOW()
          WHERE agent_handle = ${cleanHandle}
        `;

        console.log(`[SessionKey] Refreshed for ${agent_handle}, new expiration: ${newExpiresAt}`);

        return res.status(200).json({
          success: true,
          action: 'refresh',
          expires_at: newExpiresAt.toISOString(),
          expires_in_hours
        });
      }
    }

  } catch (error) {
    console.error('[SessionKey] Error:', error);
    return res.status(500).json({
      error: 'Failed to manage session key',
      details: error.message
    });
  }
};
