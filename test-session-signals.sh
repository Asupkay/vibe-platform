#!/bin/bash

# Test Script for Session Graph Derived Signals
# Tests the intelligence layer: dwell time, entropy, retry loops, abandonment, flow state

API="https://slashvibe.dev/api/claude-activity"
HANDLE="test_user_$(date +%s)"
SESSION_ID="test_session_$(date +%s)"
AUTH_SECRET="${VIBE_AUTH_SECRET:-dev-secret-change-in-production}"

# Generate token (simplified for testing)
TOKEN="${SESSION_ID}.$(echo -n "${SESSION_ID}:${HANDLE}" | openssl dgst -sha256 -hmac "$AUTH_SECRET" -binary | base64 | tr '+/' '-_' | tr -d '=')"

echo "🧪 Testing Session Graph Derived Signals"
echo "=========================================="
echo "Handle: $HANDLE"
echo "Session: $SESSION_ID"
echo ""

# Helper function to send activity
send_activity() {
  local type=$1
  local content=$2
  local details=$3

  curl -s -X POST "$API" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d "{
      \"handle\": \"$HANDLE\",
      \"sessionId\": \"$SESSION_ID\",
      \"type\": \"$type\",
      \"content\": \"$content\",
      \"details\": \"$details\"
    }" > /dev/null

  sleep 0.5  # Small delay between activities
}

echo "📊 Scenario 1: Flow State (Productive Rhythm)"
echo "Expected: flowStateDetected = true, low entropy"
echo "---"
send_activity "reading" "src/App.tsx" "Reading main component"
sleep 1
send_activity "writing" "src/App.tsx" "Adding new feature"
sleep 1
send_activity "tool" "npm test" "Running tests"
sleep 1
send_activity "writing" "src/App.tsx" "Fixing test failure"
sleep 1
send_activity "tool" "npm test" "Tests passing"
echo "✓ Flow state activities sent"
echo ""

# Wait for data to propagate
sleep 2

# Retrieve session metrics
echo "📈 Retrieving Session Metrics..."
echo "---"
RESPONSE=$(curl -s "$API?sessions=true&handle=$HANDLE")

echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"

echo ""
echo "🧪 Scenario 2: Retry Loops (Friction Detection)"
echo "Expected: retryLoops > 0"
echo "---"

# Create a new session for retry loop test
SESSION_ID_2="test_session_retry_$(date +%s)"
TOKEN_2="${SESSION_ID_2}.$(echo -n "${SESSION_ID_2}:${HANDLE}" | openssl dgst -sha256 -hmac "$AUTH_SECRET" -binary | base64 | tr '+/' '-_' | tr -d '=')"

send_retry() {
  local type=$1
  local content=$2
  local details=$3

  curl -s -X POST "$API" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN_2" \
    -d "{
      \"handle\": \"$HANDLE\",
      \"sessionId\": \"$SESSION_ID_2\",
      \"type\": \"$type\",
      \"content\": \"$content\",
      \"details\": \"$details\"
    }" > /dev/null

  sleep 0.5
}

send_retry "tool" "npm build" "Running build"
sleep 2
send_retry "tool" "npm build --fix" "Build failed with error"
sleep 2
send_retry "tool" "npm build --fix" "Retrying after fix"
echo "✓ Retry loop activities sent"
echo ""

sleep 2

echo "📈 Retrieving Updated Session Metrics..."
echo "---"
RESPONSE=$(curl -s "$API?sessions=true&handle=$HANDLE")
echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"

echo ""
echo "🧪 Scenario 3: High Entropy (Chaotic Exploration)"
echo "Expected: entropy > 0.7"
echo "---"

SESSION_ID_3="test_session_chaos_$(date +%s)"
TOKEN_3="${SESSION_ID_3}.$(echo -n "${SESSION_ID_3}:${HANDLE}" | openssl dgst -sha256 -hmac "$AUTH_SECRET" -binary | base64 | tr '+/' '-_' | tr -d '=')"

send_chaos() {
  local type=$1
  local content=$2

  curl -s -X POST "$API" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN_3" \
    -d "{
      \"handle\": \"$HANDLE\",
      \"sessionId\": \"$SESSION_ID_3\",
      \"type\": \"$type\",
      \"content\": \"$content\",
      \"details\": \"Exploring codebase\"
    }" > /dev/null

  sleep 0.3
}

# Mixed activities with no clear pattern
send_chaos "reading" "file1.ts"
send_chaos "thinking" "What should I do"
send_chaos "reading" "file2.ts"
send_chaos "suggestion" "Maybe refactor"
send_chaos "tool" "git status"
send_chaos "thinking" "How does this work"
send_chaos "reading" "file3.ts"
send_chaos "suggestion" "Consider using hooks"
echo "✓ Chaotic exploration activities sent"
echo ""

sleep 2

echo "📈 Final Session Metrics (All 3 Sessions)..."
echo "---"
RESPONSE=$(curl -s "$API?sessions=true&handle=$HANDLE&limit=300")
echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"

echo ""
echo "✅ Test Complete!"
echo ""
echo "Key Metrics to Verify:"
echo "- Session 1: flowStateDetected should be true"
echo "- Session 2: retryLoops should be > 0"
echo "- Session 3: entropy should be > 0.7"
