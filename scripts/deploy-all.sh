#!/bin/bash

# Unified Deployment Script - Deploys Both Monolithic and Microservices
# This ensures both update together when code changes
# Usage: ./scripts/deploy-all.sh [stage] [region]
# Example: ./scripts/deploy-all.sh dev ap-south-1

STAGE=${1:-dev}
REGION=${2:-ap-south-1}

echo "🚀 Unified Deployment - Monolithic + Microservices"
echo "   Stage: $STAGE"
echo "   Region: $REGION"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Step 1: Deploy Monolithic Lambda
echo "📦 Step 1: Deploying Monolithic Lambda..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
./scripts/deploy-lambda-direct.sh "$STAGE" "$REGION"
if [ $? -ne 0 ]; then
    echo "❌ Monolithic deployment failed!"
    exit 1
fi
echo ""

# Step 2: Deploy All Microservices
echo "📦 Step 2: Deploying All Microservices..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
./scripts/deploy-all-services.sh "$STAGE" "$REGION"
if [ $? -ne 0 ]; then
    echo "⚠️  Some microservices deployment failed, but continuing..."
fi
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Unified Deployment Complete!"
echo ""
echo "📋 Deployed:"
echo "   ✅ Monolithic Lambda (scrapmate-node-api-${STAGE})"
echo "   ✅ All Microservices (auth, shop, product, order, delivery, user, notification, utility, health, web)"
echo ""
echo "💡 Note: Admin panel routes are handled by monolithic Lambda"
echo "   Other routes are handled by respective microservices"
echo ""

