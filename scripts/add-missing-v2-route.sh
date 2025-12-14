#!/bin/bash

# Add missing V2 route to API Gateway
# Usage: ./scripts/add-missing-v2-route.sh "METHOD /api/v2/path/{param}" [service-name] [api-name] [stage] [region]
# Example: ./scripts/add-missing-v2-route.sh "GET /api/v2/categories" product-service
# Example: ./scripts/add-missing-v2-route.sh "DELETE /api/v2/profile/{userId}" user-service

set -e

ROUTE_KEY=${1:-""}
SERVICE_NAME=${2:-user}
API_NAME=${3:-scrapmate-api-dev}
STAGE=${4:-dev}
REGION=${5:-ap-south-1}
FUNCTION_PREFIX="scrapmate-ms-${STAGE}"

if [ -z "$ROUTE_KEY" ]; then
    echo "❌ Error: Route key is required"
    echo "   Usage: ./scripts/add-missing-v2-route.sh \"METHOD /api/v2/path/{param}\" [service-name] [api-name] [stage] [region]"
    echo "   Example: ./scripts/add-missing-v2-route.sh \"GET /api/v2/categories\" product-service"
    echo "   Example: ./scripts/add-missing-v2-route.sh \"DELETE /api/v2/profile/{userId}\" user-service"
    exit 1
fi

echo "🚀 Adding Missing V2 Route to API Gateway"
echo "   Route: $ROUTE_KEY"
echo "   API: $API_NAME"
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

# Find API Gateway
API_ID=$(aws apigatewayv2 get-apis --region "$REGION" --query "Items[?Name=='$API_NAME'].ApiId" --output text 2>/dev/null)
if [ -z "$API_ID" ] || [ "$API_ID" == "None" ]; then
    echo "❌ API Gateway '$API_NAME' not found."
    echo "   Available APIs:"
    aws apigatewayv2 get-apis --region "$REGION" --query 'Items[*].Name' --output table 2>/dev/null || true
    exit 1
fi

echo "✅ Found API Gateway: $API_ID"
echo ""

# Get Lambda function ARN for the specified service
# Note: Service name should be without '-service' suffix (e.g., 'product' not 'product-service')
FUNCTION_NAME="${FUNCTION_PREFIX}-${SERVICE_NAME}"
# Remove '-service' suffix if present
FUNCTION_NAME="${FUNCTION_NAME%-service}"
FUNCTION_ARN=$(aws lambda get-function --function-name "$FUNCTION_NAME" --region "$REGION" --query 'Configuration.FunctionArn' --output text 2>/dev/null)

if [ -z "$FUNCTION_ARN" ] || [ "$FUNCTION_ARN" == "None" ]; then
    echo "❌ Lambda function '$FUNCTION_NAME' not found"
    exit 1
fi

echo "✅ Found Lambda function: $FUNCTION_NAME"
echo "   ARN: $FUNCTION_ARN"
echo ""

# Get or create integration for the service
INTEGRATION_URI="arn:aws:apigateway:${REGION}:lambda:path/2015-03-31/functions/${FUNCTION_ARN}/invocations"
INTEGRATION_ID=$(aws apigatewayv2 get-integrations --api-id "$API_ID" --region "$REGION" \
    --query "Items[?IntegrationUri=='$INTEGRATION_URI'].IntegrationId | [0]" --output text 2>/dev/null | awk '{print $1}' | tr -d '\n\r\t ')

