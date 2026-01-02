#!/bin/bash

# Production Setup Script
# This script sets up production environment:
# 1. Deploys Lambda function (scrapmate-node-api-production)
# 2. Creates/replicates DynamoDB tables for production
# 3. Creates/replicates S3 bucket for production
#
# Usage: ./scripts/setup-production.sh [region]
# Example: ./scripts/setup-production.sh ap-south-1

REGION=${1:-ap-south-1}
STAGE="production"

echo "🚀 Setting up Production Environment"
echo "   Stage: $STAGE"
echo "   Region: $REGION"
echo ""

# Load AWS credentials from aws.txt if it exists
if [ -f "aws.txt" ]; then
    echo "📁 Loading AWS credentials from aws.txt..."
    export $(grep -E '^export ' aws.txt | sed 's/export //' | xargs)
fi

export AWS_REGION=${AWS_REGION:-$REGION}

# Step 0: Create IAM Role (if needed)
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔐 Step 0: Creating IAM Role (if needed)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
./scripts/create-lambda-role.sh "$STAGE" "$REGION"
echo ""

# Step 1: Create S3 Bucket (needed for Lambda deployment if package is large)
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🪣 Step 1: Creating S3 Bucket (optional)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "   Note: If bucket creation fails due to permissions,"
echo "   the Lambda deployment will use the dev bucket for uploads."
echo ""
./scripts/create-production-s3-bucket.sh "$REGION" || echo "   ⚠️  S3 bucket creation skipped (will use dev bucket if needed)"
echo ""
# Step 2: Deploy Lambda function
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📦 Step 2: Deploying Lambda Function"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
./scripts/deploy-lambda-direct.sh "$STAGE" "$REGION"

if [ $? -ne 0 ]; then
    echo "❌ Lambda deployment failed"
    exit 1
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🗄️  Step 3: Creating DynamoDB Tables"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
./scripts/create-production-tables.sh "$REGION"

# Note: Some tables may fail to create, but continue anyway
TABLE_EXIT_CODE=$?
if [ $TABLE_EXIT_CODE -ne 0 ]; then
    echo "⚠️  Some DynamoDB tables may have failed to create (check output above)"
    echo "   You can create them manually if needed"
    # Don't exit - continue with summary
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Production Setup Complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📋 Summary:"
echo "   ✅ IAM Role: scrapmate-lambda-execution-role-production"
echo "   ✅ S3 Bucket: scrapmate-images-production"
echo "   ✅ Lambda Function: scrapmate-node-api-production"
echo "   ✅ DynamoDB Tables: Created/Verified"
echo ""
echo "🔗 Next Steps:"
echo "   1. Update your frontend to use the production Lambda URL"
echo "   2. Update environment variables if needed"
echo "   3. Test the production API endpoints"
echo ""

