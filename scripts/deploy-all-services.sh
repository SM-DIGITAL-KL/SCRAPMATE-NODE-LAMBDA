#!/bin/bash

# Deploy All Microservices to Lambda
# Usage: ./scripts/deploy-all-services.sh [stage] [region]
# Example: ./scripts/deploy-all-services.sh dev ap-south-1

STAGE=${1:-dev}
REGION=${2:-ap-south-1}
FUNCTION_PREFIX="scrapmate-ms-${STAGE}"

echo "🚀 Deploying All Microservices"
echo "   Stage: $STAGE"
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
    ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text 2>/dev/null)
    if [ -n "$ACCOUNT_ID" ] && [ "$ACCOUNT_ID" != "None" ]; then
        ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/${ROLE_NAME}"
        echo "⚠️  Using assumed role: $ROLE_ARN"
    else
        echo "❌ IAM role not found. Create it first: ./scripts/create-lambda-role.sh $STAGE"
        exit 1
    fi
else
    echo "✅ Using role: $ROLE_ARN"
fi

# Set environment variables
export API_KEY=${API_KEY:-'zyubkfzeumeoviaqzcsrvfwdzbiwnlnn'}
export SESSION_SECRET=${SESSION_SECRET:-'scrapmate-session-secret-change-in-production'}
export JWT_SECRET=${JWT_SECRET:-'scrapmate-jwt-secret-change-in-production'}
export S3_BUCKET_NAME=${S3_BUCKET_NAME:-'scrapmate-images'}

# Define services and their configurations
SERVICES_CONFIG=(
    "auth:512:30:Authentication and user registration"
    "shop:512:30:Shop management"
    "product:512:30:Product and category management"
    "order:1024:30:Order processing"
    "delivery:512:30:Delivery boy management"
    "user:512:30:User profiles and FCM tokens"
    "notification:256:30:Notification management"
    "utility:512:30:Utility functions"
    "web:512:30:Web panel routes (admin, vendor, agent, customer panels)"
    "health:128:10:Health checks"
)

# Create a single deployment package for all services
echo ""
echo "📦 Creating shared deployment package (used by all services)..."
SHARED_ZIP_FILE="/tmp/${FUNCTION_PREFIX}-shared-$(date +%s).zip"

# Create zip from project root with all shared code
zip -r "$SHARED_ZIP_FILE" . \
    -i "services/*" \
    -i "controllers/*" \
    -i "models/*" \
    -i "utils/*" \
    -i "config/*" \
    -i "middleware/*" \
    -i "node_modules/*" \
    -i "package.json" \
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
    -x "nodemon.json" \
    -x "public/*" \
    -x "services/*/node_modules/*" \
    > /dev/null 2>&1

if [ ! -f "$SHARED_ZIP_FILE" ]; then
    echo "❌ Failed to create shared deployment package"
    exit 1
fi

SHARED_ZIP_SIZE=$(du -h "$SHARED_ZIP_FILE" | cut -f1)
SHARED_ZIP_SIZE_BYTES=$(stat -f%z "$SHARED_ZIP_FILE" 2>/dev/null || stat -c%s "$SHARED_ZIP_FILE" 2>/dev/null || echo "0")
echo "✅ Shared package created: $SHARED_ZIP_SIZE"
echo ""

# Check if package is too large for direct upload (>50MB)
MAX_DIRECT_UPLOAD=52428800  # 50MB in bytes
USE_S3=false
SHARED_S3_KEY=""

if [ "$SHARED_ZIP_SIZE_BYTES" -gt "$MAX_DIRECT_UPLOAD" ]; then
    USE_S3=true
    S3_BUCKET="$S3_BUCKET_NAME"
    SHARED_S3_KEY="lambda-deployments/${FUNCTION_PREFIX}-shared-$(date +%s).zip"
    
    echo "📤 Uploading shared package to S3..."
    aws s3 cp "$SHARED_ZIP_FILE" "s3://${S3_BUCKET}/${SHARED_S3_KEY}" --region "$REGION" > /dev/null 2>&1
    
    if [ $? -ne 0 ]; then
        echo "❌ Failed to upload shared package to S3"
        rm -f "$SHARED_ZIP_FILE"
        exit 1
    fi
    
    echo "✅ Shared package uploaded to S3: s3://${S3_BUCKET}/${SHARED_S3_KEY}"
    echo ""
fi

