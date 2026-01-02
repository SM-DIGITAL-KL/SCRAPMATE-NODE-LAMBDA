#!/bin/bash

# Create IAM Role for Lambda Execution
# Usage: ./scripts/create-lambda-role.sh [stage] [region]
# Example: ./scripts/create-lambda-role.sh production ap-south-1

STAGE=${1:-dev}
REGION=${2:-ap-south-1}
ROLE_NAME="scrapmate-lambda-execution-role-${STAGE}"

echo "🔐 Creating IAM Role for Lambda"
echo "   Role Name: $ROLE_NAME"
echo "   Stage: $STAGE"
echo "   Region: $REGION"
echo ""

# Load AWS credentials
if [ -f "aws.txt" ]; then
    export $(grep -E '^export ' aws.txt | sed 's/export //' | xargs)
fi

export AWS_REGION=${AWS_REGION:-$REGION}

# Check if role already exists
echo "📋 Checking if role exists..."
ROLE_EXISTS=$(aws iam get-role --role-name "$ROLE_NAME" 2>/dev/null)

if [ $? -eq 0 ]; then
    ROLE_ARN=$(echo "$ROLE_EXISTS" | python3 -c "import sys, json; print(json.load(sys.stdin).get('Role', {}).get('Arn', ''))" 2>/dev/null || echo "")
    echo "✅ Role '$ROLE_NAME' already exists"
    echo "   ARN: $ROLE_ARN"
    echo ""
    echo "📋 Checking attached policies..."
    aws iam list-attached-role-policies --role-name "$ROLE_NAME" 2>/dev/null
    echo ""
    echo "✅ Role is ready to use"
    exit 0
fi

echo "📝 Creating role '$ROLE_NAME'..."

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

# Create role
aws iam create-role \
    --role-name "$ROLE_NAME" \
    --assume-role-policy-document "$TRUST_POLICY" \
    --description "Execution role for ScrapMate Lambda function (${STAGE})" \
    > /tmp/iam-create-role-${ROLE_NAME}.json 2>&1

if [ $? -ne 0 ]; then
    ERROR_MSG=$(cat /tmp/iam-create-role-${ROLE_NAME}.json 2>/dev/null)
    if echo "$ERROR_MSG" | grep -q "EntityAlreadyExists"; then
        echo "✅ Role '$ROLE_NAME' already exists"
        ROLE_ARN=$(aws iam get-role --role-name "$ROLE_NAME" --query 'Role.Arn' --output text 2>/dev/null)
        echo "   ARN: $ROLE_ARN"
    else
        echo "❌ Failed to create role"
        echo "   Error: $ERROR_MSG"
        rm -f /tmp/iam-create-role-${ROLE_NAME}.json
        exit 1
    fi
else
    ROLE_ARN=$(cat /tmp/iam-create-role-${ROLE_NAME}.json | python3 -c "import sys, json; print(json.load(sys.stdin).get('Role', {}).get('Arn', ''))" 2>/dev/null || echo "")
    echo "✅ Role created successfully"
    echo "   ARN: $ROLE_ARN"
fi

rm -f /tmp/iam-create-role-${ROLE_NAME}.json

# Attach AWS managed policy for basic Lambda execution
echo ""
echo "📋 Attaching AWS managed policies..."

# Basic Lambda execution (CloudWatch Logs)
aws iam attach-role-policy \
    --role-name "$ROLE_NAME" \
    --policy-arn "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole" \
    > /tmp/iam-attach-basic.json 2>&1

if [ $? -eq 0 ]; then
    echo "   ✅ Attached AWSLambdaBasicExecutionRole"
else
    echo "   ⚠️  Warning: Could not attach AWSLambdaBasicExecutionRole"
fi

# Attach inline policy for DynamoDB, S3, and other permissions
echo ""
echo "📋 Creating inline policy for DynamoDB, S3, and other permissions..."

INLINE_POLICY='{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:*"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:*"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "ssm:GetParameter",
        "ssm:GetParameters",
        "ssm:GetParametersByPath"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "secretsmanager:GetSecretValue"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "lambda:InvokeFunction"
      ],
      "Resource": "*"
    }
  ]
}'

aws iam put-role-policy \
    --role-name "$ROLE_NAME" \
    --policy-name "ScrapMateLambdaInlinePolicy" \
    --policy-document "$INLINE_POLICY" \
    > /tmp/iam-put-policy.json 2>&1

if [ $? -eq 0 ]; then
    echo "   ✅ Created inline policy: ScrapMateLambdaInlinePolicy"
else
    echo "   ⚠️  Warning: Could not create inline policy"
    cat /tmp/iam-put-policy.json
fi

rm -f /tmp/iam-*.json

echo ""
echo "✅ IAM Role Setup Complete!"
echo ""
echo "📋 Role Details:"
echo "   Name: $ROLE_NAME"
echo "   ARN: $ROLE_ARN"
echo ""
echo "💡 You can now deploy Lambda functions using this role"
echo ""

