#!/bin/bash

# Check Admin Routes Status
# Usage: ./scripts/check-admin-routes.sh [api-name] [region]
# Example: ./scripts/check-admin-routes.sh scrapmate-api-dev ap-south-1

API_NAME=${1:-scrapmate-api-dev}
REGION=${2:-ap-south-1}

echo "🔍 Checking Admin Routes Status"
echo "   API: $API_NAME"
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
    exit 1
fi

API_ENDPOINT=$(aws apigatewayv2 get-api --api-id "$API_ID" --region "$REGION" --query ApiEndpoint --output text)

echo "✅ API Gateway found: $API_ID"
echo "   Endpoint: $API_ENDPOINT"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📋 Admin Routes Status (from webRoutes.js lines 32-51)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Define routes to check
declare -a ROUTES=(
    "GET /admin/dashboard"
    "GET /api/admin/dashboard"
    "GET /users"
    "GET /api/users"
    "ANY /manage_users"
    "ANY /api/manage_users"
    "ANY /manage_users/{id}"
    "ANY /api/manage_users/{id}"
    "GET /view_users"
    "GET /api/view_users"
    "GET /admin/view_users"
    "GET /api/admin/view_users"
    "GET /del_user/{id}"
    "GET /api/del_user/{id}"
    "ANY /user_password_reset/{id}"
    "ANY /api/user_password_reset/{id}"
    "GET /set_permission"
    "GET /api/set_permission"
    "GET /set_permission/{id}"
    "GET /api/set_permission/{id}"
    "ANY /store_user_per"
    "ANY /api/store_user_per"
    "ANY /check_distance"
    "ANY /api/check_distance"
    "ANY /signUpReport"
    "ANY /api/signUpReport"
    "ANY /custNotification"
    "ANY /api/custNotification"
    "ANY /vendorNotification"
    "ANY /api/vendorNotification"
    "POST /sendCustNotification"
    "POST /api/sendCustNotification"
    "POST /sendVendorNotification"
    "POST /api/sendVendorNotification"
    "GET /callLogSearch"
    "GET /api/callLogSearch"
    "GET /getcallLogSearch"
    "GET /api/getcallLogSearch"
)

MISSING_COUNT=0
EXISTS_COUNT=0

for ROUTE_KEY in "${ROUTES[@]}"; do
    ROUTE_ID=$(aws apigatewayv2 get-routes \
        --api-id "$API_ID" \
        --region "$REGION" \
        --query "Items[?RouteKey=='$ROUTE_KEY'].RouteId" \
        --output text 2>/dev/null | head -1)
    
    if [ -n "$ROUTE_ID" ] && [ "$ROUTE_ID" != "None" ]; then
        TARGET=$(aws apigatewayv2 get-route \
            --api-id "$API_ID" \
            --route-id "$ROUTE_ID" \
            --region "$REGION" \
            --query 'Target' \
            --output text 2>/dev/null)
        
        if [[ "$TARGET" == *"3cchzqa"* ]] || [[ "$TARGET" == *"scrapmate-ms-dev-web"* ]]; then
            echo "✅ $ROUTE_KEY"
            EXISTS_COUNT=$((EXISTS_COUNT + 1))
        else
            echo "⚠️  $ROUTE_KEY -> Wrong target: $TARGET"
            MISSING_COUNT=$((MISSING_COUNT + 1))
        fi
    else
        echo "❌ $ROUTE_KEY -> NOT FOUND"
        MISSING_COUNT=$((MISSING_COUNT + 1))
    fi
done

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 Summary:"
echo "   ✅ Configured: $EXISTS_COUNT"
echo "   ❌ Missing/Wrong: $MISSING_COUNT"
echo "   Total: ${#ROUTES[@]}"
echo ""
echo "🧪 Test Endpoints:"
echo "   curl ${API_ENDPOINT}/api/admin/dashboard -H 'api-key: zyubkfzeumeoviaqzcsrvfwdzbiwnlnn'"
echo "   curl ${API_ENDPOINT}/api/view_users -H 'api-key: zyubkfzeumeoviaqzcsrvfwdzbiwnlnn'"
echo "   curl ${API_ENDPOINT}/api/users -H 'api-key: zyubkfzeumeoviaqzcsrvfwdzbiwnlnn'"
echo ""

