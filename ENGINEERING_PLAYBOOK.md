# /vibe Engineering Playbook

**Welcome to your 20-person engineering department (it's just you + Claude, but we're building like a real company)**

---

## 🏗️ Repository Architecture

You're building a **social network for AI developers**. Here's how to structure it properly:

### The Three Repos (Current State)

```
brightseth/vibe              ← What is this? (~/vibe-public)
brightseth/vibe-platform     ← Backend APIs (~/Projects/vibe)
brightseth/vibe-terminal     ← Desktop app (~/vibe-terminal)
```

### The Confusion

- **vibe** vs **vibe-platform** - which one is the backend?
- You have TWO platform repos when you should have ONE
- Code is duplicated across repos (bad!)

---

## ✅ Best Practice: Multi-Repo Architecture

For a startup building a social platform, here's the **industry standard**:

### **Recommended Structure**

```
GitHub Organization: brightseth/

1. vibe-platform (THE BACKEND)
   └─ All APIs, shared logic, database schemas
   └─ Deployed to: api.slashvibe.dev (or slashvibe.dev/api)
   └─ Tech: Node.js + Vercel Serverless
   └─ Exports: Shared types as npm package

2. vibe-terminal (DESKTOP APP)
   └─ Tauri desktop app
   └─ Calls vibe-platform APIs
   └─ Tech: Rust + React + xterm.js

3. vibe-web (PUBLIC WEBSITE)
   └─ Marketing site, docs, install script
   └─ Deployed to: slashvibe.dev
   └─ Tech: Static HTML/JS

4. vibe-mcp (MCP SERVER)
   └─ Claude Code integration
   └─ Calls vibe-platform APIs
   └─ Installed to: ~/.vibe/

5. vibecodings (SEPARATE PROJECT)
   └─ Portfolio directory of projects
   └─ Deployed to: vibecodings.vercel.app
   └─ Calls vibe-platform APIs
```

---

## 🎯 The Golden Rules

### Rule 1: Single Source of Truth
**ONE repo owns each feature.** No duplicates.

- ✅ Messages API lives in `vibe-platform`
- ❌ Messages API copied to `vibecodings`
- ❌ Messages API copied to `vibe-terminal`

**How clients use it:**
- Terminal: `fetch('https://slashvibe.dev/api/messages')`
- MCP: `fetch('https://slashvibe.dev/api/messages')`
- vibecodings: `fetch('https://slashvibe.dev/api/messages')`

### Rule 2: Shared Code → npm Package
If multiple repos need the same TypeScript types:

```bash
# In vibe-platform
cd packages/types
npm publish @vibe/types

# In vibe-terminal
npm install @vibe/types
```

**Alternative (simpler for now):** Keep types in platform, clients copy the fetch code.

### Rule 3: One Deploy Per Repo
Each repo = one Vercel project = one domain

```
vibe-platform  → slashvibe.dev (or api.slashvibe.dev)
vibe-web       → slashvibe.dev (if separate from platform)
vibecodings    → vibecodings.vercel.app
vibe-terminal  → Desktop app (no deploy)
vibe-mcp       → Local install (no deploy)
```

### Rule 4: API Versioning
When you break APIs, version them:

```
/api/v1/messages  ← Old clients use this
/api/v2/messages  ← New clients use this
```

For now, just use `/api/messages` until you need to break compatibility.

---

## 🧹 What You Need to Clean Up NOW

### Problem 1: Two Platform Repos
You have **both** `brightseth/vibe` and `brightseth/vibe-platform`.

**Fix:**
1. Pick ONE as canonical (vibe-platform is the better name)
2. Migrate any unique code from `vibe` → `vibe-platform`
3. Archive or delete `brightseth/vibe`
4. Rename local dir: `mv ~/vibe-public ~/vibe-web`

### Problem 2: Duplicate APIs
Messages API exists in both `vibe-platform` and `vibecodings`.

**Fix:**
1. Delete `~/Projects/vibecodings/api/messages.js`
2. Update vibecodings to call slashvibe.dev API
3. Document in `vibecodings/README.md`: "Uses vibe-platform APIs"

