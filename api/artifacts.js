/**
 * POST /api/artifacts - Create artifact
 * GET /api/artifacts?scope=mine|for-me|network - List artifacts
 *
 * Staged migration: KV → Postgres
 * - ARTIFACTS_DUAL_WRITE=true → Write to both KV and Postgres
 * - ARTIFACTS_READ_FROM_PG=true → Read from Postgres (fallback to KV)
 */

import crypto from 'crypto';
import { getSQL, isPostgresEnabled } from '../lib/db.js';

const { kv } = await import('@vercel/kv');

// Feature flags
const DUAL_WRITE = process.env.ARTIFACTS_DUAL_WRITE === 'true';
const READ_FROM_PG = process.env.ARTIFACTS_READ_FROM_PG === 'true';

// KV keys
const ARTIFACTS_KEY = 'artifacts:all';
const ARTIFACT_PREFIX = 'artifact:';

function generateArtifactId() {
  return `artifact_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
}

function generateSlug(title) {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 60);
  const suffix = crypto.randomBytes(3).toString('hex');
  return `${base}-${suffix}`;
}

// ============ POSTGRES OPERATIONS ============

async function writeToPostgres(artifact) {
  if (!isPostgresEnabled()) {
    return { success: false, error: 'Postgres not configured' };
  }

  try {
    const sql = getSQL();

    await sql`
      INSERT INTO artifacts (
        id, slug, title, template, content,
        created_by, created_for, thread_id,
        visibility, audience, provenance,
        created_at, updated_at, expires_at,
        revision, forked_from
      ) VALUES (
        ${artifact.id},
        ${artifact.slug},
        ${artifact.title},
        ${artifact.template},
        ${JSON.stringify(artifact.content)},
        ${artifact.created_by},
        ${artifact.created_for},
        ${artifact.thread_id},
        ${artifact.visibility},
        ${artifact.audience},
        ${JSON.stringify(artifact.provenance)},
        ${artifact.created_at},
        ${artifact.updated_at},
        ${artifact.expires_at},
        ${artifact.revision},
        ${artifact.forked_from}
      )
    `;

    return { success: true };
  } catch (error) {
    console.error('[ARTIFACTS] Postgres write failed:', error.message);
    return { success: false, error: error.message };
  }
}

async function readFromPostgres(scope, handle, limit) {
  if (!isPostgresEnabled()) {
    return { success: false, error: 'Postgres not configured' };
  }

  try {
    const sql = getSQL();
    let rows;

    if (scope === 'mine') {
      rows = await sql`
        SELECT * FROM artifacts
        WHERE created_by = ${handle}
        ORDER BY created_at DESC
        LIMIT ${limit}
      `;
    } else if (scope === 'for-me') {
      rows = await sql`
        SELECT * FROM artifacts
        WHERE created_for = ${handle}
        ORDER BY created_at DESC
        LIMIT ${limit}
      `;
    } else if (scope === 'network') {
      rows = await sql`
        SELECT * FROM artifacts
        WHERE visibility IN ('public', 'network')
           OR created_by = ${handle}
           OR created_for = ${handle}
           OR ${handle} = ANY(audience)
        ORDER BY created_at DESC
        LIMIT ${limit}
      `;
    }

    // Parse JSON fields back to objects
    const artifacts = rows.map(row => ({
      ...row,
      content: typeof row.content === 'string' ? JSON.parse(row.content) : row.content,
      provenance: typeof row.provenance === 'string' ? JSON.parse(row.provenance) : row.provenance,
      audience: row.audience || []
    }));

    return { success: true, artifacts, total: artifacts.length };
  } catch (error) {
    console.error('[ARTIFACTS] Postgres read failed:', error.message);
    return { success: false, error: error.message };
  }
}

async function getArtifactBySlugFromPostgres(slug) {
  if (!isPostgresEnabled()) {
    return null;
  }

  try {
    const sql = getSQL();
    const rows = await sql`
      SELECT * FROM artifacts
      WHERE slug = ${slug}
      LIMIT 1
    `;

    if (rows.length === 0) return null;

    const row = rows[0];
    return {
      ...row,
      content: typeof row.content === 'string' ? JSON.parse(row.content) : row.content,
      provenance: typeof row.provenance === 'string' ? JSON.parse(row.provenance) : row.provenance,
      audience: row.audience || []
    };
  } catch (error) {
    console.error('[ARTIFACTS] Postgres slug lookup failed:', error.message);
    return null;
  }
}

// ============ KV OPERATIONS ============

async function writeToKV(artifact) {
  if (!kv) {
    return { success: false, error: 'KV not configured' };
  }

  try {
    await kv.set(`${ARTIFACT_PREFIX}${artifact.id}`, artifact);
    await kv.sadd(ARTIFACTS_KEY, artifact.id);

    if (artifact.expires_at) {
      const expiryTimestamp = Math.floor(new Date(artifact.expires_at).getTime() / 1000);
      const now = Math.floor(Date.now() / 1000);
      const ttl = expiryTimestamp - now;
      if (ttl > 0) {
        await kv.expireat(`${ARTIFACT_PREFIX}${artifact.id}`, expiryTimestamp);
      }
    }

    return { success: true };
  } catch (error) {
    console.error('[ARTIFACTS] KV write failed:', error.message);
    return { success: false, error: error.message };
  }
}

async function readFromKV(scope, handle, limit) {
  if (!kv) {
    return { success: false, error: 'KV not configured' };
  }

  try {
    const artifactIds = await kv.smembers(ARTIFACTS_KEY) || [];
    const artifacts = [];
    const staleIds = [];

    for (const id of artifactIds) {
      const artifact = await kv.get(`${ARTIFACT_PREFIX}${id}`);
      if (artifact) {
        artifacts.push(artifact);
      } else {
        staleIds.push(id);
      }
    }

    // Clean up stale IDs
    if (staleIds.length > 0) {
      kv.srem(ARTIFACTS_KEY, ...staleIds).catch(err =>
        console.error('Failed to clean stale artifact IDs:', err)
      );
    }

    // Filter by scope
    let filtered = [];
    if (scope === 'mine') {
      filtered = artifacts.filter(a => a.created_by === handle);
    } else if (scope === 'for-me') {
      filtered = artifacts.filter(a => a.created_for === handle);
    } else if (scope === 'network') {
      filtered = artifacts.filter(a =>
        a.visibility === 'public' ||
        a.visibility === 'network' ||
        a.audience.includes(handle) ||
        a.created_by === handle ||
        a.created_for === handle
      );
    }

    filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    const limited = filtered.slice(0, limit);

    return { success: true, artifacts: limited, total: filtered.length };
  } catch (error) {
    console.error('[ARTIFACTS] KV read failed:', error.message);
    return { success: false, error: error.message };
  }
}

// ============ HTTP HANDLERS ============

export default async function handler(req, res) {
  // POST: Create Artifact
  if (req.method === 'POST') {
    try {
      const {
        title,
        template,
        content,
        created_by,
        created_for,
        thread_id,
        visibility = 'unlisted',
        audience = [],
        provenance,
        expires_at
      } = req.body;

      // Validation
      if (!title || !template || !content) {
        return res.status(400).json({
          error: 'Missing required fields',
          required: ['title', 'template', 'content']
        });
      }

      if (!['guide', 'learning', 'workspace'].includes(template)) {
        return res.status(400).json({
          error: 'Invalid template',
          valid: ['guide', 'learning', 'workspace']
        });
      }

      if (!content.blocks || !Array.isArray(content.blocks)) {
        return res.status(400).json({
          error: 'Invalid content structure - must include blocks array'
        });
      }

      if (!created_by) {
        return res.status(400).json({ error: 'Missing created_by (creator handle)' });
      }

      // Build artifact
      const artifactId = generateArtifactId();
      const slug = generateSlug(title);

      const artifact = {
        id: artifactId,
        slug,
        title,
        template,
        content,
        created_by,
        created_for: created_for || null,
        thread_id: thread_id || null,
        visibility,
        audience: Array.isArray(audience) ? audience : [],
        provenance: provenance || { source_type: 'manual', notes: null },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        expires_at: expires_at || null,
        revision: 1,
        forked_from: null
      };

      // Dual-write strategy
      let pgWriteSuccess = false;
      let kvWriteSuccess = false;

      // Write to Postgres if dual-write is enabled
      if (DUAL_WRITE && isPostgresEnabled()) {
        const pgResult = await writeToPostgres(artifact);
        pgWriteSuccess = pgResult.success;
        if (!pgResult.success) {
          console.warn('[ARTIFACTS] Postgres write failed, continuing with KV:', pgResult.error);
        }
      }

      // Always write to KV (fallback)
      const kvResult = await writeToKV(artifact);
      kvWriteSuccess = kvResult.success;

      if (!kvWriteSuccess && !pgWriteSuccess) {
        return res.status(503).json({ error: 'Storage unavailable' });
      }

      const url = `https://slashvibe.dev/a/${slug}`;

      return res.status(201).json({
        success: true,
        artifact_id: artifactId,
        slug,
        url,
        message: 'Artifact created',
        storage: {
          postgres: pgWriteSuccess,
          kv: kvWriteSuccess
        }
      });

    } catch (error) {
      console.error('POST /api/artifacts error:', error);
      return res.status(500).json({ error: 'Failed to create artifact' });
    }
  }

  // GET: List Artifacts
  if (req.method === 'GET') {
    try {
      const { scope, handle, limit = '10' } = req.query;

      if (!scope || !['mine', 'for-me', 'network'].includes(scope)) {
        return res.status(400).json({
          error: 'Invalid scope',
          valid: ['mine', 'for-me', 'network']
        });
      }

      if (!handle) {
        return res.status(400).json({ error: 'Missing handle parameter' });
      }

      const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 50);

      // Read from Postgres or KV based on feature flag
      let result;
      if (READ_FROM_PG && isPostgresEnabled()) {
        result = await readFromPostgres(scope, handle, parsedLimit);

        // Fallback to KV if Postgres fails
        if (!result.success) {
          console.warn('[ARTIFACTS] Postgres read failed, falling back to KV:', result.error);
          result = await readFromKV(scope, handle, parsedLimit);
        }
      } else {
        result = await readFromKV(scope, handle, parsedLimit);
      }

      if (!result.success) {
        return res.status(503).json({
          error: 'Storage unavailable',
          artifacts: [],
          total: 0
        });
      }

      return res.status(200).json({
        success: true,
        artifacts: result.artifacts,
        total: result.total,
        source: READ_FROM_PG && isPostgresEnabled() ? 'postgres' : 'kv'
      });

    } catch (error) {
      console.error('GET /api/artifacts error:', error);
      return res.status(500).json({ error: 'Failed to list artifacts' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

// Export helper for [slug].js
export { getArtifactBySlugFromPostgres };
