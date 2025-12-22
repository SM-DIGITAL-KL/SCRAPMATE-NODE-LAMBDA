#!/bin/bash

# Helper script to build environment variables JSON for Lambda
# Usage: ./scripts/build-env-json.sh [output_file]

OUTPUT_FILE=${1:-/tmp/lambda-env.json}

# Load Firebase service account - prioritize vendor app (partner) service account
if [ -z "${FIREBASE_SERVICE_ACCOUNT:-}" ]; then
    if [ -f "scrapmate-partner-android-firebase-adminsdk-fbsvc-709bbce0d4.json" ]; then
        export FIREBASE_SERVICE_ACCOUNT=$(cat scrapmate-partner-android-firebase-adminsdk-fbsvc-709bbce0d4.json | jq -c .)
        echo "📋 Loaded vendor app Firebase service account for environment variables"
    elif [ -f "scrapmate-partner-android-firebase-adminsdk-fbsvc-94a2c243ee.json" ]; then
        export FIREBASE_SERVICE_ACCOUNT=$(cat scrapmate-partner-android-firebase-adminsdk-fbsvc-94a2c243ee.json | jq -c .)
        echo "📋 Loaded vendor app Firebase service account (old) for environment variables"
    elif [ -f "firebase-service-account.json" ]; then
        export FIREBASE_SERVICE_ACCOUNT=$(cat firebase-service-account.json | jq -c .)
        echo "📋 Loaded customer app Firebase service account for environment variables"
    fi
fi

# Build JSON
if [ -n "${FIREBASE_SERVICE_ACCOUNT:-}" ]; then
    # FIREBASE_SERVICE_ACCOUNT is already a JSON string, use it as-is
    FIREBASE_SA_STR="$FIREBASE_SERVICE_ACCOUNT"
else
    FIREBASE_SA_STR=""
fi

jq -n \
    --arg node_env "production" \
    --arg api_key "${API_KEY:-zyubkfzeumeoviaqzcsrvfwdzbiwnlnn}" \
    --arg session_secret "${SESSION_SECRET:-scrapmate-session-secret-change-in-production}" \
    --arg jwt_secret "${JWT_SECRET:-scrapmate-jwt-secret-change-in-production}" \
    --arg s3_bucket "${S3_BUCKET_NAME:-scrapmate-images}" \
    --arg redis_url "${REDIS_URL:-}" \
    --arg redis_token "${REDIS_TOKEN:-}" \
    --arg firebase_sa "$FIREBASE_SA_STR" \
    '{
        "Variables": {
            "NODE_ENV": $node_env,
            "API_KEY": $api_key,
            "SESSION_SECRET": $session_secret,
            "JWT_SECRET": $jwt_secret,
            "S3_BUCKET_NAME": $s3_bucket,
            "REDIS_URL": $redis_url,
            "REDIS_TOKEN": $redis_token,
            "FIREBASE_SERVICE_ACCOUNT": (if $firebase_sa == "" then "" else $firebase_sa end)
        }
    }' > "$OUTPUT_FILE"

echo "$OUTPUT_FILE"

