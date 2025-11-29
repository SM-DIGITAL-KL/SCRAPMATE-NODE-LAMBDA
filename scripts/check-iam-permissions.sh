#!/bin/bash

# Script to check IAM permissions for the current AWS user
# Usage: ./scripts/check-iam-permissions.sh

echo "🔍 Checking IAM Permissions for AWS User"
echo ""

# Get current user identity
echo "📋 Current AWS Identity:"
aws sts get-caller-identity
echo ""

# Check attached policies
echo "📋 Attached Policies:"
aws iam list-attached-user-policies --user-name scrapmate 2>/dev/null || echo "   ⚠️  Could not list attached policies"
echo ""

# Check inline policies
echo "📋 Inline Policies:"
aws iam list-user-policies --user-name scrapmate 2>/dev/null || echo "   ⚠️  Could not list inline policies"
echo ""

# Check permissions boundary
echo "📋 Permissions Boundary:"
BOUNDARY=$(aws iam get-user --user-name scrapmate --query 'User.PermissionsBoundary.PermissionsBoundaryArn' --output text 2>/dev/null)
if [ "$BOUNDARY" != "None" ] && [ -n "$BOUNDARY" ]; then
    echo "   ⚠️  Permissions Boundary found: $BOUNDARY"
    echo "   This may be restricting CloudFormation access"
    echo "   Contact your AWS administrator to update the boundary"
else
    echo "   ✅ No permissions boundary set"
fi
echo ""

# Test CloudFormation access
echo "🧪 Testing CloudFormation Access:"
if aws cloudformation describe-stacks --region ap-south-1 --max-items 1 &>/dev/null; then
    echo "   ✅ CloudFormation access: OK"
else
    echo "   ❌ CloudFormation access: FAILED"
    echo "   Error: $(aws cloudformation describe-stacks --region ap-south-1 --max-items 1 2>&1 | grep -i error || echo 'Unknown error')"
fi
echo ""

# Test Lambda access
echo "🧪 Testing Lambda Access:"
if aws lambda list-functions --region ap-south-1 --max-items 1 &>/dev/null; then
    echo "   ✅ Lambda access: OK"
else
    echo "   ❌ Lambda access: FAILED"
fi
echo ""

# Test API Gateway access
echo "🧪 Testing API Gateway Access:"
if aws apigatewayv2 get-apis --region ap-south-1 --max-items 1 &>/dev/null; then
    echo "   ✅ API Gateway access: OK"
else
    echo "   ❌ API Gateway access: FAILED"
fi
echo ""

# Test IAM access
echo "🧪 Testing IAM Access:"
if aws iam get-user --user-name scrapmate &>/dev/null; then
    echo "   ✅ IAM access: OK"
else
    echo "   ❌ IAM access: FAILED"
fi
echo ""

echo "📝 Required Permissions:"
echo "   - cloudformation:DescribeStacks"
echo "   - cloudformation:CreateStack"
echo "   - cloudformation:UpdateStack"
echo "   - lambda:CreateFunction"
echo "   - apigateway:POST (for API Gateway)"
echo "   - iam:CreateRole (for Lambda execution role)"
echo ""
echo "💡 Solution:"
echo "   1. Go to AWS Console → IAM → Users → scrapmate"
echo "   2. Add permissions: CloudFormationFullAccess, AWSLambda_FullAccess,"
echo "      AmazonAPIGatewayAdministrator, IAMFullAccess"
echo "   3. If permissions boundary exists, contact AWS administrator"

