#!/bin/bash

# Create Production S3 Bucket
# This script creates/replicates the S3 bucket for production
# Usage: ./scripts/create-production-s3-bucket.sh [region]

REGION=${1:-ap-south-1}
BUCKET_NAME="scrapmate-images-production"

echo "🪣 Creating Production S3 Bucket"
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
    echo ""
else
    echo "📝 Creating bucket '$BUCKET_NAME'..."
    
    # Create bucket
    if [ "$REGION" = "us-east-1" ]; then
        # us-east-1 doesn't require LocationConstraint
        aws s3api create-bucket \
            --bucket "$BUCKET_NAME" \
            --region "$REGION" \
            > /tmp/s3-create-${BUCKET_NAME}.json 2>&1
    else
        aws s3api create-bucket \
            --bucket "$BUCKET_NAME" \
            --region "$REGION" \
            --create-bucket-configuration LocationConstraint="$REGION" \
            > /tmp/s3-create-${BUCKET_NAME}.json 2>&1
    fi
    
    if [ $? -eq 0 ]; then
        echo "✅ Bucket '$BUCKET_NAME' created successfully"
    else
        ERROR_MSG=$(cat /tmp/s3-create-${BUCKET_NAME}.json 2>/dev/null)
        if echo "$ERROR_MSG" | grep -q "BucketAlreadyExists\|BucketAlreadyOwnedByYou"; then
            echo "✅ Bucket '$BUCKET_NAME' already exists (owned by you)"
        else
            echo "❌ Failed to create bucket '$BUCKET_NAME'"
            echo "   Error: $ERROR_MSG"
            rm -f /tmp/s3-create-${BUCKET_NAME}.json
            exit 1
        fi
    fi
    rm -f /tmp/s3-create-${BUCKET_NAME}.json
fi

# Configure bucket settings
echo "⚙️  Configuring bucket settings..."

# Block public access (security best practice)
echo "   🔒 Blocking public access..."
aws s3api put-public-access-block \
    --bucket "$BUCKET_NAME" \
    --public-access-block-configuration \
        "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true" \
    --region "$REGION" \
    > /tmp/s3-config-${BUCKET_NAME}.json 2>&1

if [ $? -eq 0 ]; then
    echo "   ✅ Public access blocked"
else
    echo "   ⚠️  Warning: Could not block public access (may already be configured)"
fi

# Enable versioning (optional, for production safety)
echo "   📝 Enabling versioning..."
aws s3api put-bucket-versioning \
    --bucket "$BUCKET_NAME" \
    --versioning-configuration Status=Enabled \
    --region "$REGION" \
    > /tmp/s3-versioning-${BUCKET_NAME}.json 2>&1

if [ $? -eq 0 ]; then
    echo "   ✅ Versioning enabled"
else
    echo "   ⚠️  Warning: Could not enable versioning (may already be enabled)"
fi

# Set up CORS (if needed for web uploads)
echo "   🌐 Setting up CORS configuration..."
cat > /tmp/cors-config.json <<EOF
{
    "CORSRules": [
        {
            "AllowedOrigins": ["*"],
            "AllowedMethods": ["GET", "PUT", "POST", "DELETE", "HEAD"],
            "AllowedHeaders": ["*"],
            "ExposeHeaders": ["ETag"],
            "MaxAgeSeconds": 3000
        }
    ]
}
EOF

aws s3api put-bucket-cors \
    --bucket "$BUCKET_NAME" \
    --cors-configuration file:///tmp/cors-config.json \
    --region "$REGION" \
    > /tmp/s3-cors-${BUCKET_NAME}.json 2>&1

if [ $? -eq 0 ]; then
    echo "   ✅ CORS configured"
else
    echo "   ⚠️  Warning: Could not configure CORS"
fi

rm -f /tmp/cors-config.json /tmp/s3-*.json

echo ""
echo "✅ S3 Bucket Setup Complete!"
echo ""
echo "📋 Bucket Details:"
echo "   Name: $BUCKET_NAME"
echo "   Region: $REGION"
echo "   URL: s3://$BUCKET_NAME"
echo ""
echo "💡 Note: If you want to copy data from dev bucket, use:"
echo "   aws s3 sync s3://scrapmate-images s3://$BUCKET_NAME --region $REGION"
echo ""

