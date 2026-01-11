# /vibe Repository Audit - January 10, 2026

**Ultrathinking Analysis:** You have a serious fork divergence problem.

---

## 🔍 Current State

### Two Repos, Same Vercel Project

| Metric | brightseth/vibe | brightseth/vibe-platform |
|--------|-----------------|--------------------------|
| **Local Path** | ~/vibe-public | ~/Projects/vibe |
| **Vercel Project** | vibe-public (SAME ID!) | vibe-public (SAME ID!) |
| **Currently Deployed** | ✅ YES (deployed 14min ago) | ❌ NO |
| **Total Commits** | 63 | 48 |
| **Commits Since Jan 1** | 63 | 48 |
| **Last Commit** | Jan 10, 9:30pm | Jan 10, 4:33pm |
| **Total Files** | 278 | 312 |
| **API Endpoints** | 14 | 10 |

---

## 🎯 What Each Repo Has

### brightseth/vibe (~/vibe-public) - THE ACTIVE FORK

**Unique Features:**
- ✅ `api/claude-activity.js` - Claude activity tracking
- ✅ `api/friends.js` - Friends system
- ✅ `api/artifacts-browse.js` - Artifact browsing
- ✅ `api/style-demo.js` - PET Green style demo
- ✅ More recent development (updated 5 hours later today)
- ✅ Currently deployed to slashvibe.dev

**Evidence this is the main repo:**
- 15 more commits than vibe-platform
- More API endpoints
- More active development
- Most recent commit
- Actually deployed

### brightseth/vibe-platform (~/Projects/vibe) - THE EXPERIMENTAL FORK

**Unique Features:**
- ✅ **Ralph Wiggum Agent Coordination** (2543 lines!)
  - `scripts/ralph-maintain.sh` - Maintenance agent loop
  - `scripts/ralph-route-task.sh` - Task routing
  - `scripts/ralph-handoff-helper.js` - AIRC handoffs
  - `RALPH_AGENT_COORDINATION.md` - Full docs
  - GitHub Actions workflow
  - Multi-agent task delegation
- ✅ **Daily Observations API** (615 lines)
  - `api/observations.js` - AGI self-expression API
  - `mcp-server/tools/observe.js` - MCP tool
  - Authentication, rate limiting
- ✅ `contracts/` directory (empty except node_modules)
- ✅ `docs/` directory (ECONOMIC_LAYER infographics)

**Evidence this was meant to be a branch:**
- Commit message: "Fix install script repo URL: vibe → vibe-platform"
- Security fixes that made it into both repos
- Shares Vercel project ID with vibe

---

## 💥 The Problem

You've been **developing in parallel across two repos** without realizing it:

```
Jan 1                    Jan 10 (today)
  │                           │
  vibe ─────────────────────► 63 commits (active, deployed)
       \
        vibe-platform ───────► 48 commits (experimental, not deployed)
                                - Ralph Wiggum (huge!)
                                - Observations API
```

**Neither repo has everything.** They've diverged.

---

## ✅ The Solution

### Option 1: Merge vibe-platform INTO vibe (RECOMMENDED)

**Why:**
- `vibe` is already deployed and working
- `vibe` has more commits and is more active
- `vibe` has the newer APIs (claude-activity, friends, etc.)
- Just need to port Ralph + Observations from vibe-platform

**Steps:**
```bash
# 1. Add vibe-platform as a remote to vibe
cd ~/vibe-public
git remote add vibe-platform ~/Projects/vibe

# 2. Fetch all commits
git fetch vibe-platform

# 3. Cherry-pick the unique commits
git cherry-pick b995060  # Daily observations
git cherry-pick 7925886  # Ralph Wiggum

# 4. Test everything works
vercel dev

# 5. Deploy
vercel --prod

# 6. Archive vibe-platform on GitHub
gh repo archive brightseth/vibe-platform

# 7. Delete local vibe-platform
rm -rf ~/Projects/vibe
```

**Pros:**
- Keep the active, deployed repo
- Gain Ralph + Observations features
- One canonical repo going forward

**Cons:**
- Need to manually cherry-pick commits (clean but takes time)

---

### Option 2: Merge vibe INTO vibe-platform

