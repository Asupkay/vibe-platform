# Platform Health Session - API Stability & Bug Fixes

**Date:** January 11, 2026
**Focus:** Ensure vibe-platform is production-ready and all APIs operational
**Goal:** Fix broken endpoints, verify service health, ensure user experience is smooth

---

## 🎯 Your Mission

You're the **reliability engineer** making sure vibe-platform services actually work.

**Context:** Users are hitting errors (creative feed API returning HTML instead of JSON, missing `/api/board` endpoint). Before ralph-loop builds new features, we need the foundation solid.

**Strategic importance:** A broken platform = users can't record sessions = no graph data = no namespace moat.

---

## 📋 Task List (Priority Order)

### Task 1: Fix Missing Creative Feed API (2-3 hours)
**Priority:** 🔴 P0 - BROKEN FOR USERS
**Status:** Discovered Jan 11, blocking vibe_ship/vibe_idea/vibe_request

**Problem:**
- MCP tools call `POST /api/board` and `GET /api/board`
- Endpoint doesn't exist (returns HTML error page)
- Users can't share ships, ideas, or requests
- Creative feed completely non-functional

**Root cause:**
```bash
# MCP tools trying to call:
POST https://slashvibe.dev/api/board
GET https://slashvibe.dev/api/board

# But this file doesn't exist:
/Users/sethstudio1/vibe-platform/api/board.js
```

**What to Build:**

Create `/Users/sethstudio1/vibe-platform/api/board.js`:

```javascript
// Creative Feed API (ships, ideas, requests)
import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    if (req.method === 'POST') {
      return await handlePost(req, res);
    } else if (req.method === 'GET') {
      return await handleGet(req, res);
    } else {
      return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Board API error:', error);
    return res.status(500).json({ error: error.message });
  }
}

async function handlePost(req, res) {
  const { type, handle, content, metadata } = req.body;

  // Validate
  if (!type || !handle || !content) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // Supported types: ship, idea, request, riff
  if (!['ship', 'idea', 'request', 'riff'].includes(type)) {
    return res.status(400).json({ error: 'Invalid type' });
  }

  // Generate ID
  const id = `${type}_${Date.now()}_${Math.random().toString(36).substring(7)}`;

  // Create entry
  const entry = {
    id,
    type,
    handle,
    content,
    metadata: metadata || {},
    created_at: Date.now(),
    reactions: {},
    comments: [],
  };

  // Store in KV
  await kv.set(`board:${id}`, entry);

  // Add to feed index
  await kv.lpush('board:feed', id);

  // Add to user's posts
  await kv.lpush(`board:user:${handle}`, id);

  // Add to type index
  await kv.lpush(`board:type:${type}`, id);

  return res.status(200).json({
    success: true,
    id,
    entry
  });
}

async function handleGet(req, res) {
  const { filter, limit = 15, from, tag } = req.query;

  let feedKey = 'board:feed';

  // Filter by type
  if (filter && ['ship', 'idea', 'request', 'riff'].includes(filter)) {
    feedKey = `board:type:${filter}`;
  }

  // Filter by user
  if (from) {
    feedKey = `board:user:${from}`;
  }

  // Get IDs from feed
  const ids = await kv.lrange(feedKey, 0, parseInt(limit) - 1);

  if (!ids || ids.length === 0) {
    return res.status(200).json({
      entries: [],
      total: 0
    });
  }

  // Fetch entries
  const entries = await Promise.all(
    ids.map(id => kv.get(`board:${id}`))
  );

  // Filter nulls and apply tag filter if specified
  let filtered = entries.filter(e => e !== null);

  if (tag) {
    filtered = filtered.filter(e =>
      e.metadata?.tags?.includes(tag)
    );
  }

  return res.status(200).json({
    entries: filtered,
    total: filtered.length
  });
}
```

**Test the fix:**
```bash
# After deploying, test POST
curl -X POST https://slashvibe.dev/api/board \
  -H "Content-Type: application/json" \
  -d '{
    "type": "ship",
    "handle": "seth",
    "content": "Test ship",
    "metadata": {"tags": ["test"]}
  }'

# Should return: {"success": true, "id": "ship_...", "entry": {...}}

# Test GET
curl https://slashvibe.dev/api/board?filter=ship&limit=10

# Should return: {"entries": [...], "total": N}
```

**Success Criteria:**
- `/api/board` endpoint exists and responds
- POST creates entries and stores in KV
- GET retrieves entries (filtered by type, user, tag)
- MCP tools (vibe_ship, vibe_idea, vibe_request) work
- Users can share ships/ideas via /vibe

---

### Task 2: Verify All API Endpoints (1-2 hours)
**Priority:** 🟡 P1 - Prevent future breakage
**Status:** Not started

**Goal:** Audit all API endpoints to ensure they work

**Endpoints to test:**

```bash
# Core APIs
curl https://slashvibe.dev/api/messages
curl https://slashvibe.dev/api/presence
curl https://slashvibe.dev/api/threads
curl https://slashvibe.dev/api/profile

# Platform APIs
curl https://slashvibe.dev/api/observations
curl https://slashvibe.dev/api/claude-activity
curl https://slashvibe.dev/api/artifacts

# Economic APIs
curl https://slashvibe.dev/api/payments/tip
curl https://slashvibe.dev/api/payments/treasury

# Creative feed (after fixing)
curl https://slashvibe.dev/api/board
```

**For each endpoint, verify:**
- ✅ Returns JSON (not HTML error page)
- ✅ Has proper CORS headers
- ✅ Handles errors gracefully
- ✅ Returns expected schema

