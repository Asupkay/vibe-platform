# Pre-Merge Commit Plan

**Before we merge repos, let's save all active session work**

---

## Step 1: Commit vibe-public Work (5 min)

```bash
cd ~/vibe-public

# Check what we're committing
git status

# Add everything
git add -A

# Commit
git commit -m "Save all active session work before repo merge

Modified APIs:
- api/messages.js, presence.js, profile.js, users.js
- api/artifacts-browse.js, artifacts/[slug].js
- vercel.json, DEPLOYMENT_STATUS.md

New files:
- api/friends.js (social features)
- Planning docs (MERGE_AND_RENAME_PLAN, ENGINEERING_PLAYBOOK, etc.)
- test-session-signals.sh

This captures work from multiple concurrent sessions before:
1. Merging vibe-platform features into vibe
2. Renaming vibe → vibe-platform

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"

# Push to GitHub
git push origin main

echo "✅ vibe-public work committed"
```

---

## Step 2: Commit Projects/vibe Work (5 min)

```bash
cd ~/Projects/vibe

# Check what we're committing
git status

# Add everything
git add -A

# Commit
git commit -m "Save all active session work before repo merge

Major new features (will be merged into vibe):

APIs:
- api/agents/ - Agent management system
- api/genesis/ - Genesis agent creation
- api/payments/ - Payment infrastructure
- api/reputation/ - Reputation system
- api/ping/ - Health checks
- api/lib/db.js, api/migrations/

MCP Tools:
- agent-treasury.js - Agent treasury management
- wallet.js, tip.js - Financial operations
- reputation.js - Reputation tracking
- genesis.js - Agent creation
- ask-expert.js, become-expert.js - Expert system

Infrastructure:
- lib/cdp/ - Coinbase Developer Platform integration
- scripts/migrate.cjs - Database migrations

Documentation:
- ECONOMIC_LAYER.md, ECONOMIC_QUICKSTART.md
- Ralph session notes and tweets

This repo will be:
1. Merged into vibe (features cherry-picked)
2. Archived as vibe-platform-archive
3. vibe renamed to vibe-platform (canonical name)

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"

# Push to GitHub
git push origin main

echo "✅ Projects/vibe work committed"
```

---

## Step 3: Verify Commits (2 min)

```bash
# Check vibe-public
cd ~/vibe-public
git log -1 --oneline
git push origin main  # Ensure it's pushed

# Check Projects/vibe
cd ~/Projects/vibe
git log -1 --oneline
git push origin main  # Ensure it's pushed

echo "✅ All work committed and pushed to GitHub"
```

---

## Step 4: Message Other Sessions

Send this to your other Claude Code sessions:

```
📢 Repo Consolidation Notice

Just committed all your active work to GitHub.

⚠️ PAUSE coding in these directories for ~90 minutes:
- ~/vibe-public
- ~/Projects/vibe

What's happening:
1. Merging features from vibe-platform → vibe
2. Renaming vibe → vibe-platform
3. Archiving old vibe-platform repo

After merge:
- Use ~/vibe-platform (renamed from vibe-public)
- All features will be in one place
- Clean two-repo architecture (platform + terminal)

Will notify when done. Your work is safe on GitHub.
```

---

## Step 5: Now Safe to Merge

Once commits are pushed and sessions notified:
- ✅ All work is saved on GitHub
- ✅ Can safely merge repos
- ✅ If anything goes wrong, can restore from backup branches
- ✅ Other sessions can resume later in ~/vibe-platform

Ready to proceed with MERGE_AND_RENAME_PLAN.md Phase 1.

---

## Emergency Rollback (If Needed)

If something goes wrong during merge:

```bash
# vibe-public: Restore from backup
cd ~/vibe-public
git reset --hard backup-jan-10-2026

# Projects/vibe: Restore from backup
cd ~/Projects/vibe
git reset --hard backup-jan-10-2026
```

All your session work is safe because we committed it first.
