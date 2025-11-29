#!/bin/bash

# Add missing routes to API Gateway
# Usage: ./scripts/add-missing-routes.sh [api-name] [stage] [region]

API_NAME=${1:-scrapmate-api-dev}
STAGE=${2:-dev}
REGION=${3:-ap-south-1}

echo "🔗 Adding Missing Routes to API Gateway"
echo "   API: $API_NAME"
echo "   Stage: $STAGE"
echo "   Region: $REGION"
echo ""

# Load AWS credentials
if [ -f "aws.txt" ]; then
    source aws.txt 2>/dev/null
fi

export AWS_REGION=${AWS_REGION:-$REGION}

# Find API Gateway
API_ID=$(aws apigatewayv2 get-apis --region "$REGION" --query "Items[?Name=='$API_NAME'].ApiId" --output text 2>/dev/null)
if [ -z "$API_ID" ] || [ "$API_ID" == "None" ]; then
    echo "❌ API Gateway '$API_NAME' not found."
    exit 1
fi

FUNCTION_PREFIX="scrapmate-ms-${STAGE}"

# Missing routes to add
# Format: METHOD|PATH|SERVICE
MISSING_ROUTES=(
    "POST|/api/login_app|auth"
    "POST|/api/profile_update|user"
)

for route_entry in "${MISSING_ROUTES[@]}"; do
    IFS='|' read -r method path service <<< "$route_entry"
    
    FUNCTION_NAME="${FUNCTION_PREFIX}-${service}"
    ROUTE_KEY="${method} ${path}"
    
    echo "📋 Adding: $ROUTE_KEY → $service service"
    
    # Get Lambda function ARN
    FUNCTION_ARN=$(aws lambda get-function --function-name "$FUNCTION_NAME" --region "$REGION" --query 'Configuration.FunctionArn' --output text 2>/dev/null)
    if [ -z "$FUNCTION_ARN" ] || [ "$FUNCTION_ARN" == "None" ]; then
        echo "   ❌ Lambda function '$FUNCTION_NAME' not found. Skipping."
        continue
    fi
    
    # Check if route already exists
    EXISTING_ROUTE_ID=$(aws apigatewayv2 get-routes \
        --api-id "$API_ID" \
        --region "$REGION" \
        --query "Items[?RouteKey=='$ROUTE_KEY'].RouteId" \
        --output text 2>/dev/null | head -1)
    
    if [ -n "$EXISTING_ROUTE_ID" ] && [ "$EXISTING_ROUTE_ID" != "None" ]; then
        echo "   ✅ Route already exists: $EXISTING_ROUTE_ID"
        continue
    fi
    
    # Create/Get integration
    INTEGRATION_URI="arn:aws:apigateway:${REGION}:lambda:path/2015-03-31/functions/${FUNCTION_ARN}/invocations"
    INTEGRATION_ID=$(aws apigatewayv2 get-integrations \
        --api-id "$API_ID" \
        --region "$REGION" \
        --query "Items[?IntegrationUri=='$INTEGRATION_URI'].IntegrationId" \
        --output text 2>/dev/null | head -1)
    
    if [ -z "$INTEGRATION_ID" ] || [ "$INTEGRATION_ID" == "None" ]; then
        echo "   🔗 Creating integration..."
        INTEGRATION_ID=$(aws apigatewayv2 create-integration \
            --api-id "$API_ID" \
            --integration-type AWS_PROXY \
            --integration-uri "$INTEGRATION_URI" \
            --integration-method POST \
            --payload-format-version "2.0" \
            --region "$REGION" \
            --query 'IntegrationId' \
            --output text 2>/dev/null)
        
        if [ -z "$INTEGRATION_ID" ] || [ "$INTEGRATION_ID" == "None" ]; then
            echo "   ❌ Failed to create integration"
            continue
        fi
        
        # Grant permission
        ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
        SOURCE_ARN="arn:aws:execute-api:${REGION}:${ACCOUNT_ID}:${API_ID}/*/*"
        aws lambda add-permission \
            --function-name "$FUNCTION_NAME" \
            --statement-id "api-gateway-${service}-$(date +%s)" \
            --action lambda:InvokeFunction \
            --principal apigateway.amazonaws.com \
            --source-arn "$SOURCE_ARN" \
            --region "$REGION" >/dev/null 2>&1
    fi
    
    # Create route
    ROUTE_ID=$(aws apigatewayv2 create-route \
        --api-id "$API_ID" \
        --route-key "$ROUTE_KEY" \
        --target "integrations/$INTEGRATION_ID" \
        --region "$REGION" \
        --query 'RouteId' \
        --output text 2>/dev/null)
    
    if [ -n "$ROUTE_ID" ] && [ "$ROUTE_ID" != "None" ]; then
        echo "   ✅ Route created: $ROUTE_ID"
    else
        echo "   ❌ Failed to create route"
    fi
done

echo ""
echo "✅ Done!"

