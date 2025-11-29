#!/bin/bash

# Deploy utility service to Lambda
# Usage: ./scripts/deploy-utility.sh [stage] [region]

STAGE=${1:-dev}
REGION=${2:-ap-south-1}
FUNCTION_PREFIX="scrapmate-ms-${STAGE}"
FUNCTION_NAME="${FUNCTION_PREFIX}-utility"

echo "🚀 Deploying Utility Service"
echo "   Function: $FUNCTION_NAME"
echo "   Region: $REGION"
echo ""

# Load AWS credentials
if [ -f "aws.txt" ]; then
    source aws.txt 2>/dev/null || {
        export AWS_ACCESS_KEY_ID=$(grep AWS_ACCESS_KEY_ID aws.txt | cut -d'=' -f2 | tr -d '"' | tr -d "'")
        export AWS_SECRET_ACCESS_KEY=$(grep AWS_SECRET_ACCESS_KEY aws.txt | cut -d'=' -f2 | tr -d '"' | tr -d "'")
        export AWS_REGION=$(grep AWS_REGION aws.txt | cut -d'=' -f2 | tr -d '"' | tr -d "'")
    }
fi

export AWS_REGION=${AWS_REGION:-$REGION}

# Get IAM role ARN
ROLE_NAME="scrapmate-lambda-execution-role-${STAGE}"
ROLE_ARN=$(aws iam get-role --role-name "$ROLE_NAME" --query 'Role.Arn' --output text 2>/dev/null)

if [ -z "$ROLE_ARN" ] || [ "$ROLE_ARN" == "None" ]; then
    ACCOUNT_ID=$(aws sts get-caller-identity --query 'Account' --output text 2>/dev/null)
    if [ -n "$ACCOUNT_ID" ] && [ "$ACCOUNT_ID" != "None" ]; then
        ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/${ROLE_NAME}"
        echo "⚠️  Using assumed role: $ROLE_ARN"
    else
        echo "❌ IAM role not found. Create it first: ./scripts/create-lambda-role.sh $STAGE"
        exit 1
    fi
fi

# Create deployment package
echo "📦 Creating deployment package..."
ZIP_FILE="/tmp/${FUNCTION_NAME}-$(date +%s).zip"

zip -r "$ZIP_FILE" . \
    -x "*.git*" \
    -x "node_modules/.cache/*" \
    -x "*.md" \
    -x "*.txt" \
    -x ".env*" \
    -x "aws.txt" \
    -x "scripts/*" \
    -x "dist/*" \
    -x ".DS_Store" \
    -x "test-*.js" \
    -x "Postman_*.json" \
    -x "nginx.conf" \
    -x "nodemon.json" >/dev/null 2>&1

PACKAGE_SIZE=$(du -h "$ZIP_FILE" | cut -f1)
echo "✅ Package created: $ZIP_FILE ($PACKAGE_SIZE)"

# Upload to S3 if package is large (>50MB)
PACKAGE_SIZE_BYTES=$(stat -f%z "$ZIP_FILE" 2>/dev/null || stat -c%s "$ZIP_FILE" 2>/dev/null)
if [ "$PACKAGE_SIZE_BYTES" -gt 52428800 ]; then
    echo "📤 Uploading to S3 (package > 50MB)..."
    BUCKET="scrapmate-images"
    S3_KEY="lambda-deployments/${FUNCTION_NAME}-$(date +%s).zip"
    aws s3 cp "$ZIP_FILE" "s3://${BUCKET}/${S3_KEY}" --region "$REGION" >/dev/null 2>&1
    echo "✅ Uploaded to s3://${BUCKET}/${S3_KEY}"
    
    # Update function code from S3
    aws lambda update-function-code \
        --function-name "$FUNCTION_NAME" \
        --s3-bucket "$BUCKET" \
        --s3-key "$S3_KEY" \
        --region "$REGION" >/dev/null 2>&1
else
    # Update function code directly
    aws lambda update-function-code \
        --function-name "$FUNCTION_NAME" \
        --zip-file "fileb://$ZIP_FILE" \
        --region "$REGION" >/dev/null 2>&1
fi

# Wait for update to complete
echo "⏳ Waiting for function update..."
aws lambda wait function-updated --function-name "$FUNCTION_NAME" --region "$REGION" 2>/dev/null

echo ""
echo "✅ Function deployed: $FUNCTION_NAME"
echo ""

rm -f "$ZIP_FILE"

