/**
 * POST /api/artifacts - Create artifact
 * GET /api/artifacts?scope=mine|for-me|network - List artifacts
 *
 * Artifacts are first-class social objects with provenance and permissions.
 * The missing primitive between ephemeral chat and permanent knowledge.
 */

import crypto from 'crypto';
const { kv } = await import('@vercel/kv');

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

      if (!kv) {
        return res.status(503).json({ error: 'KV not configured' });
      }

      await kv.set(`${ARTIFACT_PREFIX}${artifactId}`, artifact);
      await kv.sadd(ARTIFACTS_KEY, artifactId);

      if (expires_at) {
        const expiryTimestamp = Math.floor(new Date(expires_at).getTime() / 1000);
        const now = Math.floor(Date.now() / 1000);
        const ttl = expiryTimestamp - now;
        if (ttl > 0) {
          await kv.expireat(`${ARTIFACT_PREFIX}${artifactId}`, expiryTimestamp);
        }
      }

      const url = `https://slashvibe.dev/a/${slug}`;

      return res.status(201).json({
        success: true,
        artifact_id: artifactId,
        slug,
        url,
        message: 'Artifact created'
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

      if (!kv) {
        return res.status(503).json({
          error: 'KV not configured',
          artifacts: [],
          total: 0
        });
      }

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
      const limited = filtered.slice(0, parsedLimit);

      return res.status(200).json({
        success: true,
        artifacts: limited,
        total: filtered.length
      });

    } catch (error) {
      console.error('GET /api/artifacts error:', error);
      return res.status(500).json({ error: 'Failed to list artifacts' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
