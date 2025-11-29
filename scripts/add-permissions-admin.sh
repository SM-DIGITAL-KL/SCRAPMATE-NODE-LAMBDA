#!/bin/bash

# Script for AWS Administrator to add required permissions to scrapmate user
# This script requires admin/root AWS credentials
# Usage: ./scripts/add-permissions-admin.sh

USER_NAME="scrapmate"
REGION="ap-south-1"

echo "🔧 Adding Required Permissions to IAM User: $USER_NAME"
echo "⚠️  This script requires AWS Administrator credentials"
echo ""

# Check if running as admin
if ! aws iam get-user --user-name $USER_NAME &>/dev/null; then
    echo "❌ Error: Cannot access IAM. Please ensure you have admin credentials."
    exit 1
fi

echo "✅ Admin access confirmed"
echo ""

# List of required policies
POLICIES=(
    "arn:aws:iam::aws:policy/CloudFormationFullAccess"
    "arn:aws:iam::aws:policy/AWSLambda_FullAccess"
    "arn:aws:iam::aws:policy/AmazonAPIGatewayAdministrator"
    "arn:aws:iam::aws:policy/IAMFullAccess"
    "arn:aws:iam::aws:policy/AmazonSSMFullAccess"
    "arn:aws:iam::aws:policy/AmazonS3FullAccess"
    "arn:aws:iam::aws:policy/AmazonDynamoDBFullAccess"
)

echo "📋 Attaching policies to user: $USER_NAME"
echo ""

for POLICY_ARN in "${POLICIES[@]}"; do
    POLICY_NAME=$(echo $POLICY_ARN | awk -F'/' '{print $NF}')
    echo "   Attaching: $POLICY_NAME"
    
    if aws iam attach-user-policy \
        --user-name $USER_NAME \
        --policy-arn $POLICY_ARN \
        --region $REGION 2>/dev/null; then
        echo "      ✅ Success"
    else
        # Check if already attached
        if aws iam list-attached-user-policies --user-name $USER_NAME --query "AttachedPolicies[?PolicyArn=='$POLICY_ARN']" --output text 2>/dev/null | grep -q "$POLICY_ARN"; then
            echo "      ⏭️  Already attached"
        else
            echo "      ❌ Failed"
        fi
    fi
done

echo ""
echo "✅ Permission setup complete!"
echo ""
echo "📋 Verifying permissions..."
aws iam list-attached-user-policies --user-name $USER_NAME --output table
echo ""
echo "🧪 Testing CloudFormation access..."
if aws cloudformation describe-stacks --region $REGION --max-items 1 &>/dev/null; then
    echo "   ✅ CloudFormation access: OK"
else
    echo "   ⚠️  CloudFormation access: Still failing (may need to wait a few seconds)"
fi

