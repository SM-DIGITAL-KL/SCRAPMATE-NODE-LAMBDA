#!/bin/bash

# Script to create IAM role for Lambda execution
# Usage: ./scripts/create-lambda-role.sh [stage]
# Note: Requires IAM permissions to create roles

STAGE=${1:-dev}
ROLE_NAME="scrapmate-lambda-execution-role-${STAGE}"

echo "🔐 Creating IAM role for Lambda: $ROLE_NAME"
echo ""

# Load AWS credentials
if [ -f "aws.txt" ]; then
    export $(grep -E '^export ' aws.txt | sed 's/export //' | xargs)
fi

# Trust policy for Lambda
TRUST_POLICY='{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "lambda.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}'

# Permissions policy
PERMISSIONS_POLICY='{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": "arn:aws:logs:*:*:*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:*",
        "s3:*",
        "ssm:GetParameter",
        "ssm:GetParameters"
      ],
      "Resource": "*"
    }
  ]
}'

# Check if role exists
EXISTING_ROLE=$(aws iam get-role --role-name "$ROLE_NAME" 2>/dev/null)

if [ $? -eq 0 ]; then
    echo "✅ Role already exists: $ROLE_NAME"
    ROLE_ARN=$(echo "$EXISTING_ROLE" | grep -o '"Arn":"[^"]*' | cut -d'"' -f4)
    echo "   ARN: $ROLE_ARN"
else
    echo "📝 Creating role..."
    
    # Create role
    aws iam create-role \
        --role-name "$ROLE_NAME" \
        --assume-role-policy-document "$TRUST_POLICY" \
        --output json > /tmp/role-create.json 2>&1
    
    if [ $? -ne 0 ]; then
        echo "❌ Failed to create role"
        cat /tmp/role-create.json
        echo ""
        echo "💡 You may need IAM permissions. Ask your AWS administrator to:"
        echo "   1. Create role: $ROLE_NAME"
        echo "   2. Attach policies: AWSLambdaBasicExecutionRole, AmazonDynamoDBFullAccess, AmazonS3FullAccess"
        exit 1
    fi
    
    ROLE_ARN=$(cat /tmp/role-create.json | python3 -c "import sys, json; print(json.load(sys.stdin)['Role']['Arn'])" 2>/dev/null || cat /tmp/role-create.json | grep -o '"Arn":"[^"]*' | cut -d'"' -f4)
    echo "✅ Role created: $ROLE_ARN"
    
    # Attach basic execution policy
    echo "📋 Attaching execution policy..."
    aws iam attach-role-policy \
        --role-name "$ROLE_NAME" \
        --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole \
        2>/dev/null && echo "   ✅ Basic execution policy attached" || echo "   ⚠️  Could not attach basic policy"
    
    # Attach inline policy for DynamoDB and S3
    echo "📋 Attaching inline policy for DynamoDB and S3..."
    aws iam put-role-policy \
        --role-name "$ROLE_NAME" \
        --policy-name DynamoDBS3Access \
        --policy-document "$PERMISSIONS_POLICY" \
        2>/dev/null && echo "   ✅ Inline policy attached" || echo "   ⚠️  Could not attach inline policy"
    
    echo ""
    echo "✅ Role setup complete!"
fi

echo ""
echo "📋 Role ARN: $ROLE_ARN"
echo ""
echo "💡 Use this ARN when creating Lambda function"
echo "   Or the deploy script will use it automatically"

rm -f /tmp/role-create.json

