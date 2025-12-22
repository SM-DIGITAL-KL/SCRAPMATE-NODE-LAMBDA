#!/bin/bash

# Script to convert Firebase service account JSON to environment variable format
# Usage: ./scripts/setup-firebase-env.sh

SERVICE_ACCOUNT_FILE="firebase-service-account.json"

if [ ! -f "$SERVICE_ACCOUNT_FILE" ]; then
    echo "❌ Error: $SERVICE_ACCOUNT_FILE not found"
    echo "   Please copy your Firebase service account JSON file to: $SERVICE_ACCOUNT_FILE"
    exit 1
fi

echo "📋 Converting Firebase service account JSON to environment variable format..."
echo ""

# Convert JSON to single-line and escape quotes
FIREBASE_SERVICE_ACCOUNT=$(cat "$SERVICE_ACCOUNT_FILE" | jq -c .)

if [ -z "$FIREBASE_SERVICE_ACCOUNT" ]; then
    echo "❌ Error: Failed to parse JSON file"
    exit 1
fi

echo "✅ Firebase service account JSON converted successfully"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📝 Add this to your Lambda environment variables:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Key: FIREBASE_SERVICE_ACCOUNT"
echo "Value: (see below)"
echo ""
echo "$FIREBASE_SERVICE_ACCOUNT"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "💡 To set locally for testing:"
echo "   export FIREBASE_SERVICE_ACCOUNT='$FIREBASE_SERVICE_ACCOUNT'"
echo ""

