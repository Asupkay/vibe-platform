# Merge + Rename Plan - Final Clean Architecture

**Goal:** Two repos with crystal-clear purposes

---

## 🎯 End State (After We're Done)

```
GitHub:
  brightseth/vibe-platform   → slashvibe.dev (backend APIs)
  brightseth/vibe-terminal   → Desktop app (client)

Local:
  ~/vibe-platform/           → vibe-platform repo
  ~/vibe-terminal/           → vibe-terminal repo

Architecture:
  vibe-platform = Service (APIs, MCP server, backend)
  vibe-terminal = Product (Desktop app, client)
```

**Clean separation:** Platform team vs Product team.

---

## 📋 The Plan (3 Phases)

### Phase 1: Merge vibe-platform → vibe (60 min)
Consolidate all features into one repo.

### Phase 2: Rename vibe → vibe-platform (10 min)
Give it the right name.

### Phase 3: Clean Up (20 min)
Update all references, archive old repo, done.

---

## 🔧 Phase 1: Merge Features (60 min)

### Step 1.1: Backup Everything (5 min)
```bash
# Backup vibe
cd ~/vibe-public
git branch backup-jan-10-2026
git push origin backup-jan-10-2026

# Backup vibe-platform
cd ~/Projects/vibe
git branch backup-jan-10-2026
git push origin backup-jan-10-2026

echo "✅ Backups created. Safe to proceed."
```

### Step 1.2: Add vibe-platform as Remote (2 min)
```bash
cd ~/vibe-public
git remote add platform ~/Projects/vibe
git fetch platform

# Verify
git remote -v
# Should show:
# origin    git@github.com:brightseth/vibe.git
# platform  ~/Projects/vibe
```

### Step 1.3: Review What We're Merging (5 min)
```bash
# Show commits in vibe-platform that aren't in vibe
git log main..platform/main --oneline --no-merges

# Key commits we want:
# 7925886 - Ralph Wiggum (maintenance agent)
# b995060 - Observations API (AGI self-expression)
```

### Step 1.4: Cherry-Pick Ralph Wiggum (15 min)
```bash
cd ~/vibe-public

# Cherry-pick Ralph commit
git cherry-pick 7925886

# If there are conflicts (likely in vercel.json or package.json):
git status
# See conflicted files

# Resolve conflicts:
# - If vercel.json conflicts: keep both rewrites, merge manually
# - If package.json conflicts: keep both dependencies
# - If .gitignore conflicts: keep both entries

# After resolving:
git add .
git cherry-pick --continue

# Verify Ralph files are here:
ls scripts/ralph-*.sh
cat RALPH_READY_TO_SHIP.md
```

### Step 1.5: Cherry-Pick Observations API (15 min)
```bash
cd ~/vibe-public

# Cherry-pick observations commit
git cherry-pick b995060

# If conflicts, resolve same as above
git status
# Fix any conflicts
git add .
git cherry-pick --continue

# Verify:
ls api/observations.js
ls mcp-server/tools/observe.js
grep observations vercel.json
```

### Step 1.6: Check for Other Unique Commits (10 min)
```bash
cd ~/vibe-public

# List all commits in platform not in main
git log main..platform/main --oneline

# Review each one
# Cherry-pick any that look important:
# git cherry-pick <commit-hash>

# Skip any that are:
# - Already in main (different commit hash but same change)
# - Build/config fixes specific to old setup
# - Experimental stuff you don't want
```

### Step 1.7: Test Locally (10 min)
```bash
cd ~/vibe-public

# Install dependencies
pnpm install

# Start dev server
vercel dev

# In browser, test these endpoints:
# http://localhost:3000/api/presence
# http://localhost:3000/api/messages
# http://localhost:3000/api/observations  ← NEW
# http://localhost:3000/api/friends
# http://localhost:3000/api/claude-activity

# Test Ralph:
./scripts/ralph-status.sh

# If everything works:
echo "✅ Merge successful, ready to deploy"
```

