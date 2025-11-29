#!/bin/bash

# Unified Deployment Script - Updates Both Monolithic and All Microservices
# This ensures both update together when code changes locally
# Usage: ./scripts/deploy-unified.sh [stage] [region]
# Example: ./scripts/deploy-unified.sh dev ap-south-1

STAGE=${1:-dev}
REGION=${2:-ap-south-1}

echo "🚀 Unified Deployment - Monolithic + All Microservices"
echo "   Stage: $STAGE"
echo "   Region: $REGION"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Step 0: Clean up old zip files from S3
echo "🧹 Step 0: Cleaning up old deployment packages from S3..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

export S3_BUCKET_NAME=${S3_BUCKET_NAME:-'scrapmate-images'}
S3_BUCKET="$S3_BUCKET_NAME"
S3_PREFIX="lambda-deployments/"

# Patterns to match old deployment packages
MONOLITHIC_PATTERN="scrapmate-node-api-${STAGE}-"
MICROSERVICES_PATTERN="scrapmate-microservices-${STAGE}-shared-"

echo "   Bucket: s3://${S3_BUCKET}/${S3_PREFIX}"
echo "   Looking for old packages matching:"
echo "     - ${MONOLITHIC_PATTERN}*.zip"
echo "     - ${MICROSERVICES_PATTERN}*.zip"
echo ""

# List and delete monolithic packages
MONOLITHIC_FILES=$(aws s3 ls "s3://${S3_BUCKET}/${S3_PREFIX}" --region "$REGION" 2>/dev/null | grep "${MONOLITHIC_PATTERN}" | awk '{print $4}')

if [ -n "$MONOLITHIC_FILES" ]; then
    echo "   📦 Found monolithic packages to delete:"
    echo "$MONOLITHIC_FILES" | while read -r file; do
        if [ -n "$file" ]; then
            echo "      - $file"
            aws s3 rm "s3://${S3_BUCKET}/${S3_PREFIX}${file}" --region "$REGION" >/dev/null 2>&1
        fi
    done
    echo "   ✅ Deleted old monolithic packages"
else
    echo "   ℹ️  No old monolithic packages found"
fi

# List and delete microservices shared packages
MICROSERVICES_FILES=$(aws s3 ls "s3://${S3_BUCKET}/${S3_PREFIX}" --region "$REGION" 2>/dev/null | grep "${MICROSERVICES_PATTERN}" | awk '{print $4}')

if [ -n "$MICROSERVICES_FILES" ]; then
    echo "   📦 Found microservices shared packages to delete:"
    echo "$MICROSERVICES_FILES" | while read -r file; do
        if [ -n "$file" ]; then
            echo "      - $file"
            aws s3 rm "s3://${S3_BUCKET}/${S3_PREFIX}${file}" --region "$REGION" >/dev/null 2>&1
        fi
    done
    echo "   ✅ Deleted old microservices shared packages"
else
    echo "   ℹ️  No old microservices shared packages found"
fi

echo ""
echo "✅ S3 cleanup complete"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Step 1: Deploy Monolithic Lambda (handles admin panel and all web routes)
echo "📦 Step 1: Deploying Monolithic Lambda..."
echo "   Function: scrapmate-node-api-${STAGE}"
echo "   Lambda Function URL: https://uodttljjzj3nh3e4cjqardxip40btqef.lambda-url.ap-south-1.on.aws"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
./scripts/deploy-lambda-direct.sh "$STAGE" "$REGION"
MONOLITHIC_EXIT=$?
echo ""

# Step 2: Deploy All Microservices
echo "📦 Step 2: Deploying All Microservices..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
./scripts/deploy-all-services.sh "$STAGE" "$REGION"
MICROSERVICES_EXIT=$?
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ $MONOLITHIC_EXIT -eq 0 ] && [ $MICROSERVICES_EXIT -eq 0 ]; then
    echo "✅ Unified Deployment Complete!"
    echo ""
    echo "📋 Deployed Services:"
    echo "   ✅ Monolithic Lambda (scrapmate-node-api-${STAGE})"
    echo "      - Admin panel routes"
    echo "      - Web panel routes"
    echo "      - All routes from routes/webRoutes.js"
    echo "      - Access via: https://uodttljjzj3nh3e4cjqardxip40btqef.lambda-url.ap-south-1.on.aws"
    echo ""
    echo "   ✅ Microservices:"
    echo "      - Auth service"
    echo "      - Shop service"
    echo "      - Product service"
    echo "      - Order service"
    echo "      - Delivery service"
    echo "      - User service"
    echo "      - Notification service"
    echo "      - Utility service"
    echo "      - Health service"
    echo "      - Web service (non-admin routes only)"
    echo ""
    echo "💡 Note: Admin panel and web routes use Lambda Function URL directly"
    echo "   Microservices routes are in API Gateway"
    exit 0
else
    echo "⚠️  Deployment completed with errors"
    echo "   Monolithic: $([ $MONOLITHIC_EXIT -eq 0 ] && echo '✅' || echo '❌')"
    echo "   Microservices: $([ $MICROSERVICES_EXIT -eq 0 ] && echo '✅' || echo '❌')"
    exit 1
fi

