# /vibe Cleanup Action Plan

**Goal:** Fix the repo confusion and establish clear architecture
**Time:** ~2 hours
**Status:** Ready to execute

---

## 🔍 Step 1: Audit Current State (15 min)

### What repos do you actually have on GitHub?

```bash
# Check all three
gh repo view brightseth/vibe --json description,url
gh repo view brightseth/vibe-platform --json description,url
gh repo view brightseth/vibe-terminal --json description,url
```

**Document the answer:**
- What is each repo FOR?
- Which one is actually deployed to slashvibe.dev?
- Which one should be the backend?

---

## ✅ Step 2: Make a Decision (5 min)

### Option A: Use vibe-platform as backend
```
vibe-platform    → slashvibe.dev (all APIs)
vibe-terminal    → Desktop app
vibe-web         → Marketing site (new repo)
vibe             → DELETE (merge into vibe-platform)
```

### Option B: Use vibe as backend
```
vibe             → slashvibe.dev (all APIs)
vibe-terminal    → Desktop app
vibe-platform    → DELETE (merge into vibe)
```

**Recommendation:** Option A (vibe-platform) because the name is clearer.

**Pick one and write it down here:**
- [ ] I'm using **vibe-platform** as the backend
- [ ] I'm using **vibe** as the backend

---

## 🔧 Step 3: Execute the Consolidation (30 min)

### If you chose vibe-platform:

```bash
# 1. Check what's in ~/vibe-public that's NOT in ~/Projects/vibe
cd ~/vibe-public
git log --oneline -10 > /tmp/vibe-commits.txt

cd ~/Projects/vibe
git log --oneline -10 > /tmp/vibe-platform-commits.txt

# Compare
diff /tmp/vibe-commits.txt /tmp/vibe-platform-commits.txt

# 2. If vibe-public has unique commits, cherry-pick them
cd ~/Projects/vibe
git remote add vibe-public ~/vibe-public
git fetch vibe-public
git cherry-pick <commit-hash>  # For each unique commit

# 3. Update Vercel to deploy vibe-platform
cd ~/Projects/vibe
vercel --prod

# 4. Verify slashvibe.dev now serves from vibe-platform
curl -sL https://slashvibe.dev/api/presence | jq .

# 5. Rename local dir for clarity
mv ~/vibe-public ~/vibe-old
mv ~/Projects/vibe ~/vibe-platform

# 6. Update CLAUDE.md to point to ~/vibe-platform
```

### If you chose vibe:

```bash
# 1. Check what's in ~/Projects/vibe that's NOT in ~/vibe-public
cd ~/Projects/vibe
git log --oneline -10 > /tmp/vibe-platform-commits.txt

cd ~/vibe-public
git log --oneline -10 > /tmp/vibe-commits.txt

# Compare
diff /tmp/vibe-commits.txt /tmp/vibe-platform-commits.txt

# 2. If vibe-platform has unique commits, cherry-pick them
cd ~/vibe-public
git remote add vibe-platform ~/Projects/vibe
git fetch vibe-platform
git cherry-pick <commit-hash>  # For each unique commit

# 3. Verify Vercel deployment
cd ~/vibe-public
vercel --prod

# 4. Rename repos for clarity
mv ~/Projects/vibe ~/vibe-platform-old
mv ~/vibe-public ~/vibe-platform

# 5. Rename GitHub repo
gh repo rename brightseth/vibe vibe-platform
```

---

## 🗑️ Step 4: Remove Duplicate APIs (20 min)

```bash
# 1. Backup vibecodings
cd ~/Projects/vibecodings
git status
git add -A
git commit -m "Backup before removing duplicate APIs"

# 2. Delete duplicate API files
rm api/messages.js
rm api/presence.js
rm api/profile.js
rm api/friends.js
rm api/users.js

# 3. Verify what's left
ls api/
# Should still have: projects.js, stats.js, vibe.js, dna.js, etc.

# 4. Update any code that imported those files
# (Search for local imports and replace with fetch calls)
grep -r "from.*api/messages" .
grep -r "import.*messages" .

# 5. Test vibecodings still works
vercel dev
# Open http://localhost:3000 and test

# 6. Deploy
git add -A
git commit -m "Remove duplicate social APIs - now calls vibe-platform"
vercel --prod
```

---

## 📝 Step 5: Document the Architecture (15 min)

### Update each repo's README

**vibe-platform/README.md:**
```markdown
# /vibe Platform

**The backend for the /vibe social network**

## What This Repo Does
- All social APIs (messages, presence, profiles, friends)
- Artifacts system
- Authentication
- Rate limiting

## Deployed To
- Production: https://slashvibe.dev
- Staging: TBD

## Tech Stack
- Node.js + TypeScript
- Vercel Serverless Functions
- Vercel KV (Redis)

## API Docs
See API.md for endpoint reference

## Local Development
\`\`\`bash
vercel dev
\`\`\`
```

