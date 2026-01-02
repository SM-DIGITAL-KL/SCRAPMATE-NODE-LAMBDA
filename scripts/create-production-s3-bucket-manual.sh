#!/bin/bash

# Manual S3 Bucket Creation Script for Production
# This script provides instructions and attempts to create the production S3 bucket
# Usage: ./scripts/create-production-s3-bucket-manual.sh [region]

REGION=${1:-ap-south-1}
BUCKET_NAME="scrapmate-images-production"

echo "🪣 Creating Production S3 Bucket (Manual)"
echo "   Bucket: $BUCKET_NAME"
echo "   Region: $REGION"
echo ""

# Load AWS credentials
if [ -f "aws.txt" ]; then
    export $(grep -E '^export ' aws.txt | sed 's/export //' | xargs)
fi

export AWS_REGION=${AWS_REGION:-$REGION}

# Check if bucket already exists
echo "📋 Checking if bucket exists..."
BUCKET_EXISTS=$(aws s3api head-bucket --bucket "$BUCKET_NAME" --region "$REGION" 2>/dev/null)

if [ $? -eq 0 ]; then
    echo "✅ Bucket '$BUCKET_NAME' already exists"
    echo ""
    echo "📋 Bucket Configuration:"
    aws s3api get-bucket-location --bucket "$BUCKET_NAME" --region "$REGION" 2>/dev/null
    exit 0
fi

echo "📝 Attempting to create bucket '$BUCKET_NAME'..."
echo ""

# Try to create bucket
if [ "$REGION" = "us-east-1" ]; then
    # us-east-1 doesn't require LocationConstraint
    CREATE_RESULT=$(aws s3api create-bucket \
        --bucket "$BUCKET_NAME" \
        --region "$REGION" \
        2>&1)
else
    CREATE_RESULT=$(aws s3api create-bucket \
        --bucket "$BUCKET_NAME" \
        --region "$REGION" \
        --create-bucket-configuration LocationConstraint="$REGION" \
        2>&1)
fi

if [ $? -eq 0 ]; then
    echo "✅ Bucket '$BUCKET_NAME' created successfully"
    
    # Configure bucket settings
    echo ""
    echo "⚙️  Configuring bucket settings..."
    
    # Block public access
    aws s3api put-public-access-block \
        --bucket "$BUCKET_NAME" \
        --public-access-block-configuration \
            "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true" \
        --region "$REGION" \
        > /dev/null 2>&1 && echo "   ✅ Public access blocked"
    
    # Enable versioning
    aws s3api put-bucket-versioning \
        --bucket "$BUCKET_NAME" \
        --versioning-configuration Status=Enabled \
        --region "$REGION" \
        > /dev/null 2>&1 && echo "   ✅ Versioning enabled"
    
    echo ""
    echo "✅ Production S3 bucket setup complete!"
    echo ""
    echo "📝 Next step: Update Lambda environment variable:"
    echo "   aws lambda update-function-configuration \\"
    echo "     --function-name scrapmate-node-api-production \\"
    echo "     --region $REGION \\"
    echo "     --environment \"Variables={S3_BUCKET_NAME=$BUCKET_NAME,...}\""
    exit 0
else
    if echo "$CREATE_RESULT" | grep -q "BucketAlreadyExists\|BucketAlreadyOwnedByYou"; then
        echo "✅ Bucket '$BUCKET_NAME' already exists (owned by you)"
        exit 0
    elif echo "$CREATE_RESULT" | grep -q "AccessDenied"; then
        echo "❌ Access Denied: Cannot create bucket (insufficient IAM permissions)"
        echo ""
        echo "📝 Manual Creation Instructions:"
        echo "   1. Go to AWS Console: https://s3.console.aws.amazon.com/s3/buckets?region=$REGION"
        echo "   2. Click 'Create bucket'"
        echo "   3. Bucket name: $BUCKET_NAME"
        echo "   4. Region: $REGION"
        echo "   5. Uncheck 'Block all public access' (or configure as needed)"
        echo "   6. Enable versioning"
        echo "   7. Create bucket"
        echo ""
        echo "   After creating, update Lambda environment:"
        echo "   ./scripts/update-lambda-s3-bucket.sh production $BUCKET_NAME"
        exit 1
    else
        echo "❌ Failed to create bucket"
        echo "   Error: $CREATE_RESULT"
        exit 1
    fi
fi




