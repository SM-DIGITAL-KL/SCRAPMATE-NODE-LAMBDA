#!/bin/bash

# CloudWatch Logs Query Script for B2B User Order Acceptance Issues
# Usage: 
#   ./check-cloudwatch-logs.sh [phone_number] [hours_back]     # Historical logs
#   ./check-cloudwatch-logs.sh [phone_number] --live           # Live/follow logs
# Example: 
#   ./check-cloudwatch-logs.sh 9074135121 24
#   ./check-cloudwatch-logs.sh 9074135121 --live

PHONE_NUMBER=${1:-"9074135121"}
MODE=${2:-"history"}
HOURS_BACK=${2:-24}
LOG_GROUP="/aws/lambda/scrapmate-node-api-dev"
REGION="ap-south-1"

# Check if live mode requested
if [ "$MODE" = "--live" ] || [ "$MODE" = "-f" ] || [ "$MODE" = "--follow" ]; then
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "🔴 LIVE LOGS - Following CloudWatch Logs"
  echo "📋 User: $PHONE_NUMBER (B2B User Type R)"
  echo "📋 Log Group: $LOG_GROUP"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  echo "📺 Following logs in real-time (Press Ctrl+C to stop)..."
  echo ""
  
  # Use aws logs tail for live logs with filter
  # Filter for logs containing the phone number or acceptPickupRequest
  aws logs tail "$LOG_GROUP" \
    --region "$REGION" \
    --follow \
    --filter-pattern "$PHONE_NUMBER" \
    --format short
  
  exit 0
fi

# Historical logs mode
START_TIME=$(($(date +%s) - ${HOURS_BACK} * 3600))000

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔍 Checking CloudWatch Logs for User: $PHONE_NUMBER"
echo "📋 Log Group: $LOG_GROUP"
echo "⏰ Time Range: Last $HOURS_BACK hour(s)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 1. Search for acceptPickupRequest logs for this phone number
# Note: Numbers must be quoted in CloudWatch filter patterns
echo "📋 1. Searching for acceptPickupRequest logs for phone $PHONE_NUMBER..."
echo ""
aws logs filter-log-events \
  --log-group-name "$LOG_GROUP" \
  --region "$REGION" \
  --start-time "$START_TIME" \
  --filter-pattern "[acceptPickupRequest] \"$PHONE_NUMBER\"" \
  --max-items 100 2>&1 | head -200

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 2. Search for errors related to acceptPickupRequest
echo "❌ 2. Searching for errors related to acceptPickupRequest and phone $PHONE_NUMBER..."
echo ""
aws logs filter-log-events \
  --log-group-name "$LOG_GROUP" \
  --region "$REGION" \
  --start-time "$START_TIME" \
  --filter-pattern "[acceptPickupRequest] error \"$PHONE_NUMBER\"" \
  --max-items 100 2>&1 | head -200

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 3. Search for all logs containing the phone number
echo "📋 3. Searching for all logs containing phone $PHONE_NUMBER..."
echo ""
aws logs filter-log-events \
  --log-group-name "$LOG_GROUP" \
  --region "$REGION" \
  --start-time "$START_TIME" \
  --filter-pattern "\"$PHONE_NUMBER\"" \
  --max-items 200 2>&1 | head -300

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 4. Search for all acceptPickupRequest logs (to see general pattern)
echo "📊 4. Searching for all acceptPickupRequest logs (last 50 entries)..."
echo ""
aws logs filter-log-events \
  --log-group-name "$LOG_GROUP" \
  --region "$REGION" \
  --start-time "$START_TIME" \
  --filter-pattern "[acceptPickupRequest]" \
  --max-items 50 2>&1 | head -150

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Done!"
echo ""
echo "💡 Tip: To see live logs, run: ./check-cloudwatch-logs.sh $PHONE_NUMBER --live"

