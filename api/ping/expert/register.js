/**
 * POST /api/ping/expert/register
 *
 * Register as an expert in the ping.money marketplace
 *
 * Request:
 * {
 *   "handle": "@alice",
 *   "bio": "Blockchain developer with 5 years experience",
 *   "skills": ["solidity", "ethers.js", "smart contracts"],
 *   "hourly_rate": 150,
 *   "min_escrow": 25,
 *   "availability": "available"
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "expert_handle": "@alice",
 *   "skills": [...],
 *   "tier": "bronze"
 * }
 */

const { sql } = require('../../lib/db');

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
      handle,
      bio,
      skills = [],
      hourly_rate,
      min_escrow = 5,
      availability = 'available'
    } = req.body;

    // Validation
    if (!handle) {
      return res.status(400).json({
        error: 'Missing required field: handle'
      });
    }

    if (!skills || skills.length === 0) {
      return res.status(400).json({
        error: 'Must provide at least one skill'
      });
    }

    const cleanHandle = handle.replace('@', '');

    // Get user's wallet address
    const user = await sql`
      SELECT wallet_address FROM users
      WHERE username = ${cleanHandle}
    `;

    if (user.length === 0) {
      return res.status(404).json({
        error: 'User not found. Create account first.'
      });
    }

    const walletAddress = user[0].wallet_address;

    if (!walletAddress) {
      return res.status(400).json({
        error: 'No wallet found. Create wallet first.'
      });
    }

    // Check if already registered
    const existing = await sql`
      SELECT * FROM expert_profiles
      WHERE handle = ${cleanHandle}
    `;

    if (existing.length > 0) {
      // Update existing profile
      const updated = await sql`
        UPDATE expert_profiles
        SET
          bio = ${bio || existing[0].bio},
          skills = ${JSON.stringify(skills)},
          hourly_rate = ${hourly_rate || existing[0].hourly_rate},
          min_escrow = ${min_escrow},
          availability = ${availability},
          updated_at = NOW()
        WHERE handle = ${cleanHandle}
        RETURNING *
      `;

      return res.status(200).json({
        success: true,
        action: 'updated',
        expert_handle: `@${cleanHandle}`,
        bio: updated[0].bio,
        skills: updated[0].skills,
        hourly_rate: updated[0].hourly_rate ? parseFloat(updated[0].hourly_rate) : null,
        min_escrow: parseFloat(updated[0].min_escrow),
        availability: updated[0].availability,
        tier: updated[0].tier,
        rating: parseFloat(updated[0].rating_avg || 0),
        total_sessions: updated[0].total_sessions
      });
    }

    // Create new expert profile
    const profile = await sql`
      INSERT INTO expert_profiles (
        handle,
        wallet_address,
        bio,
        skills,
        hourly_rate,
        min_escrow,
        availability
      ) VALUES (
        ${cleanHandle},
        ${walletAddress},
        ${bio || null},
        ${JSON.stringify(skills)},
        ${hourly_rate || null},
        ${min_escrow},
        ${availability}
      )
      RETURNING *
    `;

    console.log(`[ExpertRegistry] ${handle} registered with skills: ${skills.join(', ')}`);

    return res.status(200).json({
      success: true,
      action: 'created',
      expert_handle: `@${cleanHandle}`,
      bio: profile[0].bio,
      skills: profile[0].skills,
      hourly_rate: profile[0].hourly_rate ? parseFloat(profile[0].hourly_rate) : null,
      min_escrow: parseFloat(profile[0].min_escrow),
      availability: profile[0].availability,
      tier: profile[0].tier,
      created_at: new Date(profile[0].created_at).toISOString()
    });

  } catch (error) {
    console.error('[ExpertRegistry] Error:', error);
    return res.status(500).json({
      error: 'Failed to register expert',
      details: error.message
    });
  }
};
