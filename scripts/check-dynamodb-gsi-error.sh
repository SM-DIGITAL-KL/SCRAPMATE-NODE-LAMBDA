#!/bin/bash

# CloudWatch Logs Query Script for DynamoDB GSI Key Error
# Searches for: "one or more parameters value are not valid. a value specified for a secondary index key is not supported"
# Usage: 
#   ./check-dynamodb-gsi-error.sh [hours_back]     # Historical logs
#   ./check-dynamodb-gsi-error.sh --live           # Live/follow logs
# Example: 
#   ./check-dynamodb-gsi-error.sh 24
#   ./check-dynamodb-gsi-error.sh --live

MODE=${1:-"history"}
HOURS_BACK=${1:-24}
LOG_GROUP="/aws/lambda/scrapmate-node-api-dev"
REGION="ap-south-1"

# Check if live mode requested
if [ "$MODE" = "--live" ] || [ "$MODE" = "-f" ] || [ "$MODE" = "--follow" ]; then
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "🔴 LIVE LOGS - Following CloudWatch Logs for DynamoDB GSI Errors"
  echo "📋 Log Group: $LOG_GROUP"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  echo "📺 Following logs in real-time (Press Ctrl+C to stop)..."
  echo ""
  
  # Use aws logs tail for live logs
  aws logs tail "$LOG_GROUP" \
    --region "$REGION" \
    --follow \
    --filter-pattern "secondary index key" \
    --format short
  
  exit 0
fi

# Historical logs mode
START_TIME=$(($(date +%s) - ${HOURS_BACK} * 3600))000

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔍 Checking CloudWatch Logs for DynamoDB GSI Key Error"
echo "📋 Log Group: $LOG_GROUP"
echo "⏰ Time Range: Last $HOURS_BACK hour(s)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 1. Search for the specific error message
echo "❌ 1. Searching for 'secondary index key' error..."
echo ""
aws logs filter-log-events \
  --log-group-name "$LOG_GROUP" \
  --region "$REGION" \
  --start-time "$START_TIME" \
  --filter-pattern "secondary index key" \
  --max-items 100 2>&1 | head -300

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 2. Search for "one or more parameters" error
echo "❌ 2. Searching for 'one or more parameters' error..."
echo ""
aws logs filter-log-events \
  --log-group-name "$LOG_GROUP" \
  --region "$REGION" \
  --start-time "$START_TIME" \
  --filter-pattern "one or more parameters" \
  --max-items 100 2>&1 | head -300

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 3. Search for "attributevalue" (part of the error message)
echo "❌ 3. Searching for 'attributevalue' error..."
echo ""
aws logs filter-log-events \
  --log-group-name "$LOG_GROUP" \
  --region "$REGION" \
  --start-time "$START_TIME" \
  --filter-pattern "attributevalue" \
  --max-items 100 2>&1 | head -300

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 4. Search for DynamoDB Query/Scan errors
echo "❌ 4. Searching for DynamoDB Query/Scan errors..."
echo ""
aws logs filter-log-events \
  --log-group-name "$LOG_GROUP" \
  --region "$REGION" \
  --start-time "$START_TIME" \
  --filter-pattern "QueryCommand ScanCommand" \
  --max-items 100 2>&1 | head -300

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 5. Search for IndexName errors (GSI related)
echo "❌ 5. Searching for IndexName errors..."
echo ""
aws logs filter-log-events \
  --log-group-name "$LOG_GROUP" \
  --region "$REGION" \
  --start-time "$START_TIME" \
  --filter-pattern "IndexName" \
  --max-items 100 2>&1 | head -300

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Done!"
echo ""
echo "💡 Tip: To see live logs, run: ./check-dynamodb-gsi-error.sh --live"
echo ""
echo "📋 Common causes of this error:"
echo "   - Querying GSI with null/undefined key values"
echo "   - Wrong data type for GSI key (string vs number)"
echo "   - Missing required GSI key attributes"
echo "   - Invalid key value format"
echo ""
