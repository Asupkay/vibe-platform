/**
 * Board API - Community creative board
 *
 * GET /api/board - Get board entries (paginated, filterable by category)
 *
 * Supported categories: idea, shipped, request, riff, claim, observation
 *
 * Uses Vercel KV (Redis) for persistence with in-memory fallback
 */

// Check if KV is configured
const KV_CONFIGURED = !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);

// Redis keys
const BOARD_LIST = 'board:entries';  // List of entry IDs (newest first)
const BOARD_MAX_ENTRIES = 100;       // Keep last 100 entries

// In-memory fallback
let memoryBoard = [];

// KV wrapper
async function getKV() {
  if (!KV_CONFIGURED) return null;
  try {
    const { kv } = await import('@vercel/kv');
    return kv;
  } catch (e) {
    console.error('[board] KV load error:', e.message);
    return null;
  }
}

// Valid board entry categories
const VALID_CATEGORIES = ['idea', 'shipped', 'request', 'riff', 'claim', 'observation', 'general'];

/**
 * Get board entries (paginated, filterable)
 */
async function getEntries({ limit = 20, offset = 0, category = null }) {
  const cappedLimit = Math.min(Math.max(1, limit), 50);
  const kv = await getKV();

  if (kv) {
    try {
      // Get entry IDs from list
      const endIndex = offset + cappedLimit - 1;
      const ids = await kv.lrange(BOARD_LIST, offset, endIndex);
      if (!ids || ids.length === 0) return { entries: [], total: 0 };

      // Fetch all entries
      const entries = await Promise.all(
        ids.map(id => kv.get(`board:entry:${id}`))
      );

      // Filter nulls and apply category filter
      let results = entries.filter(e => e !== null);

      if (category && category !== 'all') {
        results = results.filter(e => e.category === category);
      }

      // Get total count
      const totalCount = await kv.llen(BOARD_LIST);

      return {
        entries: results,
        total: totalCount,
        offset,
        limit: cappedLimit
      };
    } catch (e) {
      console.error('[board] KV read error:', e.message);
      // Fall back to memory
      let results = [...memoryBoard];

      if (category && category !== 'all') {
        results = results.filter(e => e.category === category);
      }

      return {
        entries: results.slice(offset, offset + cappedLimit),
        total: results.length,
        offset,
        limit: cappedLimit
      };
    }
  } else {
    let results = [...memoryBoard];

    if (category && category !== 'all') {
      results = results.filter(e => e.category === category);
    }

    return {
      entries: results.slice(offset, offset + cappedLimit),
      total: results.length,
      offset,
      limit: cappedLimit
    };
  }
}

/**
 * GET /api/board
 */
export default async function handler(req, res) {
  if (req.method === 'GET') {
    const { limit, offset, category } = req.query;

    // Validate category if provided
    if (category && !VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({
        error: 'Invalid category',
        valid_categories: VALID_CATEGORIES
      });
    }

    const result = await getEntries({
      limit: limit ? parseInt(limit) : 20,
      offset: offset ? parseInt(offset) : 0,
      category: category || null
    });

    return res.status(200).json(result);
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
