#!/bin/bash

# Live CloudWatch Logs Tail Script for B2B User (User Type R)
# Specifically for user 9074135121 with user_id 1766470900497
# Usage: ./tail-live-b2b-user.sh

PHONE_NUMBER="9074135121"
USER_ID="1766470900497"  # B2B user ID for phone 9074135121
LOG_GROUP="/aws/lambda/scrapmate-node-api-dev"
REGION="ap-south-1"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔴 LIVE LOGS - B2B User (Type R) - Following CloudWatch Logs"
echo "📋 Phone: $PHONE_NUMBER"
echo "📋 User ID: $USER_ID"
echo "📋 Log Group: $LOG_GROUP"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📺 Following logs in real-time (Press Ctrl+C to stop)..."
echo ""
echo "Filtering for:"
echo "  - Phone: $PHONE_NUMBER"
echo "  - User ID: $USER_ID"
echo "  - acceptPickupRequest logs"
echo ""

# Use aws logs tail for live logs and filter with grep
# This shows all logs containing the phone number, user_id, or acceptPickupRequest
aws logs tail "$LOG_GROUP" \
  --region "$REGION" \
  --follow \
  --format short | grep --line-buffered -E "($PHONE_NUMBER|$USER_ID|\[acceptPickupRequest\]|acceptPickupRequest|B2c shijo)"


