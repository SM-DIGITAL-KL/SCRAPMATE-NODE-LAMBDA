#!/bin/bash

# Direct Lambda deployment script (no CloudFormation)
# Usage: ./scripts/deploy-lambda-direct.sh [stage] [region]
# Example: ./scripts/deploy-lambda-direct.sh dev ap-south-1

STAGE=${1:-dev}
REGION=${2:-ap-south-1}
FUNCTION_NAME="scrapmate-node-api-${STAGE}"

echo "🚀 Deploying directly to Lambda (no CloudFormation)"
echo "   Function: $FUNCTION_NAME"
echo "   Region: $REGION"
echo ""

# Load AWS credentials from aws.txt if it exists
if [ -f "aws.txt" ]; then
    echo "📁 Loading AWS credentials from aws.txt..."
    export $(grep -E '^export ' aws.txt | sed 's/export //' | xargs)
fi

export AWS_REGION=${AWS_REGION:-$REGION}

# Set environment variables
export API_KEY=${API_KEY:-'zyubkfzeumeoviaqzcsrvfwdzbiwnlnn'}
export SESSION_SECRET=${SESSION_SECRET:-'scrapmate-session-secret-change-in-production'}
export JWT_SECRET=${JWT_SECRET:-'scrapmate-jwt-secret-change-in-production'}
export S3_BUCKET_NAME=${S3_BUCKET_NAME:-'scrapmate-images'}

echo "📦 Creating deployment package..."
# Create a zip file with the code
ZIP_FILE="/tmp/${FUNCTION_NAME}-$(date +%s).zip"
ZIP_NAME=$(basename "$ZIP_FILE")

# Create zip using include-only pattern (same as microservices - much smaller!)
echo "   Compressing files..."
zip -r "$ZIP_FILE" . \
    -i "routes/*" \
    -i "services/*" \
    -i "controllers/*" \
    -i "models/*" \
    -i "utils/*" \
    -i "config/*" \
    -i "middleware/*" \
    -i "node_modules/*" \
    -i "app.js" \
    -i "lambda.js" \
    -i "package.json" \
    -x "*.git*" \
    -x "node_modules/.cache/*" \
    -x "node_modules/playwright-core/*" \
    -x "node_modules/typescript/*" \
    -x "node_modules/@types/*" \
    -x "node_modules/npm/*" \
    -x "node_modules/java-invoke-local/*" \
    -x "node_modules/*/test/*" \
    -x "node_modules/*/tests/*" \
    -x "node_modules/*/*.test.js" \
    -x "node_modules/*/*.spec.js" \
    -x "node_modules/*/__tests__/*" \
    -x "node_modules/*/__mocks__/*" \
    -x "node_modules/*/*.md" \
    -x "node_modules/*/*.txt" \
    -x "node_modules/*/README*" \
    -x "node_modules/*/CHANGELOG*" \
    -x "node_modules/*/LICENSE*" \
    -x "node_modules/*/examples/*" \
    -x "node_modules/*/example/*" \
    -x "node_modules/*/docs/*" \
    -x "node_modules/*/doc/*" \
    -x "node_modules/*/*.map" \
    -x "node_modules/*/coverage/*" \
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
    > /dev/null 2>&1

if [ ! -f "$ZIP_FILE" ]; then
    echo "❌ Failed to create deployment package"
    exit 1
fi

ZIP_SIZE=$(du -h "$ZIP_FILE" | cut -f1)
ZIP_SIZE_BYTES=$(stat -f%z "$ZIP_FILE" 2>/dev/null || stat -c%s "$ZIP_FILE" 2>/dev/null || echo "0")
echo "✅ Package created: $ZIP_FILE ($ZIP_SIZE)"

# Check unzipped size (Lambda limit is 262MB unzipped)
echo "   Checking unzipped size..."
UNZIPPED_SIZE=$(unzip -l "$ZIP_FILE" 2>/dev/null | tail -1 | awk '{print $1}')
UNZIPPED_SIZE_BYTES=${UNZIPPED_SIZE:-0}
MAX_UNZIPPED_SIZE=262144000  # 262MB in bytes (Lambda limit)

if [ "$UNZIPPED_SIZE_BYTES" -gt "$MAX_UNZIPPED_SIZE" ]; then
    UNZIPPED_SIZE_MB=$((UNZIPPED_SIZE_BYTES / 1024 / 1024))
    echo "❌ Package unzipped size ($UNZIPPED_SIZE_MB MB) exceeds Lambda limit (262 MB)"
    echo "   Please exclude more files from node_modules or use Lambda Layers"
    rm -f "$ZIP_FILE"
    exit 1
fi

UNZIPPED_SIZE_MB=$((UNZIPPED_SIZE_BYTES / 1024 / 1024))
echo "   ✅ Unzipped size: ${UNZIPPED_SIZE_MB} MB (within 262 MB limit)"

