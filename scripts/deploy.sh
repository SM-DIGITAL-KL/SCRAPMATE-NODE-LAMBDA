#!/bin/bash

# Deployment script that sets up environment variables before deploying
# Usage: ./scripts/deploy.sh [stage] [region]
# Example: ./scripts/deploy.sh dev ap-south-1

STAGE=${1:-dev}
REGION=${2:-ap-south-1}

echo "🚀 Deploying to stage: $STAGE in region: $REGION"
echo ""

# Load environment variables from aws.txt if it exists
if [ -f "aws.txt" ]; then
    echo "📁 Loading environment variables from aws.txt..."
    export $(grep -E '^export ' aws.txt | sed 's/export //' | xargs)
fi

# Load from .env if it exists
if [ -f ".env" ]; then
    echo "📁 Loading environment variables from .env..."
    export $(grep -v '^#' .env | xargs)
fi

# Set default values if not set
export AWS_REGION=${AWS_REGION:-$REGION}
export API_KEY=${API_KEY:-'zyubkfzeumeoviaqzcsrvfwdzbiwnlnn'}
export SESSION_SECRET=${SESSION_SECRET:-'scrapmate-session-secret-change-in-production'}
export JWT_SECRET=${JWT_SECRET:-'scrapmate-jwt-secret-change-in-production'}
export S3_BUCKET_NAME=${S3_BUCKET_NAME:-'scrapmate-images'}

# Verify AWS credentials
if [ -z "$AWS_ACCESS_KEY_ID" ] || [ -z "$AWS_SECRET_ACCESS_KEY" ]; then
    echo "⚠️  AWS credentials not found in environment"
    echo "   Setting from aws.txt or using IAM role..."
    
    if [ -f "aws.txt" ]; then
        source <(grep -E '^export ' aws.txt | sed 's/export //')
    fi
fi

# Check if AWS credentials are available
if [ -n "$AWS_ACCESS_KEY_ID" ] && [ -n "$AWS_SECRET_ACCESS_KEY" ]; then
    echo "✅ AWS credentials found"
    export AWS_ACCESS_KEY_ID
    export AWS_SECRET_ACCESS_KEY
    export AWS_REGION
else
    echo "⚠️  AWS credentials not set - will use AWS CLI default profile or IAM role"
fi

echo ""
echo "📋 Deployment Configuration:"
echo "   Stage: $STAGE"
echo "   Region: $REGION"
echo "   API_KEY: ${API_KEY:0:10}..."
echo "   S3_BUCKET_NAME: ${S3_BUCKET_NAME}"
echo ""

# Deploy using serverless (via npx to use local installation)
echo "🚀 Starting deployment..."
npx serverless deploy --stage $STAGE --region $REGION

