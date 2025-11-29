#!/bin/bash

# Add delivery service routes to API Gateway
# Usage: ./scripts/add-delivery-routes.sh [api-name] [stage] [region]

set -e

API_NAME=${1:-scrapmate-api-dev}
STAGE=${2:-dev}
REGION=${3:-ap-south-1}
FUNCTION_PREFIX="scrapmate-ms-${STAGE}"
SERVICE="delivery"
FUNCTION_NAME="${FUNCTION_PREFIX}-${SERVICE}"

echo "🚀 Adding Delivery Service Routes to API Gateway"
echo "   API Name: $API_NAME"
echo "   Function: $FUNCTION_NAME"
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
    echo "❌ API Gateway '$API_NAME' not found"
    exit 1
fi

echo "✅ Found API Gateway: $API_ID"

# Check if function exists
if ! aws lambda get-function --function-name "$FUNCTION_NAME" --region "$REGION" >/dev/null 2>&1; then
    echo "❌ Lambda function '$FUNCTION_NAME' not found"
    exit 1
fi

# Get Lambda function ARN
FUNCTION_ARN=$(aws lambda get-function --function-name "$FUNCTION_NAME" --region "$REGION" --query 'Configuration.FunctionArn' --output text 2>/dev/null)
INTEGRATION_URI="arn:aws:apigateway:${REGION}:lambda:path/2015-03-31/functions/${FUNCTION_ARN}/invocations"

# Get or create integration
INTEGRATIONS=$(aws apigatewayv2 get-integrations --api-id "$API_ID" --region "$REGION" 2>/dev/null)
INTEGRATION_ID=""
for integ in $(echo "$INTEGRATIONS" | grep -o '"IntegrationId":"[^"]*"' | sed 's/"IntegrationId":"\([^"]*\)"/\1/'); do
    INTEG_URI=$(aws apigatewayv2 get-integration --api-id "$API_ID" --integration-id "$integ" --region "$REGION" --query 'IntegrationUri' --output text 2>/dev/null)
    if [ "$INTEG_URI" == "$INTEGRATION_URI" ]; then
        INTEGRATION_ID="$integ"
        break
    fi
done

if [ -z "$INTEGRATION_ID" ]; then
    echo "🔗 Creating integration..."
    INTEGRATION_ID=$(aws apigatewayv2 create-integration \
        --api-id "$API_ID" \
        --integration-type AWS_PROXY \
        --integration-uri "$INTEGRATION_URI" \
        --integration-method POST \
        --payload-format-version "2.0" \
        --region "$REGION" \
        --query 'IntegrationId' \
        --output text 2>/dev/null)
    echo "✅ Integration created: $INTEGRATION_ID"
    
    # Grant Lambda invoke permission
    ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text 2>/dev/null)
    SOURCE_ARN="arn:aws:execute-api:${REGION}:${ACCOUNT_ID}:${API_ID}/*/*"
    aws lambda add-permission \
        --function-name "$FUNCTION_NAME" \
        --statement-id "api-gateway-delivery-$(date +%s)" \
        --action lambda:InvokeFunction \
        --principal apigateway.amazonaws.com \
        --source-arn "$SOURCE_ARN" \
        --region "$REGION" >/dev/null 2>&1 && echo "✅ Permission granted" || echo "⚠️  Permission may already exist"
else
    echo "✅ Integration exists: $INTEGRATION_ID"
fi

# Delivery routes from services/delivery/routes.js
DELIVERY_ROUTES=(
    "POST /api/delv_boy_add"
    "GET /api/delivery_boy_list/{id}"
    "POST /api/delivery_boy_edit"
    "GET /api/delv_boy_delete/{deliveryBoyID}/{shop_id}"
    "GET /api/delv_orders/{delv_boy_id}"
    "GET /api/delv_completed_orders/{delv_boy_id}"
    "GET /api/delv_boy_dash_counts/{id}"
)

echo ""
echo "📋 Creating delivery routes..."
SUCCESS=0
FAILED=0

for ROUTE_KEY in "${DELIVERY_ROUTES[@]}"; do
    # Check if route exists
    EXISTING_ROUTE_ID=$(aws apigatewayv2 get-routes \
        --api-id "$API_ID" \
        --region "$REGION" \
        --query "Items[?RouteKey=='$ROUTE_KEY'].RouteId" \
        --output text 2>/dev/null)
    
    if [ -n "$EXISTING_ROUTE_ID" ] && [ "$EXISTING_ROUTE_ID" != "None" ]; then
        # Update existing route
        EXISTING_ROUTE_ID="${EXISTING_ROUTE_ID%% *}"
        if aws apigatewayv2 update-route \
            --api-id "$API_ID" \
            --route-id "$EXISTING_ROUTE_ID" \
            --target "integrations/$INTEGRATION_ID" \
            --region "$REGION" >/dev/null 2>&1; then
            echo "   ✅ Updated: $ROUTE_KEY"
            SUCCESS=$((SUCCESS + 1))
        else
            echo "   ❌ Failed to update: $ROUTE_KEY"
            FAILED=$((FAILED + 1))
        fi
    else
        # Create new route
        if aws apigatewayv2 create-route \
            --api-id "$API_ID" \
            --route-key "$ROUTE_KEY" \
            --target "integrations/$INTEGRATION_ID" \
            --region "$REGION" >/dev/null 2>&1; then
            echo "   ✅ Created: $ROUTE_KEY"
            SUCCESS=$((SUCCESS + 1))
        else
            echo "   ❌ Failed: $ROUTE_KEY"
            FAILED=$((FAILED + 1))
        fi
    fi
done

API_ENDPOINT=$(aws apigatewayv2 get-api --api-id "$API_ID" --region "$REGION" --query 'ApiEndpoint' --output text 2>/dev/null)
FINAL_ENDPOINT="${API_ENDPOINT}"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Complete!"
echo ""
echo "📊 Summary:"
echo "   Successful: $SUCCESS"
echo "   Failed: $FAILED"
echo ""
echo "🧪 Test Endpoint:"
echo "   curl $FINAL_ENDPOINT/api/delivery_boy_list/123 -H 'api-key: zyubkfzeumeoviaqzcsrvfwdzbiwnlnn'"
echo ""