# Check if package is too large for direct upload (>50MB)
MAX_DIRECT_UPLOAD=52428800  # 50MB in bytes
USE_S3=false

if [ "$ZIP_SIZE_BYTES" -gt "$MAX_DIRECT_UPLOAD" ]; then
    echo "⚠️  Package is larger than 50MB, uploading to S3 first..."
    USE_S3=true
    
    # Upload to S3
    S3_KEY="lambda-deployments/${ZIP_NAME}"
    S3_BUCKET=${S3_BUCKET_NAME:-"scrapmate-images"}
    
    echo "📤 Uploading to S3: s3://${S3_BUCKET}/${S3_KEY}"
    aws s3 cp "$ZIP_FILE" "s3://${S3_BUCKET}/${S3_KEY}" --region "$REGION" > /tmp/s3-upload.json 2>&1
    
    if [ $? -ne 0 ]; then
        echo "❌ Failed to upload to S3"
        cat /tmp/s3-upload.json
        rm -f "$ZIP_FILE"
        exit 1
    fi
    
    echo "✅ Uploaded to S3"
    S3_LOCATION="s3://${S3_BUCKET}/${S3_KEY}"
else
    echo "✅ Package size OK for direct upload"
fi

echo ""

# Check if function exists
echo "🔍 Checking if Lambda function exists..."
FUNCTION_EXISTS=$(aws lambda get-function --function-name "$FUNCTION_NAME" --region "$REGION" 2>/dev/null)

if [ $? -eq 0 ]; then
    echo "✅ Function exists, updating..."
    
    # Update function code
    echo "📤 Uploading new code..."
    if [ "$USE_S3" = true ]; then
        aws lambda update-function-code \
            --function-name "$FUNCTION_NAME" \
            --s3-bucket "$S3_BUCKET" \
            --s3-key "$S3_KEY" \
            --region "$REGION" \
            --output json > /tmp/lambda-update.json 2>&1
    else
        aws lambda update-function-code \
            --function-name "$FUNCTION_NAME" \
            --zip-file "fileb://$ZIP_FILE" \
            --region "$REGION" \
            --output json > /tmp/lambda-update.json 2>&1
    fi
    
    if [ $? -ne 0 ]; then
        echo "❌ Failed to update function code"
        cat /tmp/lambda-update.json
        rm -f "$ZIP_FILE"
        exit 1
    fi
    
    echo "✅ Code updated"
    
    # Update function configuration
    echo "⚙️  Updating function configuration..."
    aws lambda update-function-configuration \
        --function-name "$FUNCTION_NAME" \
        --runtime nodejs20.x \
        --handler lambda.handler \
        --timeout 30 \
        --memory-size 1024 \
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
        --output json > /tmp/lambda-config.json 2>&1
    
    if [ $? -ne 0 ]; then
        echo "⚠️  Warning: Failed to update configuration (may need IAM permissions)"
        cat /tmp/lambda-config.json
    else
        echo "✅ Configuration updated"
    fi
    
else
    echo "📝 Function does not exist, creating..."
    
    # Create IAM role for Lambda (if doesn't exist)
    ROLE_NAME="scrapmate-lambda-execution-role-${STAGE}"
    echo "🔐 Checking IAM role: $ROLE_NAME"
    
    # Try to get role ARN
    ROLE_ARN=$(aws iam get-role --role-name "$ROLE_NAME" --query 'Role.Arn' --output text 2>/dev/null)
    
    # If can't get role (permission denied), construct ARN from account ID
    if [ -z "$ROLE_ARN" ] || [ "$ROLE_ARN" == "None" ] || [ "$ROLE_ARN" == "null" ]; then
        # Get account ID from credentials
        ACCOUNT_ID=$(aws sts get-caller-identity --query 'Account' --output text 2>/dev/null)
        if [ -n "$ACCOUNT_ID" ] && [ "$ACCOUNT_ID" != "None" ]; then
            ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/${ROLE_NAME}"
            echo "⚠️  Cannot verify role, but assuming it exists: $ROLE_ARN"
            echo "   (If role doesn't exist, create it first: ./scripts/create-lambda-role.sh $STAGE)"
        else
            echo "⚠️  IAM role not found. You need to create it first."
            echo "   Role name: $ROLE_NAME"
            echo "   Run: ./scripts/create-lambda-role.sh $STAGE"
            echo ""
            echo "   Or use an existing role ARN:"
            read -p "   Enter IAM role ARN (or press Enter to exit): " ROLE_ARN
            if [ -z "$ROLE_ARN" ]; then
                echo "❌ Cannot create function without IAM role"
                rm -f "$ZIP_FILE"
                exit 1
            fi
        fi
    else
        echo "✅ Using existing role: $ROLE_ARN"
    fi
    
    # Create function
    echo "📤 Creating Lambda function..."
    if [ "$USE_S3" = true ]; then
        aws lambda create-function \
            --function-name "$FUNCTION_NAME" \
            --runtime nodejs20.x \
            --role "$ROLE_ARN" \
            --handler lambda.handler \
            --code "S3Bucket=${S3_BUCKET},S3Key=${S3_KEY}" \
            --timeout 30 \
            --memory-size 1024 \
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
            --output json > /tmp/lambda-create.json 2>&1
    else
        aws lambda create-function \
            --function-name "$FUNCTION_NAME" \
            --runtime nodejs20.x \
            --role "$ROLE_ARN" \
            --handler lambda.handler \
            --zip-file "fileb://$ZIP_FILE" \
            --timeout 30 \
            --memory-size 1024 \
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
            --output json > /tmp/lambda-create.json 2>&1
    fi
    
    if [ $? -ne 0 ]; then
        echo "❌ Failed to create function"
        cat /tmp/lambda-create.json
        rm -f "$ZIP_FILE"
        exit 1
    fi
    
    echo "✅ Function created"
