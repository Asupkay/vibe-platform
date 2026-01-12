/**
 * Onboarding Welcome Flow
 *
 * POST /api/onboarding/welcome
 * Body: { handle, invitedBy? }
 *
 * Sends a welcome DM to new users with:
 * - Friendly greeting
 * - Quick start tips
 * - Who's online to connect with
 */

import { kv } from '@vercel/kv';

// The friendly greeter handle
const WELCOME_FROM = 'vibe';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { handle, invitedBy, genesisNumber } = req.body || {};

    if (!handle) {
      return res.status(400).json({ error: 'Missing required field: handle' });
    }

    const normalizedHandle = handle.toLowerCase().trim();

    // Get some online users to suggest connections
    const presenceData = await kv.hgetall('vibe:presence') || {};
    const onlineUsers = Object.entries(presenceData)
      .filter(([h, data]) => {
        if (h === normalizedHandle || h === WELCOME_FROM || h === 'solienne') return false;
        const parsed = typeof data === 'string' ? JSON.parse(data) : data;
        const lastSeen = new Date(parsed.lastSeen || 0).getTime();
        return Date.now() - lastSeen < 60 * 60 * 1000; // Active in last hour
      })
      .slice(0, 3)
      .map(([h]) => `@${h}`);

    // Build personalized welcome message
    let welcomeText = `Welcome to /vibe, @${normalizedHandle}! `;

    if (genesisNumber) {
      welcomeText += `You're Genesis #${genesisNumber}. `;
    }

    if (invitedBy) {
      welcomeText += `Thanks to @${invitedBy} for the invite.\n\n`;
    } else {
      welcomeText += '\n\n';
    }

    welcomeText += `Quick start:\n`;
    welcomeText += `• Post your first ship to /board (share what you're building)\n`;
    welcomeText += `• Say hi to someone online\n`;
    welcomeText += `• Build something cool and share the link\n\n`;

    if (onlineUsers.length > 0) {
      welcomeText += `Currently online: ${onlineUsers.join(', ')}\n\n`;
    }

    welcomeText += `Type "vibe help" anytime for commands. Happy building!`;

    // Send as a DM from the vibe system account
    const messageId = `msg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const message = {
      id: messageId,
      from: WELCOME_FROM,
      to: normalizedHandle,
      text: welcomeText,
      createdAt: new Date().toISOString(),
      read: false,
      type: 'welcome'
    };

    // Store in recipient's inbox
    const inboxKey = `inbox:${normalizedHandle}`;
    await kv.lpush(inboxKey, JSON.stringify(message));
    await kv.ltrim(inboxKey, 0, 999); // Keep last 1000 messages

    // Also track that this user received welcome
    await kv.hset(`onboarding:${normalizedHandle}`, {
      welcomeSentAt: new Date().toISOString(),
      invitedBy: invitedBy || null,
      genesisNumber: genesisNumber || null
    });

    return res.status(200).json({
      success: true,
      messageId,
      message: 'Welcome message sent'
    });

  } catch (error) {
    console.error('[onboarding/welcome] Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to send welcome message'
    });
  }
}

/**
 * Helper to call welcome from other API endpoints
 * @param {string} handle - New user's handle
 * @param {string} invitedBy - Who invited them (optional)
 * @param {number} genesisNumber - Their genesis number (optional)
 */
export async function sendWelcome(handle, invitedBy = null, genesisNumber = null) {
  try {
    const normalizedHandle = handle.toLowerCase().trim();

    // Check if already welcomed
    const onboarding = await kv.hgetall(`onboarding:${normalizedHandle}`);
    if (onboarding?.welcomeSentAt) {
      return { success: true, alreadyWelcomed: true };
    }

    // Get some online users
    const presenceData = await kv.hgetall('vibe:presence') || {};
    const onlineUsers = Object.entries(presenceData)
      .filter(([h, data]) => {
        if (h === normalizedHandle || h === 'vibe' || h === 'solienne') return false;
        const parsed = typeof data === 'string' ? JSON.parse(data) : data;
        const lastSeen = new Date(parsed.lastSeen || 0).getTime();
        return Date.now() - lastSeen < 60 * 60 * 1000;
      })
      .slice(0, 3)
      .map(([h]) => `@${h}`);

    let welcomeText = `Welcome to /vibe, @${normalizedHandle}! `;

    if (genesisNumber) {
      welcomeText += `You're Genesis #${genesisNumber}. `;
    }

    if (invitedBy) {
      welcomeText += `Thanks to @${invitedBy} for the invite.\n\n`;
    } else {
      welcomeText += '\n\n';
    }

    welcomeText += `Quick start:\n`;
    welcomeText += `• Post your first ship (share what you're building)\n`;
    welcomeText += `• Say hi to someone online\n`;
    welcomeText += `• Build something cool and share the link\n\n`;

    if (onlineUsers.length > 0) {
      welcomeText += `Currently online: ${onlineUsers.join(', ')}\n\n`;
    }

    welcomeText += `Type "vibe help" anytime. Happy building!`;

    const messageId = `msg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const message = {
      id: messageId,
      from: 'vibe',
      to: normalizedHandle,
      text: welcomeText,
      createdAt: new Date().toISOString(),
      read: false,
      type: 'welcome'
    };

    const inboxKey = `inbox:${normalizedHandle}`;
    await kv.lpush(inboxKey, JSON.stringify(message));
    await kv.ltrim(inboxKey, 0, 999);

    await kv.hset(`onboarding:${normalizedHandle}`, {
      welcomeSentAt: new Date().toISOString(),
      invitedBy: invitedBy || null,
      genesisNumber: genesisNumber || null
    });

    return { success: true, messageId };
  } catch (error) {
    console.error('[sendWelcome] Error:', error);
    return { success: false, error: error.message };
  }
}
