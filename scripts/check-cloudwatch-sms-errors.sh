#!/bin/bash

# Script to check AWS CloudWatch logs for SMS errors
# Usage: ./scripts/check-cloudwatch-sms-errors.sh [log-group-name] [hours-ago]
# Example: ./scripts/check-cloudwatch-sms-errors.sh /aws/lambda/scrapmate-api 1

LOG_GROUP_NAME=${1:-"/aws/lambda/scrapmate-api"}
HOURS_AGO=${2:-1}

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔍 Checking AWS CloudWatch Logs for SMS Errors"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Log Group: $LOG_GROUP_NAME"
echo "Time Range: Last $HOURS_AGO hour(s)"
echo ""

# Calculate time range
END_TIME=$(date -u +%s)000
START_TIME=$(($(date -u +%s) - $HOURS_AGO * 3600))000

echo "📅 Time Range:"
echo "   Start: $(date -u -r $(($START_TIME / 1000)))"
echo "   End: $(date -u -r $(($END_TIME / 1000)))"
echo ""

# Check if AWS CLI is available
if ! command -v aws &> /dev/null; then
    echo "❌ AWS CLI not found. Please install AWS CLI first."
    echo "   Visit: https://aws.amazon.com/cli/"
    exit 1
fi

# Search for SMS-related errors
echo "🔍 Searching for SMS errors..."
echo ""

# Search for error patterns
echo "1️⃣  Searching for 'Error sending SMS'..."
aws logs filter-log-events \
    --log-group-name "$LOG_GROUP_NAME" \
    --start-time $START_TIME \
    --end-time $END_TIME \
    --filter-pattern "Error sending SMS" \
    --max-items 50 \
    --output json | jq -r '.events[] | "\(.timestamp | strftime("%Y-%m-%d %H:%M:%S")) - \(.message)"' 2>/dev/null || echo "   No results or jq not installed"

echo ""
echo "2️⃣  Searching for 'SMS API error'..."
aws logs filter-log-events \
    --log-group-name "$LOG_GROUP_NAME" \
    --start-time $START_TIME \
    --end-time $END_TIME \
    --filter-pattern "SMS API error" \
    --max-items 50 \
    --output json | jq -r '.events[] | "\(.timestamp | strftime("%Y-%m-%d %H:%M:%S")) - \(.message)"' 2>/dev/null || echo "   No results or jq not installed"

echo ""
echo "3️⃣  Searching for 'SMS notifications'..."
aws logs filter-log-events \
    --log-group-name "$LOG_GROUP_NAME" \
    --start-time $START_TIME \
    --end-time $END_TIME \
    --filter-pattern "SMS notifications" \
    --max-items 50 \
    --output json | jq -r '.events[] | "\(.timestamp | strftime("%Y-%m-%d %H:%M:%S")) - \(.message)"' 2>/dev/null || echo "   No results or jq not installed"

echo ""
echo "4️⃣  Searching for 'SMS sent successfully'..."
aws logs filter-log-events \
    --log-group-name "$LOG_GROUP_NAME" \
    --start-time $START_TIME \
    --end-time $END_TIME \
    --filter-pattern "SMS sent successfully" \
    --max-items 50 \
    --output json | jq -r '.events[] | "\(.timestamp | strftime("%Y-%m-%d %H:%M:%S")) - \(.message)"' 2>/dev/null || echo "   No results or jq not installed"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "💡 To view logs in AWS Console:"
echo "   1. Go to: https://console.aws.amazon.com/cloudwatch/"
echo "   2. Navigate to: Logs > Log groups > $LOG_GROUP_NAME"
echo "   3. Search for: 'SMS' OR 'sms' OR 'Error sending SMS'"
echo "   4. Filter by time range: Last $HOURS_AGO hour(s)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

