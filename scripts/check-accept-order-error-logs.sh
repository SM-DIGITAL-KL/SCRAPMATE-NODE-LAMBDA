#!/bin/bash

# CloudWatch Logs Query Script for Order Acceptance Errors (Production)
# Usage: ./check-accept-order-error-logs.sh [hours_back]
# Example: ./check-accept-order-error-logs.sh 24

HOURS_BACK=${1:-24}
LOG_GROUP="/aws/lambda/scrapmate-node-api-production"  # Production log group
REGION="ap-south-1"

# Calculate start time (milliseconds since epoch)
START_TIME=$(($(date +%s) - ${HOURS_BACK} * 3600))000

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔍 Checking Production CloudWatch Logs for Order Acceptance Errors"
echo "📋 Log Group: $LOG_GROUP"
echo "⏰ Time Range: Last $HOURS_BACK hour(s)"
echo "🌍 Region: $REGION"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 1. Search for acceptPickupRequest errors
echo "❌ 1. Searching for acceptPickupRequest errors..."
echo ""
aws logs filter-log-events \
  --log-group-name "$LOG_GROUP" \
  --region "$REGION" \
  --start-time "$START_TIME" \
  --filter-pattern "[acceptPickupRequest, ERROR]" \
  --max-items 50 2>&1 | grep -A 10 -B 5 "acceptPickupRequest\|Error\|error\|schema\|backfilling\|ValidationException" | head -100

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 2. Search for schema violation errors
echo "❌ 2. Searching for schema violation / backfilling index errors..."
echo ""
aws logs filter-log-events \
  --log-group-name "$LOG_GROUP" \
  --region "$REGION" \
  --start-time "$START_TIME" \
  --filter-pattern "schema violation OR backfilling index OR ValidationException" \
  --max-items 50 2>&1 | head -150

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 3. Search for all acceptPickupRequest logs (most recent first)
echo "📋 3. Most recent acceptPickupRequest logs (last 20 entries)..."
echo ""
aws logs filter-log-events \
  --log-group-name "$LOG_GROUP" \
  --region "$REGION" \
  --start-time "$START_TIME" \
  --filter-pattern "[acceptPickupRequest]" \
  --max-items 20 2>&1 | grep -E "acceptPickupRequest|Error|error|timestamp|message" | head -80

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 4. Search for GSI-related errors
echo "❌ 4. Searching for GSI-related errors (shop_id, delv_boy_id, index)..."
echo ""
aws logs filter-log-events \
  --log-group-name "$LOG_GROUP" \
  --region "$REGION" \
  --start-time "$START_TIME" \
  --filter-pattern "shop_id-status-index OR delv_boy_id-status-index OR Type mismatch" \
  --max-items 30 2>&1 | head -100

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 5. Get the most recent error log entry
echo "🔴 5. Most recent error log entry (any error)..."
echo ""
aws logs filter-log-events \
  --log-group-name "$LOG_GROUP" \
  --region "$REGION" \
  --start-time "$START_TIME" \
  --filter-pattern "ERROR OR Error OR error OR ❌" \
  --max-items 1 2>&1 | head -50

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Done!"
echo ""
echo "💡 To see more logs, increase hours_back: ./check-accept-order-error-logs.sh 48"
echo "💡 To check a specific log group, modify LOG_GROUP in the script"
