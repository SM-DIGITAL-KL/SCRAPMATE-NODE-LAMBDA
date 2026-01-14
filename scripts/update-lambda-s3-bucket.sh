#!/bin/bash

# Update Lambda S3 Bucket Environment Variable
# Usage: ./scripts/update-lambda-s3-bucket.sh [stage] [bucket-name]
# Example: ./scripts/update-lambda-s3-bucket.sh production scrapmate-images-production

STAGE=${1:-production}
BUCKET_NAME=${2:-scrapmate-images-production}
REGION=${3:-ap-south-1}
FUNCTION_NAME="scrapmate-node-api-${STAGE}"

echo "🔄 Updating Lambda S3 Bucket Configuration"
echo "   Function: $FUNCTION_NAME"
echo "   Bucket: $BUCKET_NAME"
echo "   Region: $REGION"
echo ""

# Load AWS credentials
if [ -f "aws.txt" ]; then
    export $(grep -E '^export ' aws.txt | sed 's/export //' | xargs)
fi

export AWS_REGION=${AWS_REGION:-$REGION}

# Get current environment variables
echo "📋 Getting current Lambda environment variables..."
CURRENT_ENV=$(aws lambda get-function-configuration \
    --function-name "$FUNCTION_NAME" \
    --region "$REGION" \
    --query 'Environment.Variables' \
    --output json 2>/dev/null)

if [ $? -ne 0 ]; then
    echo "❌ Failed to get Lambda function configuration"
    exit 1
fi

# Update S3_BUCKET_NAME in the environment variables
echo "📝 Updating S3_BUCKET_NAME to: $BUCKET_NAME"
UPDATED_ENV=$(echo "$CURRENT_ENV" | python3 -c "
import sys, json
env = json.load(sys.stdin)
env['S3_BUCKET_NAME'] = '$BUCKET_NAME'
print(json.dumps(env))
" 2>/dev/null)

if [ $? -ne 0 ]; then
    echo "❌ Failed to update environment variables JSON"
    exit 1
fi

# Save to temp file
TEMP_ENV_FILE="/tmp/lambda-env-update-${STAGE}-$(date +%s).json"
echo "{\"Variables\": $UPDATED_ENV}" > "$TEMP_ENV_FILE"

# Update Lambda function
echo "📤 Updating Lambda function configuration..."
aws lambda update-function-configuration \
    --function-name "$FUNCTION_NAME" \
    --region "$REGION" \
    --environment "file://$TEMP_ENV_FILE" \
    > /tmp/lambda-update-s3.json 2>&1

if [ $? -eq 0 ]; then
    echo "✅ Lambda function updated successfully"
    echo ""
    echo "📋 Verification:"
    aws lambda get-function-configuration \
        --function-name "$FUNCTION_NAME" \
        --region "$REGION" \
        --query 'Environment.Variables.S3_BUCKET_NAME' \
        --output text
    echo ""
    rm -f "$TEMP_ENV_FILE" /tmp/lambda-update-s3.json
else
    echo "❌ Failed to update Lambda function"
    cat /tmp/lambda-update-s3.json
    rm -f "$TEMP_ENV_FILE" /tmp/lambda-update-s3.json
    exit 1
fi






