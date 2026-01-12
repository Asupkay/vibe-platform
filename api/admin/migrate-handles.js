/**
 * Admin: Migrate Legacy Users to Handle Registry
 *
 * POST /api/admin/migrate-handles
 *
 * Migrates users from legacy user:* keys to vibe:handles hash.
 * This is a one-time migration for users who registered before
 * the handle claiming system was integrated.
 *
 * Requires admin secret in Authorization header.
 */

import { kv } from '@vercel/kv';
import { claimHandle, getHandleRecord, normalizeHandle } from '../lib/handles.js';

const ADMIN_SECRET = process.env.VIBE_ADMIN_SECRET || 'admin-secret-change-me';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Check admin auth
  const authHeader = req.headers.authorization;
  if (!authHeader || authHeader !== `Bearer ${ADMIN_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { dryRun = true } = req.body || {};

  try {
    // Get all legacy user:* keys
    const userKeys = await kv.keys('user:*');

    const results = {
      total: userKeys.length,
      alreadyMigrated: 0,
      migrated: 0,
      failed: [],
      dryRun
    };

    for (const key of userKeys) {
      const username = key.replace('user:', '');
      const normalized = normalizeHandle(username);

      // Check if already in handles registry
      const existingHandle = await getHandleRecord(kv, normalized);

      if (existingHandle) {
        results.alreadyMigrated++;
        continue;
      }

      // Get legacy user data
      const userData = await kv.hgetall(key);

      if (!dryRun) {
        // Claim handle in proper registry
        const claimResult = await claimHandle(kv, normalized, {
          one_liner: userData?.building || 'Migrated from legacy system',
          migrated_from_legacy: true,
          legacy_created_at: userData?.createdAt || null
        });

        if (claimResult.success) {
          results.migrated++;
        } else {
          results.failed.push({
            handle: normalized,
            error: claimResult.error,
            message: claimResult.message
          });
        }
      } else {
        // Dry run - just count what would be migrated
        results.migrated++;
      }
    }

    // Get final stats
    const handleCount = await kv.hlen('vibe:handles');

    return res.status(200).json({
      success: true,
      results,
      currentHandleCount: handleCount,
      genesisRemaining: 100 - handleCount
    });

  } catch (e) {
    return res.status(500).json({
      success: false,
      error: e.message
    });
  }
}
