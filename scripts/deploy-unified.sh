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

# Load AWS credentials
if [ -f "aws.txt" ]; then
    echo "📁 Loading environment variables from aws.txt..."
    source aws.txt 2>/dev/null || {
        export AWS_ACCESS_KEY_ID=$(grep AWS_ACCESS_KEY_ID aws.txt | cut -d'=' -f2 | tr -d '"' | tr -d "'")
        export AWS_SECRET_ACCESS_KEY=$(grep AWS_SECRET_ACCESS_KEY aws.txt | cut -d'=' -f2 | tr -d '"' | tr -d "'")
        export AWS_REGION=$(grep AWS_REGION aws.txt | cut -d'=' -f2 | tr -d '"' | tr -d "'")
    }
fi

# Load from .env if it exists
if [ -f ".env" ]; then
    echo "📁 Loading environment variables from .env..."
    export $(grep -v '^#' .env | xargs)
fi

# Set default values if not set
export AWS_REGION=${AWS_REGION:-$REGION}
export API_KEY=${API_KEY:-'zyubkfzeumeoviaqzcsrvfwdzbiwnlnn'}
export SESSION_SECRET=${SESSION_SECRET:-'scrapmate-session-secret-change-in-production'}
export JWT_SECRET=${JWT_SECRET:-'scrapmate-jwt-secret-change-in-production'}
export S3_BUCKET_NAME=${S3_BUCKET_NAME:-'scrapmate-images'}
export REDIS_URL=${REDIS_URL:-''}
export REDIS_TOKEN=${REDIS_TOKEN:-''}

echo ""

# Step 0: Clean up old zip files from S3
echo "🧹 Step 0: Cleaning up old deployment packages from S3..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

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

# Step 3: Deploy API Gateway Routes (from serverless-microservices.yml)
echo "📦 Step 3: Deploying API Gateway Routes..."
echo "   This will deploy all routes including V2 routes to API Gateway"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if command -v serverless &> /dev/null; then
    echo "   Deploying serverless-microservices.yml..."
    serverless deploy --config serverless-microservices.yml --stage "$STAGE" --region "$REGION"
    API_GATEWAY_EXIT=$?
    if [ $API_GATEWAY_EXIT -eq 0 ]; then
        echo "   ✅ API Gateway routes deployed successfully"
    else
        echo "   ⚠️  API Gateway deployment had issues (exit code: $API_GATEWAY_EXIT)"
    fi
elif command -v npx &> /dev/null; then
    echo "   Deploying serverless-microservices.yml via npx..."
    npx serverless deploy --config serverless-microservices.yml --stage "$STAGE" --region "$REGION"
    API_GATEWAY_EXIT=$?
    if [ $API_GATEWAY_EXIT -eq 0 ]; then
        echo "   ✅ API Gateway routes deployed successfully"
    else
        echo "   ⚠️  API Gateway deployment had issues (exit code: $API_GATEWAY_EXIT)"
    fi
else
    echo "   ⚠️  Serverless Framework not found. Skipping API Gateway deployment."
    echo "   💡 Install with: npm install -g serverless"
    echo "   💡 Or manually add routes using: ./scripts/add-missing-v2-route.sh"
    API_GATEWAY_EXIT=0
fi
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ $MONOLITHIC_EXIT -eq 0 ] && [ $MICROSERVICES_EXIT -eq 0 ] && [ ${API_GATEWAY_EXIT:-0} -eq 0 ]; then
    echo "✅ Unified Deployment Complete!"
    echo ""
    echo "📋 Deployed Services:"
    echo ""
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
    echo "      - Location service"
    echo "      - Health service"
    echo "      - Web service (non-admin routes only)"
    echo ""
    if [ ${API_GATEWAY_EXIT:-0} -eq 0 ]; then
        echo "   ✅ API Gateway Routes:"
        echo "      - All V2 routes configured"
        echo "      - All microservice routes configured"
    else
        echo "   ⚠️  API Gateway Routes:"
        echo "      - Deployment skipped or had issues"
    fi
    echo ""
    echo "💡 Note: Admin panel and web routes use Lambda Function URL directly"
    echo "   Microservices routes are in API Gateway"
    exit 0
else
    echo "⚠️  Deployment completed with errors"
    echo ""
    echo "   Monolithic: $([ $MONOLITHIC_EXIT -eq 0 ] && echo '✅' || echo '❌')"
    echo "   Microservices: $([ $MICROSERVICES_EXIT -eq 0 ] && echo '✅' || echo '❌')"
    echo "   API Gateway: $([ ${API_GATEWAY_EXIT:-0} -eq 0 ] && echo '✅' || echo '❌')"
    echo ""
    echo "💡 Troubleshooting:"
    echo "   - Check AWS credentials are configured"
    echo "   - Verify IAM permissions for Lambda and API Gateway"
    echo "   - Review CloudFormation stack events in AWS Console"
    echo "   - Check Lambda function logs for errors"
    echo ""
    exit 1
fi

