#!/bin/bash

# Setup $default route for API Gateway
# This script deletes all existing routes and creates a $default route
# Usage: ./scripts/setup-default-route.sh [api-name] [webservice-url] [stage] [region]
# Example: ./scripts/setup-default-route.sh scrapmate-api-dev http://your-webservice-url dev ap-south-1

set -e

API_NAME=${1:-scrapmate-api-dev}
WEBSERVICE_URL=${2:-""}
STAGE=${3:-dev}
REGION=${4:-ap-south-1}

echo "🚀 Setting up \$default route for API Gateway"
echo "   API Name: $API_NAME"
echo "   Stage: $STAGE (using \$default)"
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

# Find API Gateway
echo "📡 Finding API Gateway..."
API_ID=$(aws apigatewayv2 get-apis --region "$REGION" --query "Items[?Name=='$API_NAME'].ApiId" --output text 2>/dev/null)
if [ -z "$API_ID" ] || [ "$API_ID" == "None" ]; then
    echo "❌ API Gateway '$API_NAME' not found"
    exit 1
fi

echo "✅ Found API Gateway: $API_ID"
API_ENDPOINT=$(aws apigatewayv2 get-api --api-id "$API_ID" --region "$REGION" --query 'ApiEndpoint' --output text 2>/dev/null)
echo "   🌐 Endpoint: $API_ENDPOINT"
echo ""

# Step 1: Delete all existing routes
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📋 Step 1: Deleting all existing routes..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

ROUTES=$(aws apigatewayv2 get-routes --api-id "$API_ID" --region "$REGION" --query 'Items[*].RouteId' --output text 2>/dev/null)
DELETED_COUNT=0

if [ -n "$ROUTES" ] && [ "$ROUTES" != "None" ]; then
    for ROUTE_ID in $ROUTES; do
        ROUTE_KEY=$(aws apigatewayv2 get-route --api-id "$API_ID" --route-id "$ROUTE_ID" --region "$REGION" --query 'RouteKey' --output text 2>/dev/null)
        if aws apigatewayv2 delete-route --api-id "$API_ID" --route-id "$ROUTE_ID" --region "$REGION" >/dev/null 2>&1; then
            echo "   ✅ Deleted: $ROUTE_KEY"
            DELETED_COUNT=$((DELETED_COUNT + 1))
        else
            echo "   ❌ Failed to delete route: $ROUTE_ID"
        fi
    done
    echo ""
    echo "   📊 Deleted $DELETED_COUNT route(s)"
else
    echo "   ℹ️  No existing routes found"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Step 2: Get or create integration
echo "📋 Step 2: Setting up integration..."
echo ""

if [ -z "$WEBSERVICE_URL" ]; then
    echo "⚠️  No webservice URL provided"
    echo "   If you're using Lambda, we'll use the utility service Lambda function"
    echo ""
    
    FUNCTION_PREFIX="scrapmate-ms-${STAGE}"
    FUNCTION_NAME="${FUNCTION_PREFIX}-utility"
    
    # Check if function exists
    if ! aws lambda get-function --function-name "$FUNCTION_NAME" --region "$REGION" >/dev/null 2>&1; then
        echo "❌ Lambda function '$FUNCTION_NAME' not found"
        echo "   Please provide a webservice URL or ensure Lambda functions are deployed"
        exit 1
    fi
    
    # Get Lambda function ARN
    FUNCTION_ARN=$(aws lambda get-function --function-name "$FUNCTION_NAME" --region "$REGION" --query 'Configuration.FunctionArn' --output text 2>/dev/null)
    INTEGRATION_URI="arn:aws:apigateway:${REGION}:lambda:path/2015-03-31/functions/${FUNCTION_ARN}/invocations"
    INTEGRATION_TYPE="AWS_PROXY"
    
    echo "   Using Lambda function: $FUNCTION_NAME"
    echo "   Integration URI: $INTEGRATION_URI"
else
    INTEGRATION_URI="$WEBSERVICE_URL"
    INTEGRATION_TYPE="HTTP_PROXY"
    echo "   Using webservice URL: $WEBSERVICE_URL"
fi

# Check if integration exists
INTEGRATIONS=$(aws apigatewayv2 get-integrations --api-id "$API_ID" --region "$REGION" 2>/dev/null)
INTEGRATION_ID=""

# Try to find existing integration
if [ "$INTEGRATION_TYPE" == "AWS_PROXY" ]; then
    for integ in $(echo "$INTEGRATIONS" | grep -o '"IntegrationId":"[^"]*"' | sed 's/"IntegrationId":"\([^"]*\)"/\1/'); do
        INTEG_URI=$(aws apigatewayv2 get-integration --api-id "$API_ID" --integration-id "$integ" --region "$REGION" --query 'IntegrationUri' --output text 2>/dev/null)
        if [ "$INTEG_URI" == "$INTEGRATION_URI" ]; then
            INTEGRATION_ID="$integ"
            break
        fi
    done
