#!/bin/bash

# CloudWatch Insights Query Script for DynamoDB GSI Key Error
# Uses CloudWatch Insights for more powerful pattern matching
# Usage: 
#   ./search-dynamodb-gsi-error-insights.sh [hours_back]
# Example: 
#   ./search-dynamodb-gsi-error-insights.sh 48

HOURS_BACK=${1:-48}
LOG_GROUP="/aws/lambda/scrapmate-node-api-dev"
REGION="ap-south-1"

# Calculate start time (hours ago)
START_TIME=$(date -u -v-${HOURS_BACK}H +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -d "${HOURS_BACK} hours ago" +%Y-%m-%dT%H:%M:%SZ)
END_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ)

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔍 CloudWatch Insights Query for DynamoDB GSI Key Error"
echo "📋 Log Group: $LOG_GROUP"
echo "⏰ Time Range: $START_TIME to $END_TIME (Last $HOURS_BACK hours)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Create a temporary query file
QUERY_FILE=$(mktemp)
cat > "$QUERY_FILE" << 'EOF'
fields @timestamp, @message
| filter @message like /secondary index key/i or @message like /one or more parameters/i or @message like /attributevalue/i or @message like /not supported/i
| sort @timestamp desc
| limit 100
EOF

echo "📋 Query 1: Searching for GSI key error patterns..."
echo ""
echo "Query:"
cat "$QUERY_FILE"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Start the query
QUERY_ID=$(aws logs start-query \
  --log-group-name "$LOG_GROUP" \
  --region "$REGION" \
  --start-time $(date -u -j -f "%Y-%m-%dT%H:%M:%SZ" "$START_TIME" +%s 2>/dev/null || date -u -d "$START_TIME" +%s) \
  --end-time $(date -u -j -f "%Y-%m-%dT%H:%M:%SZ" "$END_TIME" +%s 2>/dev/null || date -u -d "$END_TIME" +%s) \
  --query-string "$(cat "$QUERY_FILE")" \
  --output text --query 'queryId' 2>&1)

if [[ $QUERY_ID == *"error"* ]] || [[ -z "$QUERY_ID" ]]; then
  echo "❌ Error starting query. Trying alternative method..."
  echo ""
  echo "Using filter-log-events instead..."
  echo ""
  
  # Fallback to filter-log-events with multiple patterns
  echo "Searching for error patterns..."
  aws logs filter-log-events \
    --log-group-name "$LOG_GROUP" \
    --region "$REGION" \
    --start-time $(($(date +%s) - ${HOURS_BACK} * 3600))000 \
    --filter-pattern "secondary index key" \
    --max-items 50 2>&1
  
else
  echo "✅ Query started. Query ID: $QUERY_ID"
  echo "⏳ Waiting for results (this may take a few seconds)..."
  echo ""
  
  # Wait a bit for query to complete
  sleep 3
  
  # Get query results
  RESULTS=$(aws logs get-query-results \
    --query-id "$QUERY_ID" \
    --region "$REGION" \
    --output json 2>&1)
  
  if echo "$RESULTS" | grep -q "Complete"; then
    echo "$RESULTS" | jq -r '.results[]? | "\(.[0].value) | \(.[1].value)"' 2>/dev/null || echo "$RESULTS"
  else
    echo "⏳ Query still running. Results:"
    echo "$RESULTS" | jq -r '.results[]? | "\(.[0].value) | \(.[1].value)"' 2>/dev/null || echo "$RESULTS"
    echo ""
    echo "💡 Run this command to check results later:"
    echo "   aws logs get-query-results --query-id $QUERY_ID --region $REGION"
  fi
fi

# Cleanup
rm -f "$QUERY_FILE"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Done!"
echo ""
echo "💡 Alternative: Search in AWS Console CloudWatch Insights:"
echo "   1. Go to: https://console.aws.amazon.com/cloudwatch/home?region=$REGION#logsV2:logs-insights"
echo "   2. Select log group: $LOG_GROUP"
echo "   3. Use this query:"
echo ""
echo "   fields @timestamp, @message"
echo "   | filter @message like /secondary index key/i"
echo "   | sort @timestamp desc"
echo "   | limit 100"
echo ""
