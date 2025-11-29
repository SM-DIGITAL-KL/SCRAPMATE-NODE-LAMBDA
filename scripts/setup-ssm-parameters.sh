#!/bin/bash

# Script to set up AWS SSM Parameters for Serverless deployment
# Usage: ./scripts/setup-ssm-parameters.sh [stage] [region]
# Example: ./scripts/setup-ssm-parameters.sh dev ap-south-1

STAGE=${1:-dev}
REGION=${2:-ap-south-1}

echo "🔧 Setting up SSM Parameters for stage: $STAGE in region: $REGION"
echo ""

# Check if AWS CLI is configured
if ! aws sts get-caller-identity --region $REGION &>/dev/null; then
    echo "❌ AWS CLI is not configured or credentials are invalid"
    echo "   Please run: aws configure"
    echo "   Or set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY environment variables"
    exit 1
fi

echo "✅ AWS credentials verified"
echo ""

# Read values from aws.txt if it exists
if [ -f "aws.txt" ]; then
    echo "📁 Reading values from aws.txt..."
    source <(grep -E '^export ' aws.txt | sed 's/export //')
fi

# Set parameters
echo "📝 Setting SSM Parameters..."

# API_KEY
if [ -n "$API_KEY" ]; then
    aws ssm put-parameter \
        --name "/scrapmate/$STAGE/API_KEY" \
        --value "$API_KEY" \
        --type "SecureString" \
        --region $REGION \
        --overwrite 2>/dev/null && echo "   ✅ API_KEY" || echo "   ⚠️  API_KEY (may already exist)"
else
    echo "   ⚠️  API_KEY not found in aws.txt, skipping..."
fi

# SESSION_SECRET
SESSION_SECRET_VALUE=${SESSION_SECRET:-"your-session-secret-change-in-production-$(openssl rand -hex 16)"}
aws ssm put-parameter \
    --name "/scrapmate/$STAGE/SESSION_SECRET" \
    --value "$SESSION_SECRET_VALUE" \
    --type "SecureString" \
    --region $REGION \
    --overwrite 2>/dev/null && echo "   ✅ SESSION_SECRET" || echo "   ⚠️  SESSION_SECRET (may already exist)"

# JWT_SECRET
JWT_SECRET_VALUE=${JWT_SECRET:-"your-jwt-secret-change-in-production-$(openssl rand -hex 16)"}
aws ssm put-parameter \
    --name "/scrapmate/$STAGE/JWT_SECRET" \
    --value "$JWT_SECRET_VALUE" \
    --type "SecureString" \
    --region $REGION \
    --overwrite 2>/dev/null && echo "   ✅ JWT_SECRET" || echo "   ⚠️  JWT_SECRET (may already exist)"

# AWS_ACCESS_KEY_ID
if [ -n "$AWS_ACCESS_KEY_ID" ]; then
    aws ssm put-parameter \
        --name "/scrapmate/$STAGE/AWS_ACCESS_KEY_ID" \
        --value "$AWS_ACCESS_KEY_ID" \
        --type "SecureString" \
        --region $REGION \
        --overwrite 2>/dev/null && echo "   ✅ AWS_ACCESS_KEY_ID" || echo "   ⚠️  AWS_ACCESS_KEY_ID (may already exist)"
else
    echo "   ⚠️  AWS_ACCESS_KEY_ID not found in aws.txt, skipping..."
fi

# AWS_SECRET_ACCESS_KEY
if [ -n "$AWS_SECRET_ACCESS_KEY" ]; then
    aws ssm put-parameter \
        --name "/scrapmate/$STAGE/AWS_SECRET_ACCESS_KEY" \
        --value "$AWS_SECRET_ACCESS_KEY" \
        --type "SecureString" \
        --region $REGION \
        --overwrite 2>/dev/null && echo "   ✅ AWS_SECRET_ACCESS_KEY" || echo "   ⚠️  AWS_SECRET_ACCESS_KEY (may already exist)"
else
    echo "   ⚠️  AWS_SECRET_ACCESS_KEY not found in aws.txt, skipping..."
fi

# Optional: REDIS_URL
if [ -n "$REDIS_URL" ]; then
    aws ssm put-parameter \
        --name "/scrapmate/$STAGE/REDIS_URL" \
        --value "$REDIS_URL" \
        --type "SecureString" \
        --region $REGION \
        --overwrite 2>/dev/null && echo "   ✅ REDIS_URL" || echo "   ⚠️  REDIS_URL (may already exist)"
fi

# Optional: REDIS_TOKEN
if [ -n "$REDIS_TOKEN" ]; then
    aws ssm put-parameter \
        --name "/scrapmate/$STAGE/REDIS_TOKEN" \
        --value "$REDIS_TOKEN" \
        --type "SecureString" \
        --region $REGION \
        --overwrite 2>/dev/null && echo "   ✅ REDIS_TOKEN" || echo "   ⚠️  REDIS_TOKEN (may already exist)"
fi

# Optional: S3_BUCKET_NAME
if [ -n "$S3_BUCKET_NAME" ]; then
    aws ssm put-parameter \
        --name "/scrapmate/$STAGE/S3_BUCKET_NAME" \
        --value "$S3_BUCKET_NAME" \
        --type "String" \
        --region $REGION \
        --overwrite 2>/dev/null && echo "   ✅ S3_BUCKET_NAME" || echo "   ⚠️  S3_BUCKET_NAME (may already exist)"
fi

echo ""
echo "✅ SSM Parameters setup complete!"
echo ""
echo "📋 To verify parameters, run:"
echo "   aws ssm get-parameters --names /scrapmate/$STAGE/API_KEY /scrapmate/$STAGE/SESSION_SECRET --region $REGION --with-decryption"
echo ""
echo "📋 To list all parameters, run:"
echo "   aws ssm get-parameters-by-path --path /scrapmate/$STAGE --region $REGION --recursive"