fi

if [ -z "$INTEGRATION_ID" ]; then
    echo "   🔗 Creating integration..."
    
    if [ "$INTEGRATION_TYPE" == "AWS_PROXY" ]; then
        INTEGRATION_ID=$(aws apigatewayv2 create-integration \
            --api-id "$API_ID" \
            --integration-type "$INTEGRATION_TYPE" \
            --integration-uri "$INTEGRATION_URI" \
            --integration-method POST \
            --payload-format-version "2.0" \
            --region "$REGION" \
            --query 'IntegrationId' \
            --output text 2>/dev/null)
        
        # Grant Lambda invoke permission
        ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text 2>/dev/null)
        SOURCE_ARN="arn:aws:execute-api:${REGION}:${ACCOUNT_ID}:${API_ID}/*/*"
        aws lambda add-permission \
            --function-name "$FUNCTION_NAME" \
            --statement-id "api-gateway-default-$(date +%s)" \
            --action lambda:InvokeFunction \
            --principal apigateway.amazonaws.com \
            --source-arn "$SOURCE_ARN" \
            --region "$REGION" >/dev/null 2>&1 && echo "   ✅ Lambda permission granted" || echo "   ⚠️  Permission may already exist"
    else
        INTEGRATION_ID=$(aws apigatewayv2 create-integration \
            --api-id "$API_ID" \
            --integration-type "$INTEGRATION_TYPE" \
            --integration-uri "$INTEGRATION_URI" \
            --integration-method ANY \
            --region "$REGION" \
            --query 'IntegrationId' \
            --output text 2>/dev/null)
    fi
    
    if [ -z "$INTEGRATION_ID" ] || [ "$INTEGRATION_ID" == "None" ]; then
        echo "   ❌ Failed to create integration"
        exit 1
    fi
    
    echo "   ✅ Integration created: $INTEGRATION_ID"
else
    echo "   ✅ Integration exists: $INTEGRATION_ID"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Step 3: Create $default route
echo "📋 Step 3: Creating \$default route..."
echo ""

# Check if $default route already exists
EXISTING_DEFAULT=$(aws apigatewayv2 get-routes --api-id "$API_ID" --region "$REGION" --query "Items[?RouteKey=='\$default'].RouteId" --output text 2>/dev/null)

if [ -n "$EXISTING_DEFAULT" ] && [ "$EXISTING_DEFAULT" != "None" ]; then
    echo "   ⚠️  \$default route already exists, updating..."
    if aws apigatewayv2 update-route \
        --api-id "$API_ID" \
        --route-id "${EXISTING_DEFAULT%% *}" \
        --target "integrations/$INTEGRATION_ID" \
        --region "$REGION" >/dev/null 2>&1; then
        echo "   ✅ Updated \$default route"
    else
        echo "   ❌ Failed to update \$default route"
        exit 1
    fi
else
    echo "   🔗 Creating \$default route..."
    if aws apigatewayv2 create-route \
        --api-id "$API_ID" \
        --route-key "\$default" \
        --target "integrations/$INTEGRATION_ID" \
        --region "$REGION" >/dev/null 2>&1; then
        echo "   ✅ Created \$default route"
    else
        echo "   ❌ Failed to create \$default route"
        exit 1
    fi
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Step 4: Create or update stage
echo "📋 Step 4: Setting up stage..."
echo ""

# Check if $default stage exists
if aws apigatewayv2 get-stage --api-id "$API_ID" --stage-name "\$default" --region "$REGION" >/dev/null 2>&1; then
    echo "   ✅ \$default stage exists"
else
    echo "   🔗 Creating \$default stage..."
    aws apigatewayv2 create-stage \
        --api-id "$API_ID" \
        --stage-name "\$default" \
        --auto-deploy \
        --region "$REGION" >/dev/null 2>&1
    echo "   ✅ Created \$default stage"
fi

FINAL_ENDPOINT="${API_ENDPOINT}"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Setup Complete!"
echo ""
echo "📊 Summary:"
echo "   API ID: $API_ID"
echo "   API Name: $API_NAME"
echo "   Stage: \$default"
echo "   Endpoint: $FINAL_ENDPOINT"
echo "   Integration: $INTEGRATION_ID"
echo ""
echo "🧪 Test Endpoint:"
echo "   curl $FINAL_ENDPOINT/api/get_all_tables -H 'api-key: zyubkfzeumeoviaqzcsrvfwdzbiwnlnn'"
echo ""
echo "💡 All requests will be routed through the \$default route to your integration"
echo ""