**vibe-terminal/README.md:**
```markdown
# /vibe Terminal

**Desktop app for the /vibe social network**

## What This Repo Does
- Tauri desktop app
- Terminal with session recording
- Social features (presence, messaging, games)

## Uses APIs From
https://slashvibe.dev/api

## Tech Stack
- Rust (Tauri)
- React + TypeScript
- xterm.js

## Local Development
\`\`\`bash
pnpm install
pnpm tauri dev
\`\`\`
```

**vibecodings/README.md:**
```markdown
# vibecodings

**Portfolio directory of projects built with Claude Code**

## What This Repo Does
- Project submissions
- Leaderboard
- DNA matching
- Alpha stats

## Uses APIs From
https://slashvibe.dev/api (for social features)

## Deployed To
https://vibecodings.vercel.app

## Tech Stack
- Static HTML/CSS/JS
- Vercel deployment
```

---

## 🎯 Step 6: Update Your CLAUDE.md (5 min)

```bash
# Edit ~/CLAUDE.md and ~/.claude/CLAUDE.md

# Change:
📂 `/Users/sethstudio1/vibe-public/`

# To:
📂 `/Users/sethstudio1/vibe-platform/` - Backend APIs (slashvibe.dev)
📂 `/Users/sethstudio1/vibe-terminal/` - Desktop app
📂 `/Users/sethstudio1/Projects/vibecodings/` - Portfolio site
```

---

## ✅ Step 7: Verify Everything Works (20 min)

### Test 1: Platform APIs
```bash
# Presence
curl -sL https://slashvibe.dev/api/presence | jq .

# Messages (should require auth)
curl -sL -X POST https://slashvibe.dev/api/messages \
  -H "Content-Type: application/json" \
  -d '{"from":"seth","to":"test","text":"test"}' | jq .
```

### Test 2: vibecodings
```bash
# Open in browser
open https://vibecodings.vercel.app

# Check console for API errors
# Should call slashvibe.dev, not localhost
```

### Test 3: MCP Server
```bash
# In Claude Code
/vibe who
/vibe @jiwa "test message"
```

### Test 4: Terminal App
```bash
cd ~/vibe-terminal
pnpm tauri dev

# Test presence, messaging inside the app
```

---

## 📋 Final Checklist

After completing all steps:

- [ ] ONE repo is deployed to slashvibe.dev (which one? __________)
- [ ] All social APIs live in that ONE repo
- [ ] vibecodings has NO duplicate APIs
- [ ] vibecodings calls slashvibe.dev APIs
- [ ] vibe-terminal calls slashvibe.dev APIs
- [ ] MCP server calls slashvibe.dev APIs
- [ ] Local directories renamed to match repos
- [ ] CLAUDE.md updated with correct paths
- [ ] Each repo has clear README
- [ ] Everything tested and working

---

## 🚨 If Something Breaks

### API not working?
```bash
# Check Vercel logs
vercel logs slashvibe.dev

# Check environment variables
vercel env ls

# Re-deploy
cd ~/vibe-platform  # or wherever your backend is
vercel --prod
```

### vibecodings broken?
```bash
# Check what API it's calling
# Open browser console on vibecodings.vercel.app
# Look for fetch() calls - should be slashvibe.dev, not localhost

# If it's calling localhost, search for hardcoded URLs
cd ~/Projects/vibecodings
grep -r "localhost" .
grep -r "127.0.0.1" .
```

### Can't find a file?
```bash
# Global search across all repos
cd ~
find . -name "messages.js" -not -path "*/node_modules/*" 2>/dev/null
```

---

## 🎉 Success State

When you're done, you should have:

```
GitHub repos:
  brightseth/vibe-platform     → slashvibe.dev
  brightseth/vibe-terminal     → Desktop app
  brightseth/vibecodings       → vibecodings.vercel.app

Local directories:
  ~/vibe-platform/             → vibe-platform repo
  ~/vibe-terminal/             → vibe-terminal repo
  ~/Projects/vibecodings/      → vibecodings repo

Architecture:
  slashvibe.dev
    ├─ api/messages.js
    ├─ api/presence.js
    ├─ api/profile.js
    ├─ api/friends.js
    └─ api/users.js
        ↑ (all clients call these)
        │
    ┌───┴───┬────────────┬──────────────┐
    │       │            │              │
  vibe-  vibe-     vibecodings      ~/.vibe/
  terminal terminal                   MCP
```

---

**Questions before starting?** Ask me! I'll walk you through each step.

**Ready to begin?** Start with Step 1 (audit).