# Function to deploy a single service using the shared package
deploy_service() {
    local SERVICE_NAME=$1
    local MEMORY=$2
    local TIMEOUT=$3
    local DESCRIPTION=$4
    local FUNCTION_NAME="${FUNCTION_PREFIX}-${SERVICE_NAME}"
    
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "📦 Deploying ${SERVICE_NAME} service"
    echo "   Function: $FUNCTION_NAME"
    echo "   Memory: ${MEMORY}MB, Timeout: ${TIMEOUT}s"
    echo "   Description: $DESCRIPTION"
    echo "   Using shared deployment package"
    echo ""
    
    # Check if function exists
    aws lambda get-function --function-name "$FUNCTION_NAME" --region "$REGION" > /dev/null 2>&1
    
    if [ $? -eq 0 ]; then
        echo "   🔄 Function exists, updating..."
        
        # Update function code using shared package
        if [ "$USE_S3" = true ]; then
            aws lambda update-function-code \
                --function-name "$FUNCTION_NAME" \
                --s3-bucket "$S3_BUCKET" \
                --s3-key "$SHARED_S3_KEY" \
                --region "$REGION" \
                --output json > /tmp/lambda-update-${SERVICE_NAME}.json 2>&1
        else
            aws lambda update-function-code \
                --function-name "$FUNCTION_NAME" \
                --zip-file "fileb://$SHARED_ZIP_FILE" \
                --region "$REGION" \
                --output json > /tmp/lambda-update-${SERVICE_NAME}.json 2>&1
        fi
        
        if [ $? -ne 0 ]; then
            echo "   ❌ Failed to update function code"
            cat /tmp/lambda-update-${SERVICE_NAME}.json
            return 1
        fi
        
        echo "   ✅ Code updated"
        
        # Update function configuration
        aws lambda update-function-configuration \
            --function-name "$FUNCTION_NAME" \
            --runtime nodejs20.x \
            --timeout "$TIMEOUT" \
            --memory-size "$MEMORY" \
            --description "$DESCRIPTION aws:states:opt-out" \
            --environment "Variables={
                NODE_ENV=production,
                AWS_REGION=$REGION,
                API_KEY=$API_KEY,
                SESSION_SECRET=$SESSION_SECRET,
                JWT_SECRET=$JWT_SECRET,
                S3_BUCKET_NAME=$S3_BUCKET_NAME,
                REDIS_URL=${REDIS_URL:-''},
                REDIS_TOKEN=${REDIS_TOKEN:-''}
            }" \
            --region "$REGION" \
            --output json > /tmp/lambda-config-${SERVICE_NAME}.json 2>&1
        
        if [ $? -ne 0 ]; then
            echo "   ⚠️  Warning: Failed to update configuration"
            cat /tmp/lambda-config-${SERVICE_NAME}.json
        else
            echo "   ✅ Configuration updated"
        fi
        
        # Wait for function to be active
        echo "   ⏳ Waiting for function to be active..."
        aws lambda wait function-updated --function-name "$FUNCTION_NAME" --region "$REGION" 2>/dev/null || sleep 3
        
    else
        echo "   📝 Function does not exist, creating..."
        
        # Create function using shared package
        if [ "$USE_S3" = true ]; then
            aws lambda create-function \
                --function-name "$FUNCTION_NAME" \
                --runtime nodejs20.x \
                --role "$ROLE_ARN" \
                --handler services/${SERVICE_NAME}/handler.handler \
                --code "S3Bucket=${S3_BUCKET},S3Key=${SHARED_S3_KEY}" \
                --timeout "$TIMEOUT" \
                --memory-size "$MEMORY" \
                --description "$DESCRIPTION aws:states:opt-out" \
                --environment "Variables={
                    NODE_ENV=production,
                    API_KEY=$API_KEY,
                    SESSION_SECRET=$SESSION_SECRET,
                    JWT_SECRET=$JWT_SECRET,
                    S3_BUCKET_NAME=$S3_BUCKET_NAME,
                    REDIS_URL=${REDIS_URL:-''},
                    REDIS_TOKEN=${REDIS_TOKEN:-''}
                }" \
                --region "$REGION" \
                --output json > /tmp/lambda-create-${SERVICE_NAME}.json 2>&1
        else
            aws lambda create-function \
                --function-name "$FUNCTION_NAME" \
                --runtime nodejs20.x \
                --role "$ROLE_ARN" \
                --handler services/${SERVICE_NAME}/handler.handler \
                --zip-file "fileb://$SHARED_ZIP_FILE" \
                --timeout "$TIMEOUT" \
                --memory-size "$MEMORY" \
                --description "$DESCRIPTION aws:states:opt-out" \
                --environment "Variables={
                    NODE_ENV=production,
                    API_KEY=$API_KEY,
                    SESSION_SECRET=$SESSION_SECRET,
                    JWT_SECRET=$JWT_SECRET,
                    S3_BUCKET_NAME=$S3_BUCKET_NAME,
                    REDIS_URL=${REDIS_URL:-''},
                    REDIS_TOKEN=${REDIS_TOKEN:-''}
                }" \
                --region "$REGION" \
                --output json > /tmp/lambda-create-${SERVICE_NAME}.json 2>&1
        fi
        
        if [ $? -ne 0 ]; then
            echo "   ❌ Failed to create function"
            cat /tmp/lambda-create-${SERVICE_NAME}.json
            return 1
        fi
        
        echo "   ✅ Function created"
    fi
    
    echo "   ✅ ${SERVICE_NAME} service deployed successfully"
    return 0
}

# Clean up shared package at the end
cleanup_shared_package() {
    if [ -f "$SHARED_ZIP_FILE" ]; then
        rm -f "$SHARED_ZIP_FILE"
        echo "🧹 Cleaned up shared deployment package"
    fi
}

# Deploy all services
SUCCESS_COUNT=0
FAILED_COUNT=0
FAILED_SERVICES=()

for SERVICE_ENTRY in "${SERVICES_CONFIG[@]}"; do
    IFS=':' read -r SERVICE_NAME MEMORY TIMEOUT DESCRIPTION <<< "$SERVICE_ENTRY"
    
    if deploy_service "$SERVICE_NAME" "$MEMORY" "$TIMEOUT" "$DESCRIPTION"; then
        SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
    else
        FAILED_COUNT=$((FAILED_COUNT + 1))
        FAILED_SERVICES+=("$SERVICE_NAME")
    fi
done

# Clean up shared package
cleanup_shared_package

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 Deployment Summary"
echo "   ✅ Successful: $SUCCESS_COUNT"
echo "   ❌ Failed: $FAILED_COUNT"
echo "   📦 Shared package used: $SHARED_ZIP_SIZE"

if [ ${#FAILED_SERVICES[@]} -gt 0 ]; then
    echo ""
    echo "   Failed services:"
    for service in "${FAILED_SERVICES[@]}"; do
        echo "     - $service"
    done
    echo ""
    echo "   To retry a failed service, deploy individually:"
    echo "   ./scripts/deploy-service.sh <service-name> $STAGE $REGION"
fi

echo ""
echo "✅ All deployments complete!"
echo ""

