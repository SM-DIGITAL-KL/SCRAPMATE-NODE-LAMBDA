#!/bin/bash

# Live CloudWatch Logs Tail Script for B2B User
# Usage: ./tail-live-logs.sh [phone_number] [user_id]
# Example: ./tail-live-logs.sh 9074135121
# Example: ./tail-live-logs.sh 9074135121 1766470900497

PHONE_NUMBER=${1:-"9074135121"}
USER_ID=${2:-"1766470900497"}  # B2B user ID for phone 9074135121
LOG_GROUP="/aws/lambda/scrapmate-node-api-dev"
REGION="ap-south-1"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔴 LIVE LOGS - Following CloudWatch Logs"
echo "📋 Phone: $PHONE_NUMBER"
echo "📋 User ID: $USER_ID (B2B User Type R)"
echo "📋 Log Group: $LOG_GROUP"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📺 Following logs in real-time (Press Ctrl+C to stop)..."
echo ""
echo "Filtering for logs containing: $PHONE_NUMBER or user_id $USER_ID"
echo ""

# Use aws logs tail for live logs - filter pattern doesn't support quotes in tail command
# We'll use grep to filter the output
aws logs tail "$LOG_GROUP" \
  --region "$REGION" \
  --follow \
  --format short | grep --line-buffered -E "($PHONE_NUMBER|$USER_ID|acceptPickupRequest|1766470900497)"