**Document results:**
Create `API_HEALTH_REPORT.md` with status of each endpoint.

---

### Task 3: Fix Observations API Production Error (1 hour)
**Priority:** 🟡 P1 - From Ralph's instructions
**Status:** Deployed but broken (FUNCTION_INVOCATION_FAILED)

**Problem:**
- API endpoint returns `FUNCTION_INVOCATION_FAILED` on production
- Likely missing Vercel environment variables

**Fix Steps:**
1. Check Vercel dashboard for environment variables
2. Verify `KV_REST_API_URL` and `KV_REST_API_TOKEN` are set for production
3. Test: `curl https://slashvibe.dev/api/observations`
4. If env vars missing, add them and redeploy
5. If env vars present, check API logs for actual error
6. Merge `proto/daily-observations-api` branch to main after fix

**Success Criteria:**
- `curl https://slashvibe.dev/api/observations` returns `{"observations":[]}` (not error)
- Can POST new observation successfully
- MCP tool `vibe observe "test"` works

---

### Task 4: Database Schema Verification (1 hour)
**Priority:** 🟢 P2 - Preventive maintenance
**Status:** Not started

**Goal:** Ensure Postgres/KV schemas are correct for upcoming features

**Check:**
1. **Vercel KV keys structure:**
   ```
   presence:{handle}
   thread:{handle1}:{handle2}
   board:{id}
   board:feed (list)
   board:user:{handle} (list)
   board:type:{type} (list)
   ```

2. **Postgres tables (if using):**
   - `artifacts` table schema
   - `claude_activity` table schema
   - Indexes on frequently queried columns

3. **Migrations needed:**
   - Any schema changes from recent features?
   - Migration scripts ready to run?

**Document findings:**
Add to `DATABASE_SCHEMA_STATUS.md`

---

### Task 5: Error Handling & Logging Audit (2 hours)
**Priority:** 🟢 P2 - Developer experience
**Status:** Not started

**Goal:** Improve error messages and logging

**For each API endpoint:**
1. Add try-catch blocks
2. Log errors with context:
   ```javascript
   console.error('Board API error:', {
     method: req.method,
     body: req.body,
     error: error.message,
     stack: error.stack
   });
   ```
3. Return helpful error messages:
   ```javascript
   return res.status(400).json({
     error: 'Missing required field: content',
     received: req.body
   });
   ```

**Test with Vercel logs:**
- Deploy changes
- Trigger errors
- Verify logs show useful context

---

## 📁 Session Organization

**Create these files as you work:**

1. **Session Notes:** `vibe-platform/PLATFORM_HEALTH_SESSION_JAN11_2026.md`
   - Running log of what you're fixing
   - Decisions made
   - Issues discovered

2. **Reports:**
   - `API_HEALTH_REPORT.md` (status of all endpoints)
   - `DATABASE_SCHEMA_STATUS.md` (schema verification)

3. **Summary:** `vibe-platform/PLATFORM_HEALTH_SUMMARY_JAN11_2026.md`
   - At end of session, summarize what was fixed

---

## 🔄 Communication Protocol

**Update coordination file:**
Edit `/Users/sethstudio1/VIBE_SESSION_COORDINATION.md` when you:
- Start working (update session status)
- Complete a task (check it off)
- Find new bugs (document them)
- Finish session (mark complete)

**Git Commits:**
Make commits for each fix:
```bash
git commit -m "fix: Add missing /api/board endpoint for creative feed"
git commit -m "fix: Observations API environment variables"
git commit -m "docs: API health audit report"
```

---

## ✅ Success Criteria

**By end of your session:**
- ✅ `/api/board` endpoint working (users can share ships/ideas)
- ✅ All API endpoints verified (health report created)
- ✅ Observations API fixed (production error resolved)
- ✅ Database schema verified
- ✅ Error handling improved (better logs, helpful messages)
- ✅ All work committed to git
- ✅ Coordination file updated
- ✅ Session summary created

---

## 🎯 Strategic Context

**Why this matters:**

You're ensuring the **foundation is solid** before ralph-loop builds on top.

**Platform health work:**
- Broken APIs = users frustrated = churn
- Missing endpoints = MCP tools don't work = bad experience
- Poor error messages = debugging takes hours = wasted time

**This prevents:**
- Ralph-loop building features on broken foundation
- Users hitting errors when terminal launches (Week 2)
- API failures during NODE opening (Week 3)

**Without your work, the platform isn't production-ready.**

---

## 📚 Reference Files

**Read these for context:**

1. **Error Report:** The trace you provided showing `/api/board` missing

2. **MCP Tools:**
   - `vibe-platform/mcp-server/tools/ship.js`
   - `vibe-platform/mcp-server/tools/idea.js`
   - `vibe-platform/mcp-server/tools/feed.js`

3. **Existing APIs:**
   - `vibe-platform/api/` directory (all endpoints)

4. **Coordination:**
   - `/Users/sethstudio1/VIBE_SESSION_COORDINATION.md`

---

## 🚀 Ready to Start

**First actions:**
1. Create `vibe-platform/PLATFORM_HEALTH_SESSION_JAN11_2026.md`
2. Update `/Users/sethstudio1/VIBE_SESSION_COORDINATION.md` (add this session)
3. Start with Task 1 (Fix missing `/api/board` endpoint)
4. Test the fix immediately

**Questions?**
Document them in your session notes.

---

**Go make the platform production-ready.** 🎯
