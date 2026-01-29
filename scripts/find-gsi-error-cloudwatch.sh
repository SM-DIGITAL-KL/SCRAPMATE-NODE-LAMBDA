#!/bin/bash

# CloudWatch Insights Query to find the exact GSI error
# Usage: ./find-gsi-error-cloudwatch.sh [hours_back]
# Example: ./find-gsi-error-cloudwatch.sh 72

HOURS_BACK=${1:-72}
LOG_GROUP="/aws/lambda/scrapmate-node-api-dev"
REGION="ap-south-1"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔍 CloudWatch Insights: Finding GSI Empty String Error"
echo "📋 Log Group: $LOG_GROUP"
echo "⏰ Time Range: Last $HOURS_BACK hours"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Calculate time range
START_TIME=$(date -u -v-${HOURS_BACK}H +%s 2>/dev/null || date -u -d "${HOURS_BACK} hours ago" +%s)
END_TIME=$(date -u +%s)

echo "📋 Query 1: Searching for 'empty string value' error..."
echo ""

# Query 1: Search for the exact error message
QUERY1='fields @timestamp, @message
| filter @message like /empty string value/i or @message like /secondary index key/i or @message like /AttributeValue.*empty/i
| sort @timestamp desc
| limit 50'

QUERY_ID1=$(aws logs start-query \
  --log-group-name "$LOG_GROUP" \
  --region "$REGION" \
  --start-time $START_TIME \
  --end-time $END_TIME \
  --query-string "$QUERY1" \
  --output text --query 'queryId' 2>&1)

if [[ $QUERY_ID1 != *"error"* ]] && [[ -n "$QUERY_ID1" ]]; then
  echo "✅ Query 1 started. Query ID: $QUERY_ID1"
  echo "⏳ Waiting 5 seconds for results..."
  sleep 5
  
  RESULTS1=$(aws logs get-query-results --query-id "$QUERY_ID1" --region "$REGION" --output json 2>&1)
  
  if echo "$RESULTS1" | grep -q "Complete"; then
    echo "$RESULTS1" | jq -r '.results[]? | "\(.[0].value) | \(.[1].value)"' 2>/dev/null || echo "$RESULTS1"
  else
    echo "$RESULTS1" | jq -r '.results[]? | "\(.[0].value) | \(.[1].value)"' 2>/dev/null || echo "$RESULTS1"
  fi
else
  echo "❌ Error starting query 1. Trying direct filter..."
  aws logs filter-log-events \
    --log-group-name "$LOG_GROUP" \
    --region "$REGION" \
    --start-time $(($START_TIME * 1000)) \
    --filter-pattern "empty string value" \
    --max-items 30 2>&1 | head -100
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

echo "📋 Query 2: Searching for DynamoDB errors during registration..."
echo ""

# Query 2: Search for errors during registration
QUERY2='fields @timestamp, @message
| filter (@message like /usersRegister/i or @message like /User\.create/i or @message like /register/i) and (@message like /error/i or @message like /Error/i or @message like /❌/i)
| sort @timestamp desc
| limit 50'

QUERY_ID2=$(aws logs start-query \
  --log-group-name "$LOG_GROUP" \
  --region "$REGION" \
  --start-time $START_TIME \
  --end-time $END_TIME \
  --query-string "$QUERY2" \
  --output text --query 'queryId' 2>&1)

if [[ $QUERY_ID2 != *"error"* ]] && [[ -n "$QUERY_ID2" ]]; then
  echo "✅ Query 2 started. Query ID: $QUERY_ID2"
  echo "⏳ Waiting 5 seconds for results..."
  sleep 5
  
  RESULTS2=$(aws logs get-query-results --query-id "$QUERY_ID2" --region "$REGION" --output json 2>&1)
  
  if echo "$RESULTS2" | grep -q "Complete"; then
    echo "$RESULTS2" | jq -r '.results[]? | "\(.[0].value) | \(.[1].value)"' 2>/dev/null || echo "$RESULTS2"
  else
    echo "$RESULTS2" | jq -r '.results[]? | "\(.[0].value) | \(.[1].value)"' 2>/dev/null || echo "$RESULTS2"
  fi
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

echo "📋 Query 3: Searching for all DynamoDB errors..."
echo ""

# Query 3: Search for all DynamoDB-related errors
QUERY3='fields @timestamp, @message
| filter @message like /DynamoDB/i and (@message like /error/i or @message like /Error/i or @message like /❌/i or @message like /ValidationException/i or @message like /not valid/i)
| sort @timestamp desc
| limit 50'

QUERY_ID3=$(aws logs start-query \
  --log-group-name "$LOG_GROUP" \
  --region "$REGION" \
  --start-time $START_TIME \
  --end-time $END_TIME \
  --query-string "$QUERY3" \
  --output text --query 'queryId' 2>&1)

if [[ $QUERY_ID3 != *"error"* ]] && [[ -n "$QUERY_ID3" ]]; then
  echo "✅ Query 3 started. Query ID: $QUERY_ID3"
  echo "⏳ Waiting 5 seconds for results..."
  sleep 5
  
  RESULTS3=$(aws logs get-query-results --query-id "$QUERY_ID3" --region "$REGION" --output json 2>&1)
  
  if echo "$RESULTS3" | grep -q "Complete"; then
    echo "$RESULTS3" | jq -r '.results[]? | "\(.[0].value) | \(.[1].value)"' 2>/dev/null || echo "$RESULTS3"
  else
    echo "$RESULTS3" | jq -r '.results[]? | "\(.[0].value) | \(.[1].value)"' 2>/dev/null || echo "$RESULTS3"
  fi
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Done!"
echo ""
echo "💡 If no results found, try:"
echo "   1. Check if the error occurred more than $HOURS_BACK hours ago"
echo "   2. Check different log groups (microservices, etc.)"
echo "   3. Use AWS Console CloudWatch Insights for more detailed search"
echo ""
