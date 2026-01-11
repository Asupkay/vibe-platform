/**
 * Watch API - Live terminal broadcasting for /vibe users
 *
 * Uses Vercel KV (Redis) for broadcast state and terminal buffer
 *
 * POST /api/watch - Start/stop broadcasting
 * GET /api/watch - List active broadcasts
 * GET /api/watch?room=X - Get broadcast info and viewer count
 * POST /api/watch (action: stream) - Push terminal data (broadcaster)
 * GET /api/watch?room=X&stream=true - Pull terminal data (viewer)
 */

const KV_CONFIGURED = !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);

const BROADCASTS_KEY = 'vibe:broadcasts';
const BUFFER_PREFIX = 'vibe:buffer:';
const VIEWERS_PREFIX = 'vibe:viewers:';

// Keep last 100 chunks per room (each chunk ~500 bytes = ~50KB max)
const MAX_BUFFER_SIZE = 100;
// Broadcast timeout (5 minutes of no activity)
const BROADCAST_TIMEOUT = 5 * 60 * 1000;
// Viewer timeout (30 seconds of no polling)
const VIEWER_TIMEOUT = 30 * 1000;

let memoryBroadcasts = {};
let memoryBuffers = {};
let memoryViewers = {};

async function getKV() {
  if (!KV_CONFIGURED) return null;
  try {
    const { kv } = await import('@vercel/kv');
    return kv;
  } catch (e) {
    return null;
  }
}

async function getBroadcasts() {
  const kv = await getKV();
  if (kv) {
    const broadcasts = await kv.get(BROADCASTS_KEY);
    return broadcasts || {};
  }
  return memoryBroadcasts;
}

async function saveBroadcasts(broadcasts) {
  const kv = await getKV();
  if (kv) {
    await kv.set(BROADCASTS_KEY, broadcasts);
  }
  memoryBroadcasts = broadcasts;
}

async function getBuffer(roomId) {
  const kv = await getKV();
  if (kv) {
    const buffer = await kv.get(BUFFER_PREFIX + roomId);
    return buffer || [];
  }
  return memoryBuffers[roomId] || [];
}

async function appendToBuffer(roomId, data) {
  const kv = await getKV();
  let buffer = await getBuffer(roomId);

  buffer.push({
    data,
    timestamp: Date.now(),
    seq: buffer.length
  });

  // Keep only recent chunks
  if (buffer.length > MAX_BUFFER_SIZE) {
    buffer = buffer.slice(-MAX_BUFFER_SIZE);
  }

  if (kv) {
    await kv.set(BUFFER_PREFIX + roomId, buffer, { ex: 3600 }); // 1 hour TTL
  } else {
    memoryBuffers[roomId] = buffer;
  }

  return buffer.length;
}

async function getViewers(roomId) {
  const kv = await getKV();
  if (kv) {
    const viewers = await kv.get(VIEWERS_PREFIX + roomId);
    return viewers || {};
  }
  return memoryViewers[roomId] || {};
}

async function updateViewer(roomId, viewerId) {
  const kv = await getKV();
  const viewers = await getViewers(roomId);

  viewers[viewerId] = Date.now();

  // Clean up stale viewers
  const now = Date.now();
  for (const id of Object.keys(viewers)) {
    if (now - viewers[id] > VIEWER_TIMEOUT) {
      delete viewers[id];
    }
  }

  if (kv) {
    await kv.set(VIEWERS_PREFIX + roomId, viewers, { ex: 3600 });
  } else {
    memoryViewers[roomId] = viewers;
  }

  return Object.keys(viewers).length;
}

function generateRoomId() {
  return 'room_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
}