**Why:**
- The name "vibe-platform" is clearer
- Ralph Wiggum is impressive infrastructure

**Steps:**
```bash
# 1. Add vibe as a remote to vibe-platform
cd ~/Projects/vibe
git remote add vibe ~/vibe-public

# 2. Fetch all commits
git fetch vibe

# 3. Create a merge
git merge vibe/main --no-ff

# 4. Resolve conflicts, test
vercel dev

# 5. Update Vercel to deploy vibe-platform
# (rename project or change git connection)

# 6. Archive brightseth/vibe on GitHub
gh repo archive brightseth/vibe
```

**Pros:**
- Better repo name
- Keep Ralph infrastructure

**Cons:**
- vibe-platform is behind in commits
- More merge conflicts likely
- Have to update Vercel project

---

### Option 3: Keep Both (NOT RECOMMENDED)

**Why you might:**
- vibe = production backend
- vibe-platform = experimental features

**Why this is bad:**
- Confusion: which is canonical?
- Duplicate work: features must be ported manually
- Waste time: sync bugs, missing features

---

## 🎯 My Strong Recommendation

**Go with Option 1: Merge vibe-platform → vibe**

Here's why:
1. `vibe` is already working and deployed
2. `vibe` has more recent, production code
3. Ralph + Observations are just 2 commits to cherry-pick
4. Simpler than reversing the deployment flow

---

## 📋 Detailed Merge Plan (Option 1)

### Phase 1: Backup Everything (5 min)
```bash
# Create a backup branch on both repos
cd ~/vibe-public && git branch backup-jan-10-2026
cd ~/Projects/vibe && git branch backup-jan-10-2026

# Push both backups to GitHub
cd ~/vibe-public && git push origin backup-jan-10-2026
cd ~/Projects/vibe && git push origin backup-jan-10-2026
```

### Phase 2: Audit Unique Files (10 min)
```bash
# List files in vibe-platform that don't exist in vibe
cd ~/Projects/vibe
find . -type f -not -path "*/node_modules/*" -not -path "*/.git/*" > /tmp/platform-files.txt

cd ~/vibe-public
find . -type f -not -path "*/node_modules/*" -not -path "*/.git/*" > /tmp/vibe-files.txt

comm -23 <(sort /tmp/platform-files.txt) <(sort /tmp/vibe-files.txt)
```

**Expected unique files in vibe-platform:**
- `api/observations.js`
- `mcp-server/tools/observe.js`
- `scripts/ralph-*.sh`
- `scripts/ralph-*.js`
- `.github/workflows/ralph.yml`
- `RALPH_*.md`
- `MAINTENANCE_PRD.json`
- `test-observations.js`
- `docs/ECONOMIC_LAYER_*`

### Phase 3: Cherry-Pick Ralph Wiggum (15 min)
```bash
cd ~/vibe-public

# Add vibe-platform as remote
git remote add platform ~/Projects/vibe
git fetch platform

# Cherry-pick Ralph commit
git cherry-pick 7925886

# If conflicts, resolve them
git status
# (Resolve any conflicts in vercel.json or package.json)

# Test
ls scripts/ralph-*.sh  # Should exist now
cat RALPH_READY_TO_SHIP.md  # Should exist
```

### Phase 4: Cherry-Pick Observations API (10 min)
```bash
cd ~/vibe-public

# Cherry-pick observations commit
git cherry-pick b995060

# Test
ls api/observations.js  # Should exist
ls mcp-server/tools/observe.js  # Should exist

# Verify vercel.json updated
grep observations vercel.json
```

### Phase 5: Check for Other Unique Commits (10 min)
```bash
cd ~/vibe-public

# Show commits in vibe-platform not in vibe
git log main..platform/main --oneline

# Review each commit
# Cherry-pick any that look important
```

### Phase 6: Test Everything (20 min)
```bash
cd ~/vibe-public

# Install dependencies
pnpm install

# Run local server
vercel dev

# Test endpoints:
# http://localhost:3000/api/presence
# http://localhost:3000/api/messages
# http://localhost:3000/api/observations
# http://localhost:3000/api/friends
# http://localhost:3000/api/claude-activity

# Test Ralph
./scripts/ralph-status.sh

# Test MCP tools
cat mcp-server/index.js  # Should include vibe_observe
```

