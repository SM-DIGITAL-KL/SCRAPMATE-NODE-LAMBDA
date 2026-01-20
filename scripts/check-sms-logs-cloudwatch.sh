#!/bin/bash

# CloudWatch Logs Query Script for SMS Notification Issues
# Usage: 
#   ./check-sms-logs-cloudwatch.sh [hours_back]     # Historical logs
#   ./check-sms-logs-cloudwatch.sh --live           # Live/follow logs
# Example: 
#   ./check-sms-logs-cloudwatch.sh 24
#   ./check-sms-logs-cloudwatch.sh --live

MODE=${1:-"history"}
HOURS_BACK=${1:-24}
LOG_GROUP="/aws/lambda/scrapmate-node-api-production"
REGION="ap-south-1"

# Check if live mode requested
if [ "$MODE" = "--live" ] || [ "$MODE" = "-f" ] || [ "$MODE" = "--follow" ]; then
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "🔴 LIVE SMS LOGS - Following CloudWatch Logs"
  echo "📋 Log Group: $LOG_GROUP"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  echo "📺 Following SMS logs in real-time (Press Ctrl+C to stop)..."
  echo ""
  
  # Use aws logs tail for live logs with SMS filter
  aws logs tail "$LOG_GROUP" \
    --region "$REGION" \
    --follow \
    --filter-pattern "[SMS]" \
    --format short
  
  exit 0
fi

# Historical logs mode
START_TIME=$(($(date +%s) - ${HOURS_BACK} * 3600))000

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔍 Checking CloudWatch Logs for SMS Notifications"
echo "📋 Log Group: $LOG_GROUP"
echo "⏰ Time Range: Last $HOURS_BACK hour(s)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 1. Search for SMS notification start logs
echo "📱 1. Searching for SMS notification process start..."
echo "   Looking for: 📱 [SMS] Starting SMS notification process"
echo ""
aws logs filter-log-events \
  --log-group-name "$LOG_GROUP" \
  --region "$REGION" \
  --start-time "$START_TIME" \
  --filter-pattern "[SMS] Starting SMS notification process" \
  --max-items 50 2>&1 | grep -E "(Starting SMS|order|vendor)" | head -100

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 2. Search for individual SMS sending attempts
echo "📱 2. Searching for individual SMS sending attempts..."
echo "   Looking for: 📱 [SMS] Sending SMS to..."
echo ""
aws logs filter-log-events \
  --log-group-name "$LOG_GROUP" \
  --region "$REGION" \
  --start-time "$START_TIME" \
  --filter-pattern "[SMS] Sending SMS to" \
  --max-items 100 2>&1 | grep -E "(Sending SMS|phone|vendor)" | head -150

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 3. Search for successful SMS sends
echo "✅ 3. Searching for successful SMS sends..."
echo "   Looking for: ✅ [SMS] SMS sent successfully"
echo ""
aws logs filter-log-events \
  --log-group-name "$LOG_GROUP" \
  --region "$REGION" \
  --start-time "$START_TIME" \
  --filter-pattern "[SMS] SMS sent successfully" \
  --max-items 100 2>&1 | grep -E "(SMS sent successfully|phone|vendor)" | head -150

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 4. Search for SMS errors
echo "❌ 4. Searching for SMS errors..."
echo "   Looking for: ❌ [SMS ERROR]"
echo ""
aws logs filter-log-events \
  --log-group-name "$LOG_GROUP" \
  --region "$REGION" \
  --start-time "$START_TIME" \
  --filter-pattern "[SMS ERROR]" \
  --max-items 200 2>&1 | grep -E "(SMS ERROR|error|Error|failed|Failed)" | head -200

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 5. Search for SMS API responses
echo "📱 5. Searching for SMS API responses..."
echo "   Looking for: 📱 [SMS] API response"
echo ""
aws logs filter-log-events \
  --log-group-name "$LOG_GROUP" \
  --region "$REGION" \
  --start-time "$START_TIME" \
  --filter-pattern "[SMS] API response" \
  --max-items 100 2>&1 | grep -E "(API response|status|success|failed)" | head -150

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 6. Search for SMS summary
echo "📊 6. Searching for SMS summary..."
echo "   Looking for: 📱 [SMS] Summary"
echo ""
aws logs filter-log-events \
  --log-group-name "$LOG_GROUP" \
  --region "$REGION" \
  --start-time "$START_TIME" \
  --filter-pattern "[SMS] Summary" \
  --max-items 50 2>&1 | grep -E "(Summary|successful|failed|rejected)" | head -100

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 7. Search for all SMS-related logs (comprehensive)
echo "📋 7. All SMS-related logs (comprehensive view)..."
echo ""
aws logs filter-log-events \
  --log-group-name "$LOG_GROUP" \
  --region "$REGION" \
  --start-time "$START_TIME" \
  --filter-pattern "[SMS]" \
  --max-items 200 2>&1 | head -300

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "✅ SMS log check complete!"
echo ""
echo "💡 Tips:"
echo "   - If you see 'Starting SMS notification process' but no 'Sending SMS to', check for errors"
echo "   - If you see 'Sending SMS to' but no 'SMS sent successfully', check API responses"
echo "   - Look for 'SMS ERROR' entries to identify specific issues"
echo "   - Check 'SMS Summary' to see overall success/failure counts"
echo ""