### Step 1.8: Commit the Merge (3 min)
```bash
cd ~/vibe-public

git status
# Should show clean working tree

# If there are uncommitted changes from conflict resolution:
git add -A
git commit -m "Complete merge of vibe-platform features

Merged:
- Ralph Wiggum maintenance agent (2543 lines)
- Observations API for AGI self-expression (615 lines)
- Supporting scripts and documentation

vibe now contains all features from both repos.
Next: rename to vibe-platform for clarity.

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"

# Push to GitHub
git push origin main
```

### Step 1.9: Deploy to Verify (5 min)
```bash
cd ~/vibe-public
vercel --prod

# Test production endpoints:
curl https://slashvibe.dev/api/presence | jq .
curl https://slashvibe.dev/api/observations | jq .

# If both work:
echo "✅ Phase 1 complete. All features merged and deployed."
```

---

## 🏷️ Phase 2: Rename vibe → vibe-platform (10 min)

### Step 2.1: Rename on GitHub (2 min)
```bash
# Rename the repo on GitHub
gh repo rename brightseth/vibe vibe-platform

# Verify
gh repo view brightseth/vibe-platform
# Should show: renamed from vibe
```

### Step 2.2: Update Local Remote (3 min)
```bash
cd ~/vibe-public

# Update remote URL
git remote set-url origin git@github.com:brightseth/vibe-platform.git

# Verify
git remote -v
# Should show vibe-platform

# Test
git pull origin main
# Should work
```

### Step 2.3: Rename Local Directory (2 min)
```bash
# Rename the directory
mv ~/vibe-public ~/vibe-platform

# Verify
ls ~/vibe-platform/
cd ~/vibe-platform && pwd
# Should show: /Users/sethstudio1/vibe-platform
```

### Step 2.4: Update Vercel Project Name (3 min)
```bash
cd ~/vibe-platform

# Option A: Via Vercel dashboard
# - Go to vercel.com/sethvibes/vibe-public/settings
# - Change project name to "vibe-platform"

# Option B: Via CLI (simpler)
# Actually, Vercel project name doesn't have to match repo name
# But update .vercel/project.json manually if you want:
# (Not critical, skip if you want)

echo "✅ Repo renamed to vibe-platform"
```

---

## 🧹 Phase 3: Clean Up (20 min)

### Step 3.1: Archive Old vibe-platform Repo (5 min)
```bash
# Archive the old vibe-platform repo on GitHub
gh repo archive brightseth/vibe-platform

# Wait, that name is now taken by the renamed repo!
# The OLD vibe-platform repo still exists at its original URL

# Check what it's actually called after the rename
gh repo list | grep vibe

# If the old vibe-platform is still there, rename it first:
# (GitHub doesn't auto-rename the old one)

# Actually, let's check what happened:
# When you rename vibe → vibe-platform, GitHub creates a redirect
# But the old ~/Projects/vibe repo still points to the OLD remote

# Let me fix this plan...
```

**Wait, I need to clarify the GitHub rename behavior:**

When you rename `vibe` → `vibe-platform`:
- GitHub updates the URL: `brightseth/vibe` redirects to `brightseth/vibe-platform`
- Your old `brightseth/vibe-platform` repo is STILL THERE (unchanged)
- Now you have TWO repos both wanting the name "vibe-platform"!

**Fix:** Rename in the right order:

```bash
# 1. First, rename the OLD vibe-platform to something else
gh repo rename brightseth/vibe-platform vibe-platform-archive

# 2. NOW rename vibe → vibe-platform
gh repo rename brightseth/vibe vibe-platform

# 3. Archive the old one
gh repo archive brightseth/vibe-platform-archive
gh repo edit brightseth/vibe-platform-archive \
  --description "ARCHIVED: Merged into vibe-platform on Jan 10, 2026"
```

### Step 3.2: Clean Up Local Directories (5 min)
```bash
# Rename active repo directory
mv ~/vibe-public ~/vibe-platform

# Move old vibe-platform to archive
mv ~/Projects/vibe ~/Projects/vibe-platform-ARCHIVED

# Or delete it entirely
rm -rf ~/Projects/vibe

# Verify
ls -d ~/vibe* ~/Projects/vibe*
# Should show:
# ~/vibe-platform
# ~/vibe-terminal
# ~/Projects/vibe-platform-ARCHIVED (if you kept it)
```

