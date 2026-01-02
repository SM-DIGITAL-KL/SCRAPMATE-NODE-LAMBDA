#!/bin/bash

# Test FCM Token Save During Login Flow
# This script tests the complete flow: login -> save FCM token -> send notification

API_URL="http://localhost:3000/api/v2"
API_KEY="zyubkfzeumeoviaqzcsrvfwdzbiwnlnn"
PHONE="9074135121"
FCM_TOKEN="test-fcm-token-${PHONE}-$(date +%s)"

echo "🧪 Testing FCM Token Save During Login Flow"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📱 Phone: ${PHONE}"
echo "🔑 FCM Token: ${FCM_TOKEN}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Step 1: Generate OTP
echo "📤 Step 1: Generating OTP..."
OTP_RESPONSE=$(curl -s -X POST "${API_URL}/auth/login" \
  -H "api-key: ${API_KEY}" \
  -H "Content-Type: application/json" \
  -d "{\"phoneNumber\":\"${PHONE}\",\"appType\":\"customer_app\"}")

echo "Response: ${OTP_RESPONSE}"
OTP=$(echo $OTP_RESPONSE | grep -o '"otp":"[^"]*' | cut -d'"' -f4)
echo "✅ OTP: ${OTP}"
echo ""

# Step 2: Verify OTP with FCM token
echo "📤 Step 2: Verifying OTP and saving FCM token..."
LOGIN_RESPONSE=$(curl -s -X POST "${API_URL}/auth/verify-otp" \
  -H "api-key: ${API_KEY}" \
  -H "Content-Type: application/json" \
  -d "{\"phoneNumber\":\"${PHONE}\",\"otp\":\"${OTP}\",\"appType\":\"customer_app\",\"fcm_token\":\"${FCM_TOKEN}\"}")

echo "Response: ${LOGIN_RESPONSE}"
echo ""

# Check if login was successful
if echo "$LOGIN_RESPONSE" | grep -q '"status":"success"'; then
  echo "✅ Login successful! FCM token should be saved."
  echo ""
  
  # Step 3: Test sending notification
  echo "📤 Step 3: Testing notification send..."
  NOTIFICATION_RESPONSE=$(curl -s -X POST "${API_URL}/notifications/send" \
    -H "api-key: ${API_KEY}" \
    -H "Content-Type: application/json" \
    -d "{\"phone_number\":\"${PHONE}\",\"title\":\"Test Notification\",\"body\":\"FCM token was saved during login!\"}")
  
  echo "Response: ${NOTIFICATION_RESPONSE}"
  echo ""
  
  if echo "$NOTIFICATION_RESPONSE" | grep -q '"status":"success"'; then
    echo "🎉 SUCCESS: Notification sent successfully!"
  else
    echo "⚠️  Notification send failed. Check if Firebase Admin SDK is configured."
  fi
else
  echo "❌ Login failed. Check the response above."
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"




