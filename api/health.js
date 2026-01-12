/**
 * Health Check API
 *
 * Comprehensive health check for all vibe-platform services.
 * Use for monitoring and alerting.
 *
 * GET /api/health - Quick health check
 * GET /api/health?full=true - Detailed health with all services
 */

import { kv } from '@vercel/kv';
import { getSQL, isPostgresEnabled } from '../lib/db.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

  const startTime = Date.now();
  const full = req.query.full === 'true';

  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '0.3.0',
    checks: {}
  };

  // Quick KV check
  try {
    await kv.ping();
    health.checks.kv = { status: 'healthy', latency: Date.now() - startTime };
  } catch (e) {
    health.checks.kv = { status: 'unhealthy', error: e.message };
    health.status = 'degraded';
  }

  if (full) {
    // Detailed checks
    const checkStart = Date.now();

    // Check presence data
    try {
      const keys = await kv.keys('presence:*');
      health.checks.presence = {
        status: 'healthy',
        activeUsers: keys.length,
        latency: Date.now() - checkStart
      };
    } catch (e) {
      health.checks.presence = { status: 'unhealthy', error: e.message };
    }

    // Check messages
    try {
      const msgCheck = Date.now();
      const stats = await kv.get('stats:messages') || 0;
      health.checks.messages = {
        status: 'healthy',
        totalMessages: stats,
        latency: Date.now() - msgCheck
      };
    } catch (e) {
      health.checks.messages = { status: 'unhealthy', error: e.message };
    }

    // Check board
    try {
      const boardCheck = Date.now();
      const entries = await kv.lrange('board:entries', 0, 0);
      health.checks.board = {
        status: 'healthy',
        hasEntries: entries && entries.length > 0,
        latency: Date.now() - boardCheck
      };
    } catch (e) {
      health.checks.board = { status: 'unhealthy', error: e.message };
    }

    // Check Postgres if configured
    if (isPostgresEnabled()) {
      try {
        const pgCheck = Date.now();
        const sql = getSQL();
        await sql`SELECT 1`;
        health.checks.postgres = {
          status: 'healthy',
          latency: Date.now() - pgCheck
        };
      } catch (e) {
        health.checks.postgres = { status: 'unhealthy', error: e.message };
        // Postgres is optional, don't degrade overall status
      }
    } else {
      health.checks.postgres = { status: 'not_configured' };
    }

    // Get user stats from vibe:handles (the canonical source)
    try {
      // Primary: vibe:handles hash (proper handle registry)
      const handleCount = await kv.hlen('vibe:handles');
      // Legacy: user:* keys (old system, for reference)
      const legacyUsers = await kv.keys('user:*');
      const tips = await kv.llen('tips:global') || 0;

      health.stats = {
        registeredHandles: handleCount,
        legacyUsers: legacyUsers.length,
        totalTips: tips,
        genesisRemaining: 100 - handleCount,
        note: handleCount < legacyUsers.length
          ? 'Migration needed: some legacy users not in handles registry'
          : null
      };
    } catch (e) {
      health.stats = { error: e.message };
    }
  }

  health.responseTime = Date.now() - startTime;

  // Set appropriate status code
  const statusCode = health.status === 'healthy' ? 200 :
                     health.status === 'degraded' ? 200 : 503;

  return res.status(statusCode).json(health);
}
