/**
 * POST /api/share-page
 *
 * Create a shareable web page that lives at /shared/:slug
 * Stores in KV (simple, no Postgres dependency for now)
 */

const { kv } = require('@vercel/kv');

function generateSlug() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function sanitizeSlug(input) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

module.exports = async function handler(req, res) {
  // CORS
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
    const {
      from,
      to,
      title,
      content,
      contentType = 'html', // 'html' or 'markdown'
      slug,
      expiresInDays,
      unlisted = false,
      sendDM = false // Disabled for now
    } = req.body;

    // Validation
    if (!from) {
      return res.status(400).json({ error: 'from (username) required' });
    }

    if (!title || !content) {
      return res.status(400).json({ error: 'title and content required' });
    }

    // Generate or sanitize slug
    const finalSlug = slug ? sanitizeSlug(slug) : generateSlug();

    // Calculate expiration
    const expiresAt = expiresInDays
      ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
      : null;

    const pageData = {
      slug: finalSlug,
      from: from.toLowerCase().replace('@', ''),
      to: to ? to.toLowerCase().replace('@', '') : null,
      title,
      content,
      contentType,
      unlisted,
      expiresAt,
      createdAt: new Date().toISOString()
    };

    // Store in KV
    try {
      await kv.set(`shared:${finalSlug}`, JSON.stringify(pageData), {
        ex: expiresInDays ? expiresInDays * 86400 : undefined
      });
    } catch (kvErr) {
      console.error('[SHARE-PAGE] KV failed:', kvErr);
      return res.status(503).json({ error: 'Storage unavailable', details: kvErr.message });
    }

    const url = `https://slashvibe.dev/shared/${finalSlug}`;

    return res.status(200).json({
      success: true,
      slug: finalSlug,
      url,
      expiresAt,
      message: 'Page created'
    });

  } catch (error) {
    console.error('[SHARE-PAGE] Error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
};
