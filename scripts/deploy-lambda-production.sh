#!/bin/bash

# Production Lambda deployment script (no CloudFormation)
# Usage: ./scripts/deploy-lambda-production.sh [region]
# Example: ./scripts/deploy-lambda-production.sh ap-south-1

STAGE="production"
REGION=${1:-ap-south-1}
FUNCTION_NAME="scrapmate-node-api-${STAGE}"

echo "🚀 Deploying to Production Lambda"
echo "   Function: $FUNCTION_NAME"
echo "   Region: $REGION"
echo ""

# Load AWS credentials from aws.txt if it exists
if [ -f "aws.txt" ]; then
    echo "📁 Loading AWS credentials from aws.txt..."
    # Process each export line and load variables
    while IFS= read -r line || [ -n "$line" ]; do
        # Skip empty lines and comments
        [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue
        # Only process export lines
        if [[ "$line" =~ ^export[[:space:]]+ ]]; then
            # Remove 'export ' prefix
            var_part="${line#export }"
            # Extract variable name and value using parameter expansion
            if [[ "$var_part" =~ ^([^=]+)=(.*)$ ]]; then
                var_name="${BASH_REMATCH[1]}"
                var_value="${BASH_REMATCH[2]}"
            # Remove leading/trailing quotes and spaces
            var_value=$(echo "$var_value" | sed "s/^[[:space:]]*['\"]//;s/['\"][[:space:]]*$//")
            # Export the variable - use eval to ensure proper export
            eval "export $var_name=\"$var_value\""
                # Debug: show Instamojo credentials being loaded
                if [[ "$var_name" == "INSTAMOJO_"* ]]; then
                    echo "   ✅ Loaded $var_name (length: ${#var_value})"
                fi
            fi
        fi
    done < aws.txt
    
    # Verify Instamojo credentials are loaded
    if [ -n "${INSTAMOJO_API_KEY:-}" ] && [ -n "${INSTAMOJO_AUTH_TOKEN:-}" ]; then
        echo "✅ Instamojo credentials loaded from aws.txt"
        echo "   API Key: ${INSTAMOJO_API_KEY:0:8}... (length: ${#INSTAMOJO_API_KEY})"
        echo "   Auth Token: ${INSTAMOJO_AUTH_TOKEN:0:8}... (length: ${#INSTAMOJO_AUTH_TOKEN})"
    else
        echo "⚠️  Warning: Instamojo credentials not found in aws.txt"
        echo "   INSTAMOJO_API_KEY: ${INSTAMOJO_API_KEY:-EMPTY}"
        echo "   INSTAMOJO_AUTH_TOKEN: ${INSTAMOJO_AUTH_TOKEN:-EMPTY}"
    fi
fi

export AWS_REGION=${AWS_REGION:-$REGION}

# Set environment variables - Production defaults
export API_KEY=${API_KEY:-'zyubkfzeumeoviaqzcsrvfwdzbiwnlnn'}
export SESSION_SECRET=${SESSION_SECRET:-'scrapmate-session-secret-change-in-production'}
export JWT_SECRET=${JWT_SECRET:-'scrapmate-jwt-secret-change-in-production'}
# Use production bucket for production stage
export S3_BUCKET_NAME=${S3_BUCKET_NAME:-'scrapmate-images-production'}

# Instamojo Payment Gateway credentials
# Set these as environment variables or in aws.txt before deployment
# Example: export INSTAMOJO_API_KEY='your-api-key'
export INSTAMOJO_API_KEY=${INSTAMOJO_API_KEY:-''}
export INSTAMOJO_AUTH_TOKEN=${INSTAMOJO_AUTH_TOKEN:-''}
export INSTAMOJO_SALT=${INSTAMOJO_SALT:-''}
# Alternative names for backward compatibility
export INSTAMOJO_CLIENT_ID=${INSTAMOJO_CLIENT_ID:-$INSTAMOJO_API_KEY}
export INSTAMOJO_CLIENT_SECRET=${INSTAMOJO_CLIENT_SECRET:-$INSTAMOJO_AUTH_TOKEN}

# Load Firebase service account - prioritize vendor app (partner) service account
if [ -f "scrapmate-partner-android-firebase-adminsdk-fbsvc-709bbce0d4.json" ]; then
    echo "📋 Loading vendor app Firebase service account from file..."
    export FIREBASE_SERVICE_ACCOUNT=$(cat scrapmate-partner-android-firebase-adminsdk-fbsvc-709bbce0d4.json | jq -c .)
    if [ -z "$FIREBASE_SERVICE_ACCOUNT" ]; then
        echo "⚠️  Warning: Failed to load vendor app Firebase service account from file"
    else
        echo "✅ Vendor app Firebase service account loaded (for vendor notifications)"
    fi
elif [ -f "scrapmate-partner-android-firebase-adminsdk-fbsvc-94a2c243ee.json" ]; then
    echo "📋 Loading vendor app Firebase service account from file (old)..."
    export FIREBASE_SERVICE_ACCOUNT=$(cat scrapmate-partner-android-firebase-adminsdk-fbsvc-94a2c243ee.json | jq -c .)
    if [ -z "$FIREBASE_SERVICE_ACCOUNT" ]; then
        echo "⚠️  Warning: Failed to load vendor app Firebase service account from file"
    else
        echo "✅ Vendor app Firebase service account loaded (for vendor notifications)"
    fi
elif [ -f "firebase-service-account.json" ]; then
    echo "📋 Loading customer app Firebase service account from file..."
    export FIREBASE_SERVICE_ACCOUNT=$(cat firebase-service-account.json | jq -c .)
    if [ -z "$FIREBASE_SERVICE_ACCOUNT" ]; then
        echo "⚠️  Warning: Failed to load Firebase service account from file"
    else
        echo "✅ Customer app Firebase service account loaded"
    fi
elif [ -n "$FIREBASE_SERVICE_ACCOUNT" ]; then
    echo "✅ Using FIREBASE_SERVICE_ACCOUNT from environment"
else
    echo "⚠️  Warning: FIREBASE_SERVICE_ACCOUNT not set - FCM notifications may not work"
fi

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
    -i "firebase-service-account.json" \
    -i "scrapmate-partner-android-firebase-adminsdk-fbsvc-709bbce0d4.json" \
    -i "scrapmate-partner-android-firebase-adminsdk-fbsvc-94a2c243ee.json" \
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
    
    # Upload to S3 - try production bucket first, fallback to dev bucket
    S3_KEY="lambda-deployments/${ZIP_NAME}"
    S3_BUCKET=${S3_BUCKET_NAME:-"scrapmate-images-production"}
    
    # Check if production bucket exists, if not use dev bucket for upload
    BUCKET_EXISTS=$(aws s3api head-bucket --bucket "$S3_BUCKET" --region "$REGION" 2>/dev/null)
    if [ $? -ne 0 ]; then
        echo "   ⚠️  Production bucket doesn't exist, using dev bucket for upload..."
        S3_BUCKET="scrapmate-images"
    fi
    
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
    
    # Wait for code update to complete before updating configuration
    echo "⏳ Waiting for code update to complete..."
    MAX_WAIT=60
    WAIT_COUNT=0
    while [ $WAIT_COUNT -lt $MAX_WAIT ]; do
        FUNCTION_STATE=$(aws lambda get-function-configuration \
            --function-name "$FUNCTION_NAME" \
            --region "$REGION" \
            --query 'LastUpdateStatus' \
            --output text 2>/dev/null)
        
        if [ "$FUNCTION_STATE" == "Successful" ] || [ "$FUNCTION_STATE" == "InProgress" ]; then
            if [ "$FUNCTION_STATE" == "Successful" ]; then
                echo "   ✅ Code update completed"
                break
            else
                echo "   ⏳ Still updating... (${WAIT_COUNT}s)"
                sleep 2
                WAIT_COUNT=$((WAIT_COUNT + 2))
            fi
        else
            # If we can't determine state, wait a bit and proceed
            echo "   ⏳ Waiting for update to stabilize... (${WAIT_COUNT}s)"
            sleep 2
            WAIT_COUNT=$((WAIT_COUNT + 2))
        fi
    done
    
    if [ $WAIT_COUNT -ge $MAX_WAIT ]; then
        echo "   ⚠️  Timeout waiting for code update, proceeding anyway..."
    fi
    
    # Additional small delay to ensure update is fully propagated
    sleep 3
    
    # Update function configuration
    echo "⚙️  Updating function configuration..."
    
    # Build environment variables JSON
    ENV_JSON="/tmp/lambda-env-${STAGE}-$(date +%s).json"
    
    # Verify variables are still available before building JSON
    echo "   🔍 Checking variables before building JSON:"
    echo "      INSTAMOJO_API_KEY: ${INSTAMOJO_API_KEY:0:8}... (length: ${#INSTAMOJO_API_KEY})"
    echo "      INSTAMOJO_AUTH_TOKEN: ${INSTAMOJO_AUTH_TOKEN:0:8}... (length: ${#INSTAMOJO_AUTH_TOKEN})"
    
    ./scripts/build-env-json.sh "$ENV_JSON"
    
    # Verify Instamojo credentials are in the JSON
    if [ -f "$ENV_JSON" ]; then
        INSTAMOJO_KEY_IN_JSON=$(jq -r '.Variables.INSTAMOJO_API_KEY // ""' "$ENV_JSON")
        INSTAMOJO_TOKEN_IN_JSON=$(jq -r '.Variables.INSTAMOJO_AUTH_TOKEN // ""' "$ENV_JSON")
        if [ -n "$INSTAMOJO_KEY_IN_JSON" ] && [ -n "$INSTAMOJO_TOKEN_IN_JSON" ]; then
            echo "   ✅ Instamojo credentials included in environment JSON"
            echo "      API Key: ${INSTAMOJO_KEY_IN_JSON:0:8}... (length: ${#INSTAMOJO_KEY_IN_JSON})"
            echo "      Auth Token: ${INSTAMOJO_TOKEN_IN_JSON:0:8}... (length: ${#INSTAMOJO_TOKEN_IN_JSON})"
        else
            echo "   ⚠️  Warning: Instamojo credentials missing from environment JSON"
            echo "      API Key in JSON: ${INSTAMOJO_KEY_IN_JSON:-EMPTY} (length: ${#INSTAMOJO_KEY_IN_JSON})"
            echo "      Auth Token in JSON: ${INSTAMOJO_TOKEN_IN_JSON:-EMPTY} (length: ${#INSTAMOJO_TOKEN_IN_JSON})"
            echo "   🔍 Debug: Current environment variables:"
            echo "      INSTAMOJO_API_KEY: ${INSTAMOJO_API_KEY:-EMPTY} (length: ${#INSTAMOJO_API_KEY})"
            echo "      INSTAMOJO_AUTH_TOKEN: ${INSTAMOJO_AUTH_TOKEN:-EMPTY} (length: ${#INSTAMOJO_AUTH_TOKEN})"
            echo "   📄 Showing relevant part of JSON file:"
            jq '.Variables | {INSTAMOJO_API_KEY, INSTAMOJO_AUTH_TOKEN, INSTAMOJO_SALT}' "$ENV_JSON" || echo "   ❌ Failed to parse JSON"
        fi
    else
        echo "   ❌ Environment JSON file not found: $ENV_JSON"
    fi
    
    if [ -n "${FIREBASE_SERVICE_ACCOUNT:-}" ]; then
        echo "   ✅ Including FIREBASE_SERVICE_ACCOUNT in environment variables"
    else
        echo "   ⚠️  FIREBASE_SERVICE_ACCOUNT not set - FCM notifications may not work"
    fi
    
    # Show what we're about to send (for debugging)
    echo "   📋 Environment variables being sent to Lambda:"
    jq '.Variables | {INSTAMOJO_API_KEY, INSTAMOJO_AUTH_TOKEN, INSTAMOJO_SALT}' "$ENV_JSON" 2>/dev/null || echo "   ⚠️  Could not parse JSON file"
    
    # Retry logic for configuration update (in case of ResourceConflictException)
    MAX_RETRIES=5
    RETRY_COUNT=0
    UPDATE_RESULT=1
    
    while [ $RETRY_COUNT -lt $MAX_RETRIES ] && [ $UPDATE_RESULT -ne 0 ]; do
        if [ $RETRY_COUNT -gt 0 ]; then
            echo "   🔄 Retrying configuration update (attempt $((RETRY_COUNT + 1))/$MAX_RETRIES)..."
            sleep 5
        fi
        
        aws lambda update-function-configuration \
            --function-name "$FUNCTION_NAME" \
            --runtime nodejs20.x \
            --handler lambda.handler \
            --timeout 30 \
            --memory-size 1024 \
            --environment "file://$ENV_JSON" \
            --region "$REGION" \
            --output json > /tmp/lambda-config.json 2>&1
        
        UPDATE_RESULT=$?
        
        if [ $UPDATE_RESULT -ne 0 ]; then
            ERROR_MSG=$(cat /tmp/lambda-config.json | grep -o '"errorMessage":"[^"]*' | cut -d'"' -f4 || cat /tmp/lambda-config.json | grep -o 'error occurred[^<]*' || echo "Unknown error")
            if echo "$ERROR_MSG" | grep -q "ResourceConflictException"; then
                echo "   ⏳ Code update still in progress, waiting..."
                sleep 5
            else
                echo "   ⚠️  Configuration update failed: $ERROR_MSG"
                break
            fi
        fi
        
        RETRY_COUNT=$((RETRY_COUNT + 1))
    done
    
    if [ $UPDATE_RESULT -ne 0 ]; then
        echo "⚠️  Warning: Failed to update configuration after $MAX_RETRIES attempts"
        cat /tmp/lambda-config.json
    else
        echo "✅ Configuration updated"
        
        # Verify the update was successful and check what was actually set
        echo "   🔍 Verifying environment variables in Lambda..."
        sleep 2  # Wait a moment for the update to propagate
        ACTUAL_ENV=$(aws lambda get-function-configuration \
            --function-name "$FUNCTION_NAME" \
            --region "$REGION" \
            --query 'Environment.Variables' \
            --output json 2>/dev/null)
        
        if [ -n "$ACTUAL_ENV" ]; then
            INSTAMOJO_KEY_ACTUAL=$(echo "$ACTUAL_ENV" | jq -r '.INSTAMOJO_API_KEY // ""')
            INSTAMOJO_TOKEN_ACTUAL=$(echo "$ACTUAL_ENV" | jq -r '.INSTAMOJO_AUTH_TOKEN // ""')
            if [ -n "$INSTAMOJO_KEY_ACTUAL" ] && [ "$INSTAMOJO_KEY_ACTUAL" != "null" ]; then
                echo "   ✅ Instamojo credentials verified in Lambda (API Key: ${INSTAMOJO_KEY_ACTUAL:0:8}...)"
            else
                echo "   ⚠️  Warning: Instamojo credentials not found in Lambda after update"
                echo "      API Key: ${INSTAMOJO_KEY_ACTUAL:-null}"
                echo "      Auth Token: ${INSTAMOJO_TOKEN_ACTUAL:-null}"
                echo "   💡 The JSON file is saved at: $ENV_JSON (for debugging)"
            fi
        fi
    fi
    
    # Keep the JSON file for debugging (don't delete immediately)
    # rm -f "$ENV_JSON"
    
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
    
    # Build environment variables JSON
    ENV_JSON="/tmp/lambda-env-create-${STAGE}-$(date +%s).json"
    ./scripts/build-env-json.sh "$ENV_JSON"
    
    # Verify Instamojo credentials are in the JSON
    if [ -f "$ENV_JSON" ]; then
        INSTAMOJO_KEY_IN_JSON=$(jq -r '.Variables.INSTAMOJO_API_KEY // ""' "$ENV_JSON")
        INSTAMOJO_TOKEN_IN_JSON=$(jq -r '.Variables.INSTAMOJO_AUTH_TOKEN // ""' "$ENV_JSON")
        if [ -n "$INSTAMOJO_KEY_IN_JSON" ] && [ -n "$INSTAMOJO_TOKEN_IN_JSON" ]; then
            echo "   ✅ Instamojo credentials included in environment JSON"
        else
            echo "   ⚠️  Warning: Instamojo credentials missing from environment JSON"
            echo "      API Key in JSON: ${INSTAMOJO_KEY_IN_JSON:-EMPTY}"
            echo "      Auth Token in JSON: ${INSTAMOJO_TOKEN_IN_JSON:-EMPTY}"
        fi
    fi
    
    if [ -n "${FIREBASE_SERVICE_ACCOUNT:-}" ]; then
        echo "   ✅ Including FIREBASE_SERVICE_ACCOUNT in environment variables"
    else
        echo "   ⚠️  FIREBASE_SERVICE_ACCOUNT not set - FCM notifications may not work"
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
            --environment "file://$ENV_JSON" \
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
            --environment "file://$ENV_JSON" \
            --region "$REGION" \
            --output json > /tmp/lambda-create.json 2>&1
    fi
    
    rm -f "$ENV_JSON"
    
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
    echo "🎉 Your Production API is live at:"
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
        echo "🎉 Your Production API is live at:"
        echo "   $FUNCTION_URL"
        echo ""
        echo "🧪 Test it:"
        echo "   curl $FUNCTION_URL/api/test"
    fi
fi

# Cleanup
rm -f "$ZIP_FILE" /tmp/lambda-*.json

echo ""
echo "✅ Production deployment complete!"