### Phase 7: Deploy (5 min)
```bash
cd ~/vibe-public

# Commit the merge
git add -A
git commit -m "Merge vibe-platform features: Ralph Wiggum + Observations API

Cherry-picked:
- 7925886 Ralph Wiggum AIRC Coordination
- b995060 Daily Observations API

vibe is now the canonical repo.
vibe-platform will be archived.

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"

# Push to GitHub
git push origin main

# Deploy to Vercel
vercel --prod

# Test production
curl https://slashvibe.dev/api/observations
curl https://slashvibe.dev/api/friends
```

### Phase 8: Archive vibe-platform (10 min)
```bash
# Archive on GitHub
gh repo archive brightseth/vibe-platform

# Update repo description
gh repo edit brightseth/vibe-platform \
  --description "ARCHIVED: Merged into brightseth/vibe on Jan 10, 2026"

# Rename brightseth/vibe to vibe-platform (optional, for clarity)
gh repo rename brightseth/vibe vibe-platform

# Or keep it as "vibe" (simpler)

# Move local directory
mv ~/vibe-public ~/vibe-platform
mv ~/Projects/vibe ~/vibe-platform-ARCHIVED

# Update CLAUDE.md
# Change all references from ~/vibe-public to ~/vibe-platform
```

### Phase 9: Update Documentation (10 min)
```bash
cd ~/vibe-platform  # (formerly vibe-public)

# Update README
cat > README.md <<'EOF'
# /vibe Platform

**The social layer for Claude Code**

This is the canonical backend repo. Contains:
- All social APIs (messages, presence, friends, profiles)
- Artifacts system
- Daily observations API (AGI self-expression)
- Ralph Wiggum (autonomous maintenance agent)
- MCP server

## Deployed To
- Production: https://slashvibe.dev

## History
- Originally `brightseth/vibe`
- Merged `brightseth/vibe-platform` on Jan 10, 2026
- Now the single source of truth

## Quick Start
\`\`\`bash
pnpm install
vercel dev
\`\`\`

See ENGINEERING_PLAYBOOK.md for architecture.
EOF

# Commit
git add README.md
git commit -m "Update README: now canonical repo after merge"
git push origin main
```

---

## 📊 Summary

### Current Reality
- ❌ Two repos developing in parallel
- ❌ Confusion about which is canonical
- ❌ Features split across repos
- ❌ Both point to same Vercel project (chaos!)

### After Merge (Recommended)
- ✅ ONE canonical repo (vibe → vibe-platform)
- ✅ All features in one place
- ✅ Clear deployment path
- ✅ No more sync issues

---

## ⏱️ Time Estimate

**Total time to merge:** ~90 minutes

- Backup: 5 min
- Audit: 10 min
- Cherry-pick Ralph: 15 min
- Cherry-pick Observations: 10 min
- Review other commits: 10 min
- Test locally: 20 min
- Deploy: 5 min
- Archive old repo: 10 min
- Update docs: 10 min

**Worth it?** Absolutely. This fixes a fundamental architecture problem.

---

## 🚨 Risks

### Low Risk
- Cherry-pick conflicts → Easy to resolve
- Missing a commit → Can always cherry-pick later
- Breaking production → Have backups, can rollback

### How to Mitigate
- ✅ Create backup branches first
- ✅ Test locally before deploying
- ✅ Deploy during low-traffic time
- ✅ Monitor for errors after deploy

---

## 🎯 Decision Time

**Which option do you want?**

- [ ] Option 1: Merge vibe-platform → vibe (RECOMMENDED)
- [ ] Option 2: Merge vibe → vibe-platform
- [ ] Option 3: Keep both (strongly discouraged)

**If Option 1, ready to start the merge?**

---

## 📝 Post-Merge Cleanup

After merge, update:
- [ ] `~/.claude/CLAUDE.md` - Point to new canonical path
- [ ] `~/CLAUDE.md` - Point to new canonical path
- [ ] `vibe-terminal/README.md` - Update API base URL if changed
- [ ] `vibecodings/README.md` - Note which repo is canonical
- [ ] MCP install script - Update repo URL

---

**Ready to fix this?** Let's start with Phase 1 (backups). It's low-risk and reversible.
