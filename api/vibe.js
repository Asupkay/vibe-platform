/**
 * Vibecodings Vibe API
 *
 * POST /api/vibe - Submit a vibe (session summary)
 * GET /api/vibe - Get recent vibes (feed)
 *
 * MVP: Uses in-memory storage + JSON file fallback
 * TODO: Wire up Vercel Postgres when ready
 */

const fs = require('fs');
const path = require('path');

// In-memory store (resets on cold start, but fine for MVP)
let vibesCache = null;

function loadVibes() {
  if (vibesCache) return vibesCache;

  try {
    const vibesPath = path.join(process.cwd(), 'data/vibes.json');
    if (fs.existsSync(vibesPath)) {
      vibesCache = JSON.parse(fs.readFileSync(vibesPath, 'utf8'));
    } else {
      vibesCache = { vibes: [], lastUpdated: new Date().toISOString() };
    }
  } catch (e) {
    vibesCache = { vibes: [], lastUpdated: new Date().toISOString() };
  }

  return vibesCache;
}

function generateId() {
  return Math.random().toString(36).substring(2, 10);
}

function detectCategory(summary, sessionData = {}) {
  const text = (summary + ' ' + JSON.stringify(sessionData)).toLowerCase();

  if (text.includes('agent') || text.includes('ai ') || text.includes('claude')) return 'agents';
  if (text.includes('dashboard') || text.includes('app') || text.includes('portal')) return 'platform';
  if (text.includes('art') || text.includes('visual') || text.includes('generative')) return 'art';
  if (text.includes('cli') || text.includes('tool') || text.includes('utility')) return 'tools';
  if (text.includes('api') || text.includes('database') || text.includes('config')) return 'infrastructure';

  return 'platform'; // default
}

function calculateDNA(vibes) {
  const dna = {
    interests: {},
    patterns: [],
    totalVibes: vibes.length,
    recentActivity: vibes.slice(-10).map(v => ({
      category: v.category,
      date: v.createdAt
    }))
  };

  // Calculate interest weights (recent = more weight)
  vibes.forEach((vibe, index) => {
    const recencyWeight = (index + 1) / vibes.length; // newer = higher weight
    const category = vibe.category;
    dna.interests[category] = (dna.interests[category] || 0) + recencyWeight;
  });

  // Normalize to 0-1
  const maxInterest = Math.max(...Object.values(dna.interests), 1);
  Object.keys(dna.interests).forEach(k => {
    dna.interests[k] = Math.round((dna.interests[k] / maxInterest) * 100) / 100;
  });

  return dna;
}

module.exports = async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const data = loadVibes();

  // GET: Return recent vibes (feed)
  if (req.method === 'GET') {
    const { user, limit = 20, include_expired = false } = req.query;

    let vibes = [...data.vibes];

    // Filter by user if specified
    if (user) {
      vibes = vibes.filter(v => v.user === user);
    }

    // Filter expired ephemeral vibes
    if (!include_expired) {
      const now = new Date();
      vibes = vibes.filter(v => {
        if (!v.expiresAt) return true; // permanent
        return new Date(v.expiresAt) > now;
      });
    }

    // Sort by recency
    vibes.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // Limit
    vibes = vibes.slice(0, parseInt(limit));

    // Calculate DNA for user if specified
    let dna = null;
    if (user) {
      const userVibes = data.vibes.filter(v => v.user === user);
      dna = calculateDNA(userVibes);
    }

    return res.status(200).json({
      success: true,
      vibes,
      dna,
      meta: {
        total: data.vibes.length,
        returned: vibes.length
      }
    });
  }

  // POST: Submit a new vibe
  if (req.method === 'POST') {
    try {
      const {
        user = 'anonymous',
        summary,
        url,
        category,
        sessionData = {},
        ephemeral = true,
        expiresInDays = 7
      } = req.body;

      if (!summary) {
        return res.status(400).json({
          success: false,
          error: 'Summary is required'
        });
      }

      const now = new Date();
      const vibe = {
        id: generateId(),
        user,
        summary,
        url: url || null,
        category: category || detectCategory(summary, sessionData),
        sessionData,
        ephemeral,
        expiresAt: ephemeral ? new Date(now.getTime() + expiresInDays * 24 * 60 * 60 * 1000).toISOString() : null,
        createdAt: now.toISOString(),
        likes: 0,
        clones: 0
      };

      // Add to cache (in production, this would go to Postgres)
      data.vibes.push(vibe);
      data.lastUpdated = now.toISOString();

      // Calculate updated DNA
      const userVibes = data.vibes.filter(v => v.user === user);
      const dna = calculateDNA(userVibes);

      return res.status(201).json({
        success: true,
        vibe,
        dna,
        message: ephemeral
          ? `Vibe shared! Fades in ${expiresInDays} days.`
          : 'Vibe shipped! Permanent.'
      });

    } catch (error) {
      console.error('Vibe API error:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to create vibe'
      });
    }
  }

  return res.status(405).json({
    success: false,
    error: 'Method not allowed'
  });
};