### Step 3.3: Update CLAUDE.md Files (5 min)
```bash
# Update global CLAUDE.md
code ~/.claude/CLAUDE.md
# Change all references:
# /Users/sethstudio1/vibe-public → /Users/sethstudio1/vibe-platform

# Update project CLAUDE.md
code ~/CLAUDE.md
# Update vibe references

# Or use sed:
sed -i '' 's|vibe-public|vibe-platform|g' ~/.claude/CLAUDE.md
sed -i '' 's|vibe-public|vibe-platform|g' ~/CLAUDE.md
```

### Step 3.4: Update Documentation (5 min)
```bash
cd ~/vibe-platform

# Update README
cat > README.md <<'EOF'
# vibe-platform

**The backend platform for the /vibe social network**

Provides APIs, MCP server, and infrastructure for /vibe.

## What This Repo Does
- Social APIs (messages, presence, friends, profiles, artifacts)
- Daily observations API (AGI self-expression)
- Ralph Wiggum maintenance agent
- MCP server for Claude Code integration

## Companion Repos
- **vibe-terminal** - Desktop client (Tauri app)
- **vibecodings** - Project directory

## Deployed To
- Production: https://slashvibe.dev
- API Docs: https://slashvibe.dev/api/docs

## Tech Stack
- Node.js + TypeScript
- Vercel Serverless Functions
- Vercel KV (Redis)

## Quick Start
\`\`\`bash
pnpm install
vercel dev
\`\`\`

## Architecture
See ENGINEERING_PLAYBOOK.md for full architecture docs.

## History
- Originally \`brightseth/vibe\`
- Merged features from \`brightseth/vibe-platform\` on Jan 10, 2026
- Renamed to \`vibe-platform\` for clarity
- Now the canonical platform/service repo
EOF

# Commit
git add README.md
git commit -m "Update README after repo rename to vibe-platform"
git push origin main
```

### Step 3.5: Update vibe-terminal References (Optional, 5 min)
```bash
cd ~/vibe-terminal

# Check if it references the platform repo
grep -r "brightseth/vibe" .
grep -r "vibe-public" .

# Update any references to point to vibe-platform
# (Probably just in README or docs)

# Update README to reference vibe-platform
sed -i '' 's|brightseth/vibe|brightseth/vibe-platform|g' README.md

git add README.md
git commit -m "Update references: vibe → vibe-platform"
git push origin main
```

---

## ✅ Final Verification Checklist

After all steps:

- [ ] GitHub repos:
  - [ ] `brightseth/vibe-platform` exists and is active
  - [ ] `brightseth/vibe-platform-archive` exists and is archived
  - [ ] `brightseth/vibe-terminal` exists (unchanged)

- [ ] Local directories:
  - [ ] `~/vibe-platform/` exists (renamed from vibe-public)
  - [ ] `~/vibe-terminal/` exists (unchanged)
  - [ ] `~/Projects/vibe/` is gone (deleted or archived)

- [ ] Deployments:
  - [ ] `slashvibe.dev` serves from vibe-platform
  - [ ] All APIs work (messages, presence, observations, friends)
  - [ ] Ralph scripts are present

- [ ] Documentation:
  - [ ] `~/.claude/CLAUDE.md` references vibe-platform
  - [ ] `~/CLAUDE.md` references vibe-platform
  - [ ] `vibe-platform/README.md` updated
  - [ ] `vibe-terminal/README.md` references vibe-platform

---

## 🎯 Summary

**What we're doing:**
1. Merge all features from old vibe-platform → vibe
2. Rename vibe → vibe-platform (the right name!)
3. Archive the old vibe-platform repo
4. Clean up local directories and docs

**Time estimate:** 90 minutes total
- Phase 1 (merge): 60 min
- Phase 2 (rename): 10 min
- Phase 3 (cleanup): 20 min

**Result:** Clean two-repo architecture
- **vibe-platform** = Backend service (APIs, MCP server)
- **vibe-terminal** = Client product (Desktop app)

---

## 🚀 Ready to Start?

**Phase 1 Step 1: Create backups**

This is safe and reversible. Say the word and I'll walk you through each command.
