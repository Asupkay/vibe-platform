# Economic Layer - Quick Start Guide

Fast track to testing the complete /vibe economic system

---

## 🚀 Setup (5 minutes)

### 1. Environment Variables

Add to `.env.local`:

```bash
# Already set:
X402_CONTRACT_ADDRESS=0xdaFEE9f41DA868701B4C2cC9d4d886D31E26084B
ESCROW_CONTRACT_ADDRESS=0x09E07C314536c0c13fDA2C3605c4092A88953EA9
USDC_ADDRESS=0x036CbD53842c5426634e7929541eC2318f3dCF7e
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org

# CDP API keys (already set):
CDP_API_KEY_NAME=...
CDP_API_KEY_PRIVATE_KEY=...

# Database (already set):
POSTGRES_DATABASE_URL=postgresql://...
```

### 2. Install Dependencies

```bash
npm install
# Already installed: ethers@6, pg, @neondatabase/serverless
```

### 3. Run Migrations

```bash
# All 6 migrations already run:
✓ 002-transaction-tracking.sql
✓ 003-agent-treasuries.sql
✓ 004-expert-marketplace.sql
✓ 005-liquidity-mining.sql
✓ 006-reputation-system.sql
```

---

## 🧪 Testing Flow (30 minutes)

### Step 1: Create Test Users

```bash
# In /vibe MCP
vibe init @alice
vibe init @bob
vibe init @vibebot

# Create wallets for each
# (via existing vibe wallet creation flow)
```

### Step 2: Fund Wallets with Test USDC

```bash
# Get Base Sepolia USDC from faucet:
# https://faucet.circle.com/

# Or use Alchemy faucet + swap to USDC:
# https://www.alchemy.com/faucets/base-sepolia

# Target: $100 per test wallet
```

### Step 3: Test Payment Layer

```bash
# Alice tips Bob
vibe_tip @bob 5 "thanks for the intro"

# Check wallet
vibe_wallet

# View transaction history
curl https://vibecodings.vercel.app/api/payments/history?handle=@alice
```

### Step 4: Test Expert Marketplace

```bash
# Bob registers as expert
vibe_become_expert \
  skills:["blockchain","smart-contracts","solidity"] \
  bio:"5 years Ethereum development" \
  hourly_rate:100

# Alice asks question
vibe_ask_expert \
  "How do I optimize gas costs in my smart contract?" \
  budget:50

# Bob answers (via DM), Alice completes
curl -X POST https://vibecodings.vercel.app/api/ping/complete \
  -d '{"session_id":"sess_...", "from":"@alice", "rating":5}'
```

### Step 5: Test Genesis Liquidity

```bash
# Alice deposits for yield
vibe_genesis deposit 100 lock_days:90

# Check rewards after 1 day
vibe_genesis rewards

# View global stats
vibe_genesis stats
```

### Step 6: Test Agent Economics

```bash
# Vibebot creates treasury
vibe_agent_treasury create daily_budget:10

# Vibebot earns commission (simulated)
curl -X POST https://vibecodings.vercel.app/api/agents/wallet/earn \
  -d '{
    "agent_handle":"@vibebot",
    "earning_type":"commission",
    "amount":2.50,
    "source_handle":"@alice"
  }'

# Check treasury
vibe_agent_treasury balance

# View leaderboard
vibe_agent_treasury leaderboard
```

### Step 7: Test Reputation System

```bash
# Award reputation for actions
curl -X POST https://vibecodings.vercel.app/api/reputation/award \
  -d '{
    "handle":"@alice",
    "event_type":"tip_sent",
    "dimension":"economic",
    "points":5
  }'

# Check reputation
vibe_reputation

# View leaderboard
vibe_reputation leaderboard dimension:overall
```

---

## 🔍 API Testing Cheat Sheet

### Payments

```bash
# Tip
POST /api/payments/tip
{
  "from": "@alice",
  "to": "@bob",
  "amount": 5,
  "message": "thanks!"
}

# Create escrow
POST /api/payments/escrow
{
  "from": "@alice",
  "to": "@bob",
  "amount": 50,
  "description": "WebSocket help"
}

# Complete escrow
POST /api/payments/complete
{
  "escrow_id": "0x...",
  "from": "@alice"
}

# History
GET /api/payments/history?handle=@alice&limit=20
```

