#!/bin/bash

# Script to cleanup failed CloudFormation stack
# Usage: ./scripts/cleanup-failed-stack.sh [stage]
# Example: ./scripts/cleanup-failed-stack.sh dev

STAGE=${1:-dev}
REGION=${2:-ap-south-1}

echo "🧹 Cleaning up failed CloudFormation stack: scrapmate-node-api-${STAGE}"
echo ""

# Load AWS credentials
if [ -f "aws.txt" ]; then
    export $(grep -E '^export ' aws.txt | sed 's/export //' | xargs)
fi

export AWS_REGION=${AWS_REGION:-$REGION}

echo "📋 Attempting to delete log groups..."
# Try to delete log groups (may fail if no permission, that's ok)
aws logs delete-log-group --log-group-name "/aws/lambda/scrapmate-node-api-${STAGE}-api" 2>/dev/null && echo "   ✅ Deleted log group" || echo "   ⚠️  Could not delete log group (may not exist or no permission)"

echo ""
echo "📋 Attempting to remove stack via Serverless..."
npx serverless remove --stage $STAGE --region $REGION 2>&1 | tail -10

echo ""
echo "💡 If stack removal failed, you can:"
echo "   1. Delete the stack manually via AWS Console:"
echo "      https://ap-south-1.console.aws.amazon.com/cloudformation/home?region=ap-south-1"
echo "   2. Or continue deployment - Serverless may handle it"
echo ""
echo "📋 To continue deployment after cleanup:"
echo "   ./scripts/deploy.sh $STAGE $REGION"