if [ -z "$INTEGRATION_ID" ] || [ ${#INTEGRATION_ID} -lt 5 ]; then
    echo "🔗 Creating ${SERVICE_NAME}-service integration..."
    INTEGRATION_ID=$(aws apigatewayv2 create-integration \
        --api-id "$API_ID" \
        --region "$REGION" \
        --integration-type AWS_PROXY \
        --integration-uri "$INTEGRATION_URI" \
        --integration-method POST \
        --payload-format-version "2.0" \
        --query 'IntegrationId' --output text)
    
    echo "✅ Integration created: $INTEGRATION_ID"
    
    # Grant Lambda invoke permission
    ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
    SOURCE_ARN="arn:aws:execute-api:${REGION}:${ACCOUNT_ID}:${API_ID}/*/*"
    aws lambda add-permission --function-name "$FUNCTION_NAME" \
        --region "$REGION" \
        --statement-id "apigw-v2-route-$(date +%s)" \
        --action lambda:InvokeFunction \
        --principal apigateway.amazonaws.com \
        --source-arn "$SOURCE_ARN" >/dev/null 2>&1 || true
else
    echo "✅ Using existing ${SERVICE_NAME}-service integration: $INTEGRATION_ID"
fi

echo ""

# Check if route already exists
EXISTING_ROUTE=$(aws apigatewayv2 get-routes --api-id "$API_ID" --region "$REGION" \
    --query "Items[?RouteKey=='$ROUTE_KEY'].RouteId | [0]" --output text 2>/dev/null | grep -v "None" | head -1)

if [ -n "$EXISTING_ROUTE" ] && [ ${#EXISTING_ROUTE} -gt 5 ]; then
    echo "✅ Route already exists: $ROUTE_KEY"
    echo "   Route ID: $EXISTING_ROUTE"
    echo "   Verifying integration..."
    
    CURRENT_TARGET=$(aws apigatewayv2 get-route --api-id "$API_ID" --route-id "$EXISTING_ROUTE" --region "$REGION" \
        --query 'Target' --output text 2>/dev/null)
    
    EXPECTED_TARGET="integrations/$INTEGRATION_ID"
    if [ "$CURRENT_TARGET" == "$EXPECTED_TARGET" ]; then
        echo "   ✅ Route is correctly configured"
    else
        echo "   🔄 Updating route target..."
        aws apigatewayv2 update-route \
            --api-id "$API_ID" \
            --route-id "$EXISTING_ROUTE" \
            --region "$REGION" \
            --target "$EXPECTED_TARGET" \
            >/dev/null 2>&1
        
        if [ $? -eq 0 ]; then
            echo "   ✅ Route updated successfully"
        else
            echo "   ⚠️  Could not update route (may already be correct)"
        fi
    fi
else
    echo "📝 Creating route: $ROUTE_KEY"
    
    ROUTE_ID=$(aws apigatewayv2 create-route \
        --api-id "$API_ID" \
        --region "$REGION" \
        --route-key "$ROUTE_KEY" \
        --target "integrations/$INTEGRATION_ID" \
        --query 'RouteId' --output text 2>/dev/null)
    
    if [ -z "$ROUTE_ID" ] || [ "$ROUTE_ID" == "None" ] || [ ${#ROUTE_ID} -lt 5 ]; then
        echo "❌ Failed to create route"
        echo "   Error details:"
        aws apigatewayv2 create-route \
            --api-id "$API_ID" \
            --region "$REGION" \
            --route-key "$ROUTE_KEY" \
            --target "integrations/$INTEGRATION_ID" 2>&1 | head -5
        exit 1
    fi
    
    echo "✅ Route created successfully"
    echo "   Route ID: $ROUTE_ID"
fi

# Extract method and path from route key
ROUTE_METHOD=$(echo "$ROUTE_KEY" | awk '{print $1}')
ROUTE_PATH=$(echo "$ROUTE_KEY" | awk '{print $2}')

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Missing V2 route added successfully!"
echo ""
echo "📋 Route Details:"
echo "   Method: $ROUTE_METHOD"
echo "   Path: $ROUTE_PATH"
echo "   Integration: ${SERVICE_NAME}-service ($INTEGRATION_ID)"
echo "   Lambda: $FUNCTION_NAME"
echo ""
echo "🚀 Triggering API Gateway Deployment..."
DEPLOYMENT_ID=$(aws apigatewayv2 create-deployment \
    --api-id "$API_ID" \
    --stage-name "$STAGE" \
    --description "Deployed via add-missing-v2-route.sh: $ROUTE_KEY" \
    --query 'DeploymentId' --output text 2>/dev/null)

if [ -n "$DEPLOYMENT_ID" ] && [ "$DEPLOYMENT_ID" != "None" ]; then
    echo "✅ Deployment created successfully!"
    echo "   Deployment ID: $DEPLOYMENT_ID"
    echo "   Stage: $STAGE"
else
    echo "⚠️  Deployment creation failed or no changes detected."
    # Sometimes it fails if no changes, which is fine, but we should let the user know.
    # However, since we just added a route, there should be changes.
    echo "   You might want to check the AWS Console or run: npx serverless deploy"
fi

echo ""
echo "💡 The route is now available in API Gateway"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

