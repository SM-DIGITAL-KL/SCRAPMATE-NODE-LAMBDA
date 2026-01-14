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

# Strip quotes from Instamojo credentials if present (from aws.txt)
INSTAMOJO_API_KEY_CLEAN=$(echo "${INSTAMOJO_API_KEY:-}" | sed "s/^[[:space:]]*['\"]//;s/['\"][[:space:]]*$//")
INSTAMOJO_AUTH_TOKEN_CLEAN=$(echo "${INSTAMOJO_AUTH_TOKEN:-}" | sed "s/^[[:space:]]*['\"]//;s/['\"][[:space:]]*$//")
INSTAMOJO_SALT_CLEAN=$(echo "${INSTAMOJO_SALT:-}" | sed "s/^[[:space:]]*['\"]//;s/['\"][[:space:]]*$//")
INSTAMOJO_CLIENT_ID_CLEAN=$(echo "${INSTAMOJO_CLIENT_ID:-}" | sed "s/^[[:space:]]*['\"]//;s/['\"][[:space:]]*$//")
INSTAMOJO_CLIENT_SECRET_CLEAN=$(echo "${INSTAMOJO_CLIENT_SECRET:-}" | sed "s/^[[:space:]]*['\"]//;s/['\"][[:space:]]*$//")

# Debug: Log if credentials are available (first 8 chars only for security)
if [ -n "$INSTAMOJO_API_KEY_CLEAN" ] && [ -n "$INSTAMOJO_AUTH_TOKEN_CLEAN" ]; then
    echo "📋 Instamojo credentials available for environment JSON (API Key: ${INSTAMOJO_API_KEY_CLEAN:0:8}..., Auth Token: ${INSTAMOJO_AUTH_TOKEN_CLEAN:0:8}...)" >&2
else
    echo "⚠️  Warning: Instamojo credentials not available when building environment JSON" >&2
    echo "   INSTAMOJO_API_KEY: ${INSTAMOJO_API_KEY:-EMPTY} (length: ${#INSTAMOJO_API_KEY})" >&2
    echo "   INSTAMOJO_AUTH_TOKEN: ${INSTAMOJO_AUTH_TOKEN:-EMPTY} (length: ${#INSTAMOJO_AUTH_TOKEN})" >&2
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
    --arg instamojo_api_key "$INSTAMOJO_API_KEY_CLEAN" \
    --arg instamojo_auth_token "$INSTAMOJO_AUTH_TOKEN_CLEAN" \
    --arg instamojo_salt "$INSTAMOJO_SALT_CLEAN" \
    --arg instamojo_client_id "$INSTAMOJO_CLIENT_ID_CLEAN" \
    --arg instamojo_client_secret "$INSTAMOJO_CLIENT_SECRET_CLEAN" \
    '{
        "Variables": {
            "NODE_ENV": $node_env,
            "API_KEY": $api_key,
            "SESSION_SECRET": $session_secret,
            "JWT_SECRET": $jwt_secret,
            "S3_BUCKET_NAME": $s3_bucket,
            "REDIS_URL": $redis_url,
            "REDIS_TOKEN": $redis_token,
            "FIREBASE_SERVICE_ACCOUNT": (if $firebase_sa == "" then "" else $firebase_sa end),
            "INSTAMOJO_API_KEY": $instamojo_api_key,
            "INSTAMOJO_AUTH_TOKEN": $instamojo_auth_token,
            "INSTAMOJO_SALT": $instamojo_salt,
            "INSTAMOJO_CLIENT_ID": (if $instamojo_client_id == "" then $instamojo_api_key else $instamojo_client_id end),
            "INSTAMOJO_CLIENT_SECRET": (if $instamojo_client_secret == "" then $instamojo_auth_token else $instamojo_client_secret end),
            "AWS_REGION": "ap-south-1"
        }
    }' > "$OUTPUT_FILE"

echo "$OUTPUT_FILE"

