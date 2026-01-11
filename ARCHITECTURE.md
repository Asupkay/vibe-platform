# /vibe Architecture - Birds Eye View

**Last Updated**: Jan 10, 2026
**Status**: Architecture is fragmented - needs cleanup

---

## The Confusion

You're right to be confused. We have **duplicate repos** and **unclear boundaries**.

## Current Reality (What Actually Exists)

### 1. **slashvibe.dev** (Production Social Platform)
- **Repo**: `~/vibe-public` → github.com/brightseth/vibe
- **Also appears as**: `~/Projects/vibe` (same Vercel project ID!)
- **Purpose**: The canonical /vibe social layer for Claude Code
- **Tech**: Static HTML/JS + Vercel serverless API routes
- **Features**:
  - Messaging (DMs, threads)
  - Presence (who's online)
  - User profiles
  - Artifacts (guide/learning/workspace cards)
  - Games (tic-tac-toe, hangman, crossword, etc.)
- **Storage**: Vercel KV (Redis)

### 2. **vibecodings.vercel.app** (Project Directory)
- **Repo**: `~/Projects/vibecodings` → github.com/brightseth/vibecodings
- **Purpose**: Portfolio of 57 projects built with Claude Code
- **Features**:
  - Project submissions
  - Leaderboard
  - DNA matching
  - Alpha stats
- **Storage**: Vercel KV (Redis) - SHARES same KV store with slashvibe.dev
- **Problem**: Has DUPLICATE API files (messages.js, presence.js, etc.) that we just copied to vibe-public

### 3. **vibe-terminal** (Desktop App)
- **Repo**: `~/vibe-terminal` → github.com/brightseth/vibe-terminal
- **Purpose**: Tauri desktop app - multiplayer terminal with social features
- **Tech**: Rust (Tauri) + React + xterm.js
- **Status**: Working prototype (Jan 9, 2026)
- **Features**:
  - PTY-backed shell
  - Session recording/replay
  - Social features (presence, messaging, watch mode)
  - Games
- **Note**: References vibe-platform for backend/protocol

### 4. **MCP Server** (Local)
- **Location**: `~/.vibe/` (installed via install.sh)
- **Purpose**: Model Context Protocol server for Claude Code integration
- **What it does**: Provides /vibe commands inside Claude Code
- **Config**: Registered in `~/Library/Application Support/Claude/claude_desktop_config.json`

---

## The Problem: What We Just Did

We copied API files from **vibecodings** → **vibe-public** because:
- slashvibe.dev had presence API but was missing messages.js
- vibecodings had working copies of all social APIs
- They share the same Vercel KV store anyway

**This created technical debt**: Now messages.js exists in TWO repos.

---

## What SHOULD the Architecture Be?

You mentioned **vibe-platform** and **vibe-terminal**. Here's what I think you intended:

### Proposed Clean Architecture

```
┌─────────────────────────────────────────────┐
│  slashvibe.dev (Public Website)             │
│  Repo: ~/vibe-public                        │
│  Purpose: Marketing, docs, install script   │
│  Tech: Static HTML                          │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│  vibe-platform (API Backend)                │
│  Repo: ~/Projects/vibe                      │
│  Purpose: All social APIs                   │
│  Tech: Vercel serverless functions          │
│  Deploys: api.slashvibe.dev (?)             │
└─────────────────────────────────────────────┘
                    ↑
        ┌───────────┴───────────┐
        │                       │
┌───────────────┐      ┌────────────────┐
│ vibe-terminal │      │  MCP Server    │
│ (Desktop App) │      │  (~/.vibe/)    │
└───────────────┘      └────────────────┘
```

**The issue**: Right now vibe-public IS ALSO vibe-platform (same Vercel project).

---

## What Needs to Happen (Cleanup Plan)

### Option 1: Merge Everything into vibe-public
- Delete `~/Projects/vibe` (it's a duplicate)
- Keep all APIs in `vibe-public`
- Migrate vibecodings APIs into vibe-public
- Make vibecodings ONLY the portfolio frontend (calls vibe-public APIs)

### Option 2: Separate Platform from Public
- `vibe-public` = Marketing site only (HTML, docs, install.sh)
- `vibe-platform` = All APIs (new Vercel deployment)
- Update vibecodings to call vibe-platform APIs
- Update MCP server to call vibe-platform APIs

### Option 3: Current Reality (What We Have Now)
- `vibe-public` = Everything (website + APIs)
- `vibecodings` = Portfolio + duplicate APIs (sync manually)
- `vibe-terminal` = Desktop app
- `~/Projects/vibe` = Delete or clarify purpose

---

## My Recommendation

**Go with Option 1** - Simplify to two deployments:

1. **slashvibe.dev** (vibe-public)
   - Marketing site
   - ALL social APIs (messages, presence, profile, friends, users)
   - Artifacts
   - Install script

2. **vibecodings.vercel.app** (vibecodings)
   - ONLY portfolio features (projects, stats, leaderboard)
   - Remove duplicate social APIs
   - Call slashvibe.dev APIs instead

3. **vibe-terminal**
   - Desktop app
   - Calls slashvibe.dev APIs

4. **Delete**: `~/Projects/vibe` (it's a confusing duplicate)

---

## Immediate Action Items

1. Document which APIs live where (create API_INVENTORY.md)
2. Decide on Option 1, 2, or 3
3. Remove vibecodings social API duplicates (messages.js, presence.js, etc.)
4. Update vibecodings to call slashvibe.dev endpoints
5. Delete `~/Projects/vibe` if it's truly a duplicate of vibe-public

---

## Questions to Answer

1. Is `~/Projects/vibe` actually different from `~/vibe-public`?
2. Should vibecodings have its own social features, or just be a directory?
3. Do you want vibe-platform as a separate API-only deployment?
4. What's the relationship between vibe-terminal and the web platform?

---

**Next Steps**: Let's audit the repos and decide on a clean architecture.
