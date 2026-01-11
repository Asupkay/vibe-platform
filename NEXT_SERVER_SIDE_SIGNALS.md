# Server-Side Derived Signals - Implementation Guide

**Priority**: Week 1 (Next Session)
**Goal**: Add intelligence layer to platform without changing client
**Philosophy**: Clients send raw events. Server derives proprietary insights.

---

## Overview

The session graph currently stores raw activities. The next layer is **deriving signals** from these activities that reveal HOW developers work with AI.

### What Changes
- ✅ Client: NO changes (already sending activities)
- ✅ Server: Add derivation functions
- ✅ API: Extend GET endpoint to return metrics
- ✅ Storage: Consider caching derived metrics

---

## 1. Dwell Time Calculation

**What it measures**: Time spent on each activity type
**Why it matters**: Long dwell time on "thinking" = uncertainty. Short on "reading" = scanning.

### Implementation

```typescript
// Add to /api/claude-activity.js

function calculateDwellTimes(activities: Activity[]): Record<ActivityType, number> {
  const dwellTimes = {
    reading: 0,
    writing: 0,
    thinking: 0,
    tool: 0,
    suggestion: 0
  };

  for (let i = 0; i < activities.length - 1; i++) {
    const current = activities[i];
    const next = activities[i + 1];
    const duration = next.timestamp - current.timestamp;

    // Ignore gaps > 5 minutes (likely user went afk)
    if (duration < 300000) {
      dwellTimes[current.type] += duration;
    }
  }

  return dwellTimes;
}
```

**Insights to extract**:
- `dwellTimes.thinking > 60000` → User is stuck, needs help
- `dwellTimes.reading < 5000` → User is scanning, not deep reading
- `dwellTimes.writing > 180000` → Deep coding session, in flow

---

## 2. Activity Entropy (Chaos vs Linearity)

**What it measures**: How chaotic vs linear the workflow is
**Why it matters**: Low entropy = focused workflow. High entropy = exploration/uncertainty.

### Implementation

```typescript
function calculateEntropy(activities: Activity[]): number {
  if (activities.length === 0) return 0;

  // Count frequency of each activity type
  const counts = {
    reading: 0,
    writing: 0,
    thinking: 0,
    tool: 0,
    suggestion: 0
  };

  activities.forEach(act => counts[act.type]++);

  // Calculate Shannon entropy
  const total = activities.length;
  let entropy = 0;

  Object.values(counts).forEach(count => {
    if (count > 0) {
      const p = count / total;
      entropy -= p * Math.log2(p);
    }
  });

  // Normalize to 0-1 range (max entropy for 5 types = log2(5) ≈ 2.32)
  return entropy / 2.32;
}
```

**Insights to extract**:
- `entropy < 0.3` → Linear workflow (e.g., read → write → tool repeatedly)
- `entropy > 0.7` → Chaotic exploration (switching between many activities)
- `entropy 0.4-0.6` → Balanced workflow

---

## 3. Retry Loop Detection

**What it measures**: tool → error → tool patterns
**Why it matters**: Indicates friction points, documentation gaps, or difficult problems.

### Implementation

```typescript
function detectRetryLoops(activities: Activity[]): number {
  let retryCount = 0;

  for (let i = 0; i < activities.length - 2; i++) {
    const a = activities[i];
    const b = activities[i + 1];
    const c = activities[i + 2];

    // Pattern: tool → (error detected in content) → tool again within 2 min
    if (
      a.type === 'tool' &&
      (b.type === 'thinking' || b.type === 'reading') &&
      c.type === 'tool' &&
      (c.timestamp - a.timestamp) < 120000 && // within 2 minutes
      (a.content?.includes('error') ||
       a.details?.includes('failed') ||
       b.content?.includes('error'))
    ) {
      retryCount++;
    }
  }

  return retryCount;
}
```

**Insights to extract**:
- `retryCount > 3` → User is stuck in a loop, needs intervention
- `retryCount === 1` → Normal iteration, healthy debugging
- `retryCount === 0` → Either very smooth or user gave up

---

## 4. Abandonment Point Detection

**What it measures**: Last activity type before session ends without success
**Why it matters**: Reveals where users get stuck and quit.

### Implementation

