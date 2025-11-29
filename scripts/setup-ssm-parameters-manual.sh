#!/bin/bash

# Manual SSM Parameter Setup Script
# This script sets parameters with explicit values
# Usage: ./scripts/setup-ssm-parameters-manual.sh [stage] [region]

STAGE=${1:-dev}
REGION=${2:-ap-south-1}

echo "🔧 Setting up SSM Parameters manually for stage: $STAGE in region: $REGION"
echo ""

# Set parameters with explicit values
echo "📝 Setting SSM Parameters..."

# API_KEY
aws ssm put-parameter \
    --name "/scrapmate/$STAGE/API_KEY" \
    --value "zyubkfzeumeoviaqzcsrvfwdzbiwnlnn" \
    --type "SecureString" \
    --region $REGION \
    --overwrite 2>/dev/null && echo "   ✅ API_KEY" || echo "   ⚠️  API_KEY (may already exist or error occurred)"

# SESSION_SECRET (generate a random one)
SESSION_SECRET=$(openssl rand -hex 32 2>/dev/null || echo "your-session-secret-change-in-production")
aws ssm put-parameter \
    --name "/scrapmate/$STAGE/SESSION_SECRET" \
    --value "$SESSION_SECRET" \
    --type "SecureString" \
    --region $REGION \
    --overwrite 2>/dev/null && echo "   ✅ SESSION_SECRET" || echo "   ⚠️  SESSION_SECRET (may already exist or error occurred)"

# JWT_SECRET (generate a random one)
JWT_SECRET=$(openssl rand -hex 32 2>/dev/null || echo "your-jwt-secret-change-in-production")
aws ssm put-parameter \
    --name "/scrapmate/$STAGE/JWT_SECRET" \
    --value "$JWT_SECRET" \
    --type "SecureString" \
    --region $REGION \
    --overwrite 2>/dev/null && echo "   ✅ JWT_SECRET" || echo "   ⚠️  JWT_SECRET (may already exist or error occurred)"

# AWS_ACCESS_KEY_ID
aws ssm put-parameter \
    --name "/scrapmate/$STAGE/AWS_ACCESS_KEY_ID" \
    --value "AKIASY6OQMSMLTUQAOTS" \
    --type "SecureString" \
    --region $REGION \
    --overwrite 2>/dev/null && echo "   ✅ AWS_ACCESS_KEY_ID" || echo "   ⚠️  AWS_ACCESS_KEY_ID (may already exist or error occurred)"

# AWS_SECRET_ACCESS_KEY
aws ssm put-parameter \
    --name "/scrapmate/$STAGE/AWS_SECRET_ACCESS_KEY" \
    --value "YGAuzNnlkayiZj/QdJpHnzhaK2W53VwuwFGC/jn8" \
    --type "SecureString" \
    --region $REGION \
    --overwrite 2>/dev/null && echo "   ✅ AWS_SECRET_ACCESS_KEY" || echo "   ⚠️  AWS_SECRET_ACCESS_KEY (may already exist or error occurred)"

echo ""
echo "✅ SSM Parameters setup complete!"
echo ""
echo "📋 To verify, run:"
echo "   aws ssm get-parameters --names /scrapmate/$STAGE/API_KEY /scrapmate/$STAGE/SESSION_SECRET --region $REGION --with-decryption"