### Expert Marketplace

```bash
# Register expert
POST /api/ping/expert/register
{
  "handle": "@bob",
  "skills": ["blockchain", "solidity"],
  "hourly_rate": 100
}

# Match expert
POST /api/ping/match
{
  "question": "How do I optimize gas?",
  "budget": 50
}

# Ask question
POST /api/ping/ask
{
  "from": "@alice",
  "question": "How do I optimize gas?",
  "budget": 50
}

# Complete session
POST /api/ping/complete
{
  "session_id": "sess_...",
  "from": "@alice",
  "rating": 5
}
```

### Genesis

```bash
# Deposit
POST /api/genesis/deposit
{
  "from": "@alice",
  "amount": 100,
  "lock_days": 90
}

# Rewards
GET /api/genesis/rewards?handle=@alice

# Stats
GET /api/genesis/stats
```

### Reputation

```bash
# Award points
POST /api/reputation/award
{
  "handle": "@alice",
  "event_type": "expert_session_completed",
  "dimension": "expert",
  "points": 50
}

# Get score
GET /api/reputation/score?handle=@alice

# Leaderboard
GET /api/reputation/leaderboard?dimension=overall&limit=20
```

### Agent Treasury

```bash
# Create
POST /api/agents/wallet/create
{
  "agent_handle": "@vibebot",
  "daily_budget": 10
}

# Earn
POST /api/agents/wallet/earn
{
  "agent_handle": "@vibebot",
  "earning_type": "commission",
  "amount": 2.50
}

# Treasury
GET /api/agents/wallet/treasury?agent_handle=@vibebot

# Leaderboard
GET /api/agents/leaderboard?metric=balance&limit=20
```

---

## 🐛 Debugging

### Check Database

```bash
# Connect to Neon
psql $POSTGRES_DATABASE_URL

# Check tables
\dt

# View recent transactions
SELECT * FROM wallet_events ORDER BY created_at DESC LIMIT 10;

# Check agent treasuries
SELECT * FROM agent_treasuries;

# View reputation scores
SELECT * FROM reputation_scores ORDER BY overall_score DESC;
```

### Monitor Blockchain

```bash
# View transaction on Basescan
https://sepolia.basescan.org/tx/0x...

# Check contract
https://sepolia.basescan.org/address/0xdaFEE9f41DA868701B4C2cC9d4d886D31E26084B
```

### Logs

```bash
# Vercel logs
vercel logs

# Local testing
npm run dev
```

---

## ✅ Success Checklist

- [ ] All 6 migrations run successfully
- [ ] 3 test users created with wallets
- [ ] Wallets funded with Base Sepolia USDC
- [ ] Tip sent and confirmed on blockchain
- [ ] Escrow created, completed, funds released
- [ ] Expert registered and matched to question
- [ ] Genesis deposit earning rewards
- [ ] Agent treasury created and accumulating
- [ ] Reputation points awarded and tier calculated
- [ ] All MCP tools working in Claude Code

---

## 🚢 Deploy to Production

When ready to ship:

1. **Deploy Contracts to Base Mainnet**
   ```bash
   cd contracts
   npx hardhat run scripts/deploy.js --network base-mainnet
   ```

2. **Update Environment Variables**
   - Production contract addresses
   - Mainnet USDC address
   - Production RPC URL

3. **Deploy to Vercel**
   ```bash
   vercel --prod
   ```

4. **Initialize Genesis Phase**
   - Seed initial liquidity
   - Set base APY
   - Initialize daily stats

5. **Monitor & Iterate**
   - Track transaction success rate
   - Monitor gas costs
   - Adjust fees if needed
   - Add background workers

---

## 💡 Tips

- **Gas Costs**: Base L2 is ~100x cheaper than mainnet
- **Confirmations**: ~2-3 seconds on Base
- **USDC Decimals**: Always 6 (not 18 like ETH)
- **Session Keys**: Store encrypted, rotate regularly
- **Rate Limits**: 10 tips/hour, 5 escrows/hour per user
- **Minimum Amounts**: $0.01 tips, $5 escrow, $10 Genesis

---

**The economic layer is ready. Time to make money flow. 💰**