```typescript
function findAbandonmentPoint(activities: Activity[]): {
  activityType: ActivityType | null;
  wasSuccessful: boolean;
  timeSinceLastActivity: number;
} {
  if (activities.length === 0) {
    return { activityType: null, wasSuccessful: false, timeSinceLastActivity: 0 };
  }

  const lastActivity = activities[activities.length - 1];
  const now = Date.now();
  const timeSince = now - lastActivity.timestamp;

  // Heuristic: session "ended" if > 10 min since last activity
  const hasEnded = timeSince > 600000;

  // Heuristic: "successful" if last activity was tool with success indicators
  const wasSuccessful =
    lastActivity.type === 'tool' &&
    (lastActivity.content?.includes('success') ||
     lastActivity.content?.includes('passed') ||
     lastActivity.details?.includes('completed'));

  return {
    activityType: hasEnded ? lastActivity.type : null,
    wasSuccessful,
    timeSinceLastActivity: timeSince
  };
}
```

**Insights to extract**:
- Abandonment after `thinking` → User got stuck planning
- Abandonment after `reading` → Didn't find what they needed
- Abandonment after `tool` (failed) → Hit a blocker

---

## 5. Flow State Detection

**What it measures**: Rhythmic success pattern (write → tool → success → repeat)
**Why it matters**: Indicates productive, focused work vs struggle.

### Implementation

```typescript
function detectFlowState(activities: Activity[]): {
  isInFlow: boolean;
  flowDuration: number;
  flowScore: number; // 0-1
} {
  if (activities.length < 5) {
    return { isInFlow: false, flowDuration: 0, flowScore: 0 };
  }

  // Look for repeating success patterns
  let successfulCycles = 0;
  let totalCycles = 0;
  let flowStart: number | null = null;
  let flowEnd: number | null = null;

  for (let i = 0; i < activities.length - 2; i++) {
    const a = activities[i];
    const b = activities[i + 1];
    const c = activities[i + 2];

    // Pattern: write → tool → (success indication)
    if (
      a.type === 'writing' &&
      b.type === 'tool' &&
      (b.content?.includes('success') ||
       b.content?.includes('passed') ||
       c.type === 'writing') // continuing to write = success
    ) {
      successfulCycles++;
      if (flowStart === null) flowStart = a.timestamp;
      flowEnd = b.timestamp;
    }

    // Count any write → tool cycle
    if (a.type === 'writing' && b.type === 'tool') {
      totalCycles++;
    }
  }

  const flowScore = totalCycles > 0 ? successfulCycles / totalCycles : 0;
  const flowDuration = (flowStart && flowEnd) ? flowEnd - flowStart : 0;

  return {
    isInFlow: flowScore > 0.6, // 60%+ success rate = flow
    flowDuration,
    flowScore
  };
}
```

**Insights to extract**:
- `isInFlow === true` → User is productive, don't interrupt
- `flowScore > 0.8` → Very high productivity, learn from this session
- `flowDuration > 1800000` → 30+ min of flow, exceptional

---

## 6. Similar Sessions (Pattern Matching)

**What it measures**: Find sessions with similar activity patterns
**Why it matters**: Enables "how others solved this" recommendations.

### Implementation

```typescript
function findSimilarSessions(
  currentActivities: Activity[],
  allSessions: Session[]
): string[] {
  // Create activity type sequence for current session
  const currentSequence = currentActivities.map(a => a.type).join('→');

  // Calculate similarity scores
  const scores = allSessions.map(session => {
    const sessionSequence = session.activities.map(a => a.type).join('→');

    // Simple similarity: Levenshtein distance of sequences
    const similarity = 1 - (levenshteinDistance(currentSequence, sessionSequence) /
                            Math.max(currentSequence.length, sessionSequence.length));

    return {
      sessionId: session.id,
      similarity
    };
  });

  // Return top 5 most similar
  return scores
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 5)
    .map(s => s.sessionId);
}

// Helper: Levenshtein distance
function levenshteinDistance(a: string, b: string): number {
  const matrix = [];
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
}
```

---

## 7. Predicted Next Activity

**What it measures**: What activity is likely to come next
**Why it matters**: Enables proactive suggestions, UI optimization.

### Implementation

```typescript
function predictNextActivity(
  activities: Activity[],
  allSessions: Session[]
): { activityType: ActivityType; confidence: number } {
  if (activities.length === 0) {
    return { activityType: 'reading', confidence: 0.5 };
  }

  // Get last 3 activities as context
  const context = activities.slice(-3).map(a => a.type).join('→');

  // Find all sessions with similar context
  const transitions: Record<ActivityType, number> = {
    reading: 0,
    writing: 0,
    thinking: 0,
    tool: 0,
    suggestion: 0
  };

  let totalMatches = 0;

  allSessions.forEach(session => {
    for (let i = 0; i < session.activities.length - 1; i++) {
      const sessionContext = session.activities
        .slice(Math.max(0, i - 2), i + 1)
        .map(a => a.type)
        .join('→');

      if (sessionContext === context) {
        const nextType = session.activities[i + 1].type;
        transitions[nextType]++;
        totalMatches++;
      }
    }
  });

  // Find most common next activity
  if (totalMatches === 0) {
    return { activityType: 'reading', confidence: 0.3 };
  }

  const predictions = Object.entries(transitions)
    .map(([type, count]) => ({
      activityType: type as ActivityType,
      confidence: count / totalMatches
    }))
    .sort((a, b) => b.confidence - a.confidence);

  return predictions[0];
}
```