fi

# Get function ARN
FUNCTION_ARN=$(aws lambda get-function --function-name "$FUNCTION_NAME" --region "$REGION" --query 'Configuration.FunctionArn' --output text 2>/dev/null)

echo ""
echo "✅ Deployment complete!"
echo ""
echo "📋 Function Details:"
echo "   Name: $FUNCTION_NAME"
echo "   ARN: $FUNCTION_ARN"
echo "   Region: $REGION"
echo ""

# Create Function URL (HTTP API endpoint)
echo "🌐 Creating/Updating Function URL..."
FUNCTION_URL=$(aws lambda get-function-url-config --function-name "$FUNCTION_NAME" --region "$REGION" --query 'FunctionUrl' --output text 2>/dev/null)

if [ -z "$FUNCTION_URL" ] || [ "$FUNCTION_URL" == "None" ]; then
    echo "📝 Creating new Function URL (CORS disabled - Express handles CORS)..."
    aws lambda create-function-url-config \
        --function-name "$FUNCTION_NAME" \
        --auth-type NONE \
        --cors '{"AllowOrigins":[],"AllowMethods":[],"AllowHeaders":[]}' \
        --region "$REGION" \
        --output json > /tmp/lambda-url.json 2>&1
    
    if [ $? -eq 0 ]; then
        FUNCTION_URL=$(cat /tmp/lambda-url.json | python3 -c "import sys, json; print(json.load(sys.stdin).get('FunctionUrl', ''))" 2>/dev/null || cat /tmp/lambda-url.json | grep -o '"FunctionUrl":"[^"]*' | cut -d'"' -f4)
        echo "✅ Function URL created"
    else
        echo "⚠️  Could not create Function URL (may need permissions)"
        cat /tmp/lambda-url.json
    fi
else
    echo "✅ Function URL already exists, disabling Lambda CORS (Express handles CORS)..."
    # Disable Lambda Function URL CORS - we handle CORS in Express middleware
    # This prevents duplicate Access-Control-Allow-Origin headers
    aws lambda update-function-url-config \
        --function-name "$FUNCTION_NAME" \
        --cors '{"AllowOrigins":[],"AllowMethods":[],"AllowHeaders":[]}' \
        --region "$REGION" \
        --output json > /tmp/lambda-url-update.json 2>&1 || echo "   (CORS update may have failed, but URL exists)"
fi

# Add permission for Function URL to invoke Lambda
echo "🔐 Setting up Function URL permissions..."
aws lambda add-permission \
    --function-name "$FUNCTION_NAME" \
    --statement-id FunctionURLAllowPublicAccess \
    --action lambda:InvokeFunctionUrl \
    --principal "*" \
    --function-url-auth-type NONE \
    --region "$REGION" \
    --output json > /tmp/lambda-permission.json 2>&1 || echo "   (Permission may already exist)"

if [ -n "$FUNCTION_URL" ] && [ "$FUNCTION_URL" != "None" ]; then
    echo ""
    echo "🎉 Your API is live at:"
    echo "   $FUNCTION_URL"
    echo ""
    echo "🧪 Test it:"
    echo "   curl $FUNCTION_URL/api/test"
    echo ""
    echo "📝 Update your frontend/client to use this URL as the API base URL"
else
    # Try to get it again
    FUNCTION_URL=$(aws lambda get-function-url-config --function-name "$FUNCTION_NAME" --region "$REGION" --query 'FunctionUrl' --output text 2>/dev/null)
    if [ -n "$FUNCTION_URL" ] && [ "$FUNCTION_URL" != "None" ]; then
        echo ""
        echo "🎉 Your API is live at:"
        echo "   $FUNCTION_URL"
        echo ""
        echo "🧪 Test it:"
        echo "   curl $FUNCTION_URL/api/test"
    fi
fi

# Cleanup
rm -f "$ZIP_FILE" /tmp/lambda-*.json

echo ""
echo "✅ Deployment complete!"

