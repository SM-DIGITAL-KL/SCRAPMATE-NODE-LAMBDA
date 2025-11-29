#!/bin/bash

# Script to create S3 bucket for Serverless Framework deployments
# Usage: ./scripts/create-deployment-bucket.sh [region]
# Example: ./scripts/create-deployment-bucket.sh ap-south-1

REGION=${1:-ap-south-1}
BUCKET_NAME="scrapmate-serverless-deployments-${REGION}"

echo "🪣 Creating S3 bucket for Serverless deployments: $BUCKET_NAME"
echo ""

# Load AWS credentials from aws.txt if it exists
if [ -f "aws.txt" ]; then
    echo "📁 Loading AWS credentials from aws.txt..."
    export $(grep -E '^export ' aws.txt | sed 's/export //' | xargs)
fi

# Check if bucket already exists
if aws s3 ls "s3://${BUCKET_NAME}" --region $REGION &>/dev/null; then
    echo "✅ Bucket already exists: $BUCKET_NAME"
    echo ""
    echo "📝 Update serverless.yml to use this bucket:"
    echo "   deploymentBucket:"
    echo "     name: $BUCKET_NAME"
    exit 0
fi

# Create bucket
echo "Creating bucket: $BUCKET_NAME in region: $REGION"
if aws s3 mb "s3://${BUCKET_NAME}" --region $REGION 2>/dev/null; then
    echo "✅ Bucket created successfully"
    
    # Enable versioning (recommended for Serverless deployments)
    echo "Enabling versioning..."
    aws s3api put-bucket-versioning \
        --bucket "$BUCKET_NAME" \
        --versioning-configuration Status=Enabled \
        --region $REGION
    
    # Block public access
    echo "Blocking public access..."
    aws s3api put-public-access-block \
        --bucket "$BUCKET_NAME" \
        --public-access-block-configuration \
        "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true" \
        --region $REGION
    
    echo ""
    echo "✅ Bucket setup complete: $BUCKET_NAME"
    echo ""
    echo "📝 Update serverless.yml to use this bucket:"
    echo "   deploymentBucket:"
    echo "     name: $BUCKET_NAME"
else
    echo "❌ Failed to create bucket"
    echo ""
    echo "💡 Alternative: Ask your AWS administrator to create the bucket:"
    echo "   Bucket name: $BUCKET_NAME"
    echo "   Region: $REGION"
    echo "   Enable versioning: Yes"
    echo "   Block public access: Yes"
    exit 1
fi