### Problem 3: Unclear Deployments
You have:
- `vibe-public` → slashvibe.dev (but it's the "vibe" repo)
- `Projects/vibe` → ??? (it's "vibe-platform" repo)

**Fix:**
1. Deploy `vibe-platform` to slashvibe.dev (or api.slashvibe.dev)
2. Separate marketing site to `vibe-web` repo
3. Update Vercel project names to match repos

---

## 📋 The Cleanup Plan (Step by Step)

### Phase 1: Audit (TODAY)
```bash
# 1. Check what's actually deployed
vercel ls

# 2. Check which repo each local dir tracks
cd ~/vibe-public && git remote -v
cd ~/Projects/vibe && git remote -v
cd ~/vibe-terminal && git remote -v

# 3. Document in INVENTORY.md
```

### Phase 2: Consolidate Platform (NEXT)
```bash
# 1. Decide: Keep "vibe" or "vibe-platform" repo?
#    Recommendation: vibe-platform (clearer name)

# 2. Migrate unique code from vibe → vibe-platform

# 3. Update Vercel project to point to vibe-platform

# 4. Archive brightseth/vibe on GitHub
```

### Phase 3: Remove Duplicates
```bash
# 1. Delete duplicate APIs from vibecodings
cd ~/Projects/vibecodings
rm api/messages.js api/presence.js api/profile.js

# 2. Update vibecodings to call external API
# (Change from local import to fetch)

# 3. Test vibecodings still works
```

### Phase 4: Clarify Names
```bash
# 1. Rename local dirs to match repos
mv ~/vibe-public ~/vibe-web

# 2. Update your CLAUDE.md paths

# 3. Document in each repo's README
```

---

## 🏢 How a 20-Person Team Would Structure This

### Backend Team (4 engineers)
**Repo:** `vibe-platform`
**Responsibilities:**
- All API endpoints
- Database schemas
- Authentication
- Rate limiting
- Monitoring

**Stack:**
- Node.js + TypeScript
- Vercel Serverless Functions
- Vercel KV (Redis)
- PostgreSQL (if needed later)

### Desktop Team (3 engineers)
**Repo:** `vibe-terminal`
**Responsibilities:**
- Tauri desktop app
- Terminal UI/UX
- Session recording
- Local storage

**Stack:**
- Rust (Tauri)
- React + TypeScript
- xterm.js

### Web Team (2 engineers)
**Repo:** `vibe-web`
**Responsibilities:**
- Marketing site
- Documentation
- Install scripts
- SEO

**Stack:**
- Static HTML/CSS/JS
- Vercel deployment

### MCP Team (2 engineers)
**Repo:** `vibe-mcp`
**Responsibilities:**
- Claude Code integration
- Local CLI tools
- Install/update system

**Stack:**
- Node.js + TypeScript
- npm packaging

### DevOps (2 engineers)
**Responsibilities:**
- CI/CD pipelines
- Monitoring
- Vercel config
- Domain management

### Product (2 engineers)
**Responsibilities:**
- Feature specs
- User research
- Roadmap

**How they'd communicate:**
- Slack channels per repo
- Weekly syncs
- Shared design system
- API contracts in Notion/Linear

---

## 📐 API Design Best Practices

### RESTful Endpoints
```
GET    /api/messages         ← List messages
POST   /api/messages         ← Send message
GET    /api/messages/:id     ← Get specific message
DELETE /api/messages/:id     ← Delete message

GET    /api/presence         ← Who's online
POST   /api/presence         ← Heartbeat (I'm alive)

GET    /api/profile/:handle  ← User profile
PATCH  /api/profile/:handle  ← Update profile
```

### Error Responses
```json
{
  "success": false,
  "error": "Authentication required",
  "code": "AUTH_REQUIRED",
  "details": {
    "endpoint": "/api/messages",
    "suggestion": "Include Authorization header"
  }
}
```

### Rate Limiting
```javascript
// In vibe-platform/api/_middleware.js
import { rateLimit } from '@/lib/ratelimit'

export async function middleware(req) {
  const limit = await rateLimit.check(req.ip, '10 per minute')
  if (!limit.success) {
    return new Response('Too many requests', { status: 429 })
  }
}
```

---

## 🔐 Authentication Strategy

### Current: Simple Presence Registration
Users register by sending presence heartbeat with handle.

**Problem:** No real auth, anyone can impersonate.

### Next: Token-Based Auth
```javascript
// 1. Register
POST /api/auth/register
{ "handle": "seth", "email": "seth@..." }
→ Returns: { "token": "vibe_xxx" }

// 2. Use token
GET /api/messages
Authorization: Bearer vibe_xxx

// 3. Refresh
POST /api/auth/refresh
Authorization: Bearer vibe_xxx
→ Returns: { "token": "vibe_yyy" }
```

### Later: OAuth + GitHub
Let users sign in with GitHub to prevent impersonation.

---

## 📊 Monitoring & Observability

### What to Track
- API response times
- Error rates
- Active users
- Message volume
- Vercel function costs

### Tools
- **Vercel Analytics** (free, built-in)
- **Sentry** (error tracking)
- **PostHog** (user analytics)
- **Cronitor** (uptime monitoring)

### Alerts
- Slack webhook when error rate > 5%
- Email when API is down
- Daily usage summary

---

## 🚀 Deployment Strategy

### Environments
```
Production:  slashvibe.dev        (main branch)
Staging:     staging.slashvibe.dev (develop branch)
Preview:     pr-123.slashvibe.dev  (per PR)
```

### Git Workflow
```bash
main       ← Production (protected)
  ↑
develop    ← Staging (protected)
  ↑
feature/messaging-v2  ← Your feature branch

# Workflow:
1. Create feature branch from develop
2. Push to feature branch → auto-deploys preview
3. Test on preview URL
4. Open PR to develop → team review
5. Merge to develop → auto-deploys staging
6. Test on staging
7. Open PR to main → final review
8. Merge to main → auto-deploys production
```

---

## 📦 Shared Code Strategy

### Option 1: Monorepo (Future)
If you grow, consider Turborepo:
```
vibe-monorepo/
├── apps/
│   ├── platform/     (API)
│   ├── terminal/     (Desktop)
│   └── web/          (Marketing)
├── packages/
│   ├── types/        (Shared TypeScript types)
│   ├── ui/           (Shared React components)
│   └── utils/        (Shared utilities)
└── turbo.json
```

**Pros:** Easy to share code, atomic commits
**Cons:** Complex CI, large repo, not urgent yet

### Option 2: npm Packages (Current Recommendation)
Publish shared code as private npm packages:
```bash
# In vibe-platform
cd packages/types
npm publish @vibe/types --access public

# In vibe-terminal
npm install @vibe/types
```

### Option 3: Copy-Paste (OK for now!)
Just copy the TypeScript types into each repo.
- Simple
- No publishing overhead
- Acceptable until you have a team

---

## 🧪 Testing Strategy

### Backend (vibe-platform)
```bash
# Unit tests
vitest api/messages.test.js

# Integration tests
vitest api/__tests__/integration/

# E2E tests
playwright test
```

### Desktop (vibe-terminal)
```bash
# Rust tests
cargo test

# React component tests
vitest src/components/
```

---

## 📖 Documentation Standards

### Each repo should have:
1. **README.md** - Quick start, what this repo does
2. **ARCHITECTURE.md** - How it works internally
3. **API.md** (for platform) - API reference
4. **CONTRIBUTING.md** - How to contribute
5. **CHANGELOG.md** - Version history

### API Documentation
Use OpenAPI spec:
```yaml
# vibe-platform/api/openapi.yaml
openapi: 3.0.0
paths:
  /api/messages:
    post:
      summary: Send a message
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                to:
                  type: string
                text:
                  type: string
```

Deploy to: `slashvibe.dev/api/docs`

---

## 🎯 Your Next Steps

### Today:
1. ✅ Read this playbook
2. ⬜ Audit what repos you actually need
3. ⬜ Decide: Keep "vibe" or "vibe-platform"?
4. ⬜ Document current state in INVENTORY.md

### This Week:
1. ⬜ Consolidate to ONE platform repo
2. ⬜ Remove duplicate APIs from vibecodings
3. ⬜ Deploy platform to slashvibe.dev
4. ⬜ Update all clients to call production API

### This Month:
1. ⬜ Add real authentication
2. ⬜ Set up monitoring
3. ⬜ Write API documentation
4. ⬜ Create staging environment

---

## 💡 Key Principles

1. **Don't Repeat Yourself (DRY)** - One canonical source per feature
2. **Separation of Concerns** - Each repo has one job
3. **API Contracts** - Clients and server agree on interface
4. **Version Everything** - Git tags, npm versions, API versions
5. **Monitor Everything** - You can't fix what you can't measure
6. **Document Decisions** - Write down WHY you chose this architecture

---

## 🤝 Questions to Ask Before Making Changes

1. **Where does this code belong?**
   - Backend logic? → vibe-platform
   - Desktop UI? → vibe-terminal
   - Marketing content? → vibe-web

2. **Will multiple repos need this?**
   - No → Keep it local
   - Yes → Publish as npm package or use API

3. **Is this a breaking change?**
   - Yes → Version the API (v1 → v2)
   - No → Safe to deploy

4. **Can I test this in isolation?**
   - Yes → Good separation of concerns
   - No → Maybe refactor first

---

## 📚 Learning Resources

- **Vercel Docs**: https://vercel.com/docs
- **API Design**: https://github.com/public-apis/public-apis
- **Monorepo Guide**: https://turbo.build/repo/docs
- **Git Workflow**: https://www.atlassian.com/git/tutorials/comparing-workflows

---

**Remember:** You're building a real company. These patterns will save you from chaos as you scale. Better to set them up now than refactor later.

Questions? Ask! I'm your whole engineering department. 🚀