function generateViewerId() {
  return 'viewer_' + Math.random().toString(36).substring(2, 10);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // POST - Start/stop broadcast or stream data
  if (req.method === 'POST') {
    const { action, handle, roomId, data } = req.body;

    // Stream terminal data to room
    if (action === 'stream') {
      if (!roomId || !data) {
        return res.status(400).json({
          success: false,
          error: 'Missing roomId or data'
        });
      }

      const broadcasts = await getBroadcasts();
      const broadcast = broadcasts[roomId];

      if (!broadcast) {
        return res.status(404).json({
          success: false,
          error: 'Broadcast not found'
        });
      }

      // Update broadcast activity
      broadcast.lastActivity = Date.now();
      await saveBroadcasts(broadcasts);

      // Append to buffer
      const bufferSize = await appendToBuffer(roomId, data);
      const viewerCount = Object.keys(await getViewers(roomId)).length;

      return res.status(200).json({
        success: true,
        bufferSize,
        viewerCount,
        storage: KV_CONFIGURED ? 'kv' : 'memory'
      });
    }

    // Stop broadcasting
    if (action === 'stop') {
      if (!roomId) {
        return res.status(400).json({
          success: false,
          error: 'Missing roomId'
        });
      }

      const broadcasts = await getBroadcasts();
      delete broadcasts[roomId];
      await saveBroadcasts(broadcasts);

      return res.status(200).json({
        success: true,
        message: 'Broadcast stopped'
      });
    }

    // Start broadcasting
    if (!handle) {
      return res.status(400).json({
        success: false,
        error: 'Missing handle'
      });
    }

    const newRoomId = generateRoomId();
    const broadcasts = await getBroadcasts();

    // Clean up stale broadcasts
    const now = Date.now();
    for (const id of Object.keys(broadcasts)) {
      if (now - broadcasts[id].lastActivity > BROADCAST_TIMEOUT) {
        delete broadcasts[id];
      }
    }

    broadcasts[newRoomId] = {
      roomId: newRoomId,
      handle: handle.toLowerCase().replace('@', ''),
      startedAt: new Date().toISOString(),
      lastActivity: now
    };

    await saveBroadcasts(broadcasts);

    return res.status(200).json({
      success: true,
      roomId: newRoomId,
      shareUrl: `https://slashvibe.dev/watch/${newRoomId}`,
      storage: KV_CONFIGURED ? 'kv' : 'memory'
    });
  }

  // GET - List broadcasts or get stream
  if (req.method === 'GET') {
    const { room, stream, since, viewerId: queryViewerId } = req.query;

    // Get stream data for a room
    if (room && stream === 'true') {
      const broadcasts = await getBroadcasts();
      const broadcast = broadcasts[room];

      if (!broadcast) {
        return res.status(404).json({
          success: false,
          error: 'Broadcast not found or ended'
        });
      }

      // Register/update viewer
      const viewerId = queryViewerId || generateViewerId();
      const viewerCount = await updateViewer(room, viewerId);

      // Get buffer, optionally filtered by sequence number
      let buffer = await getBuffer(room);

      if (since) {
        const sinceSeq = parseInt(since);
        buffer = buffer.filter(chunk => chunk.seq > sinceSeq);
      }

      return res.status(200).json({
        success: true,
        broadcast: {
          handle: broadcast.handle,
          startedAt: broadcast.startedAt
        },
        viewerId,
        viewerCount,
        chunks: buffer,
        lastSeq: buffer.length > 0 ? buffer[buffer.length - 1].seq : 0,
        storage: KV_CONFIGURED ? 'kv' : 'memory'
      });
    }

    // Get specific broadcast info
    if (room) {
      const broadcasts = await getBroadcasts();
      const broadcast = broadcasts[room];

      if (!broadcast) {
        return res.status(404).json({
          success: false,
          error: 'Broadcast not found'
        });
      }

      const viewerCount = Object.keys(await getViewers(room)).length;

      return res.status(200).json({
        success: true,
        broadcast: {
          ...broadcast,
          viewerCount
        },
        storage: KV_CONFIGURED ? 'kv' : 'memory'
      });
    }

    // List all active broadcasts
    const broadcasts = await getBroadcasts();

    // Clean up stale broadcasts
    const now = Date.now();
    let cleaned = false;
    for (const id of Object.keys(broadcasts)) {
      if (now - broadcasts[id].lastActivity > BROADCAST_TIMEOUT) {
        delete broadcasts[id];
        cleaned = true;
      }
    }
    if (cleaned) {
      await saveBroadcasts(broadcasts);
    }

    // Get viewer counts
    const activeBroadcasts = await Promise.all(
      Object.values(broadcasts).map(async (b) => ({
        ...b,
        viewerCount: Object.keys(await getViewers(b.roomId)).length
      }))
    );

    return res.status(200).json({
      success: true,
      broadcasts: activeBroadcasts,
      total: activeBroadcasts.length,
      storage: KV_CONFIGURED ? 'kv' : 'memory'
    });
  }

  // DELETE - Force stop a broadcast (admin)
  if (req.method === 'DELETE') {
    const { room } = req.query;

    if (!room) {
      return res.status(400).json({
        success: false,
        error: 'Missing room parameter'
      });
    }

    const broadcasts = await getBroadcasts();
    delete broadcasts[room];
    await saveBroadcasts(broadcasts);

    return res.status(200).json({
      success: true,
      message: 'Broadcast deleted'
    });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