---

## API Extension

### Add to GET /api/claude-activity

```typescript
// In /api/claude-activity.js

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const { sessions } = req.query;

    if (sessions === 'true') {
      // Fetch all sessions with activities
      const allSessions = await fetchAllSessions();

      // Derive metrics for each session
      const enrichedSessions = allSessions.map(session => ({
        ...session,
        metrics: deriveSessionMetrics(session.activities, allSessions)
      }));

      return res.status(200).json({ sessions: enrichedSessions });
    }

    // ... existing code
  }
}

function deriveSessionMetrics(
  activities: Activity[],
  allSessions: Session[]
): SessionMetrics {
  return {
    // Temporal
    duration: calculateDuration(activities),
    dwellTimes: calculateDwellTimes(activities),

    // Complexity
    entropy: calculateEntropy(activities),
    transitionCount: activities.length - 1,

    // Behavioral
    retryLoops: detectRetryLoops(activities),
    flowState: detectFlowState(activities),
    abandonmentPoint: findAbandonmentPoint(activities),

    // Predictive
    similarSessions: findSimilarSessions(activities, allSessions),
    predictedNext: predictNextActivity(activities, allSessions)
  };
}
```

---

## Testing

### Example Request
```bash
curl 'https://slashvibe.dev/api/claude-activity?sessions=true&handle=seth'
```

### Expected Response
```json
{
  "sessions": [
    {
      "id": "sess_abc123",
      "handle": "@seth",
      "started_at": 1736467200000,
      "ended_at": 1736467920000,
      "activities": [
        { "type": "reading", "content": "src/App.tsx", "timestamp": 1736467200000 },
        { "type": "thinking", "content": "How to add feature", "timestamp": 1736467215000 },
        { "type": "writing", "content": "src/Feature.tsx", "timestamp": 1736467230000 },
        { "type": "tool", "content": "npm build", "timestamp": 1736467300000 },
        { "type": "writing", "content": "src/Feature.tsx", "timestamp": 1736467320000 }
      ],
      "metrics": {
        "duration": 720000,
        "dwellTimes": {
          "reading": 15000,
          "thinking": 15000,
          "writing": 90000,
          "tool": 20000,
          "suggestion": 0
        },
        "entropy": 0.52,
        "transitionCount": 4,
        "retryLoops": 0,
        "flowState": {
          "isInFlow": true,
          "flowDuration": 90000,
          "flowScore": 0.75
        },
        "abandonmentPoint": {
          "activityType": null,
          "wasSuccessful": true,
          "timeSinceLastActivity": 600000
        },
        "similarSessions": ["sess_def456", "sess_ghi789"],
        "predictedNext": {
          "activityType": "tool",
          "confidence": 0.67
        }
      }
    }
  ]
}
```

---

## Performance Considerations

### Caching
```typescript
// Cache derived metrics to avoid recomputation
const metricsCache = new Map<string, SessionMetrics>();

function getCachedMetrics(sessionId: string, activities: Activity[]): SessionMetrics {
  const cacheKey = `${sessionId}:${activities.length}`;

  if (metricsCache.has(cacheKey)) {
    return metricsCache.get(cacheKey)!;
  }

  const metrics = deriveSessionMetrics(activities, allSessions);
  metricsCache.set(cacheKey, metrics);

  return metrics;
}
```

### Rate Limiting
Derived metrics computation is CPU-intensive. Consider:
- Limit `?sessions=true` requests to 10/min
- Cache aggressively
- Compute asynchronously for large datasets

---

## Next Steps

1. **Implement functions** in `/api/claude-activity.js`
2. **Test locally** with mock data
3. **Deploy to production**
4. **Verify** with real sessions
5. **Monitor performance** (computation time, cache hit rate)

Once these signals are live, they become the foundation for:
- Pattern discovery
- Template extraction
- Agent learning
- Workflow recommendations

---

**Status**: Ready to implement
**Estimated time**: 2-3 hours
**Dependencies**: None (uses existing activity data)
