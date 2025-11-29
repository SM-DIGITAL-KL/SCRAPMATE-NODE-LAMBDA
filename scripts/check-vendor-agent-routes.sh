#!/bin/bash

# Check Vendor and Agent Routes Status
# Usage: ./scripts/check-vendor-agent-routes.sh [api-name] [region]
# Example: ./scripts/check-vendor-agent-routes.sh scrapmate-api-dev ap-south-1

API_NAME=${1:-scrapmate-api-dev}
REGION=${2:-ap-south-1}

echo "🔍 Checking Vendor and Agent Routes Status"
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
echo "📋 Vendor Routes Status (webRoutes.js lines 52-62)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Vendor routes
declare -a VENDOR_ROUTES=(
    "GET /vendors"
    "GET /api/vendors"
    "ANY /manage_vendors"
    "ANY /api/manage_vendors"
)

VENDOR_MISSING=0
VENDOR_EXISTS=0

for ROUTE_KEY in "${VENDOR_ROUTES[@]}"; do
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
            VENDOR_EXISTS=$((VENDOR_EXISTS + 1))
        else
            echo "⚠️  $ROUTE_KEY -> Wrong target: $TARGET"
            VENDOR_MISSING=$((VENDOR_MISSING + 1))
        fi
    else
        echo "❌ $ROUTE_KEY -> NOT FOUND"
        VENDOR_MISSING=$((VENDOR_MISSING + 1))
    fi
done

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📋 Agent Routes Status (webRoutes.js lines 64-102)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Agent routes
declare -a AGENT_ROUTES=(
    "GET /agents"
    "GET /api/agents"
    "GET /agents_leads"
    "GET /api/agents_leads"
    "ANY /manage_leads"
    "ANY /api/manage_leads"
    "ANY /manage_agent"
    "ANY /api/manage_agent"
    "ANY /manage_agent/{id}"
    "ANY /api/manage_agent/{id}"
    "GET /view_shops"
    "GET /api/view_shops"
    "GET /shop_view_by_id/{id}"
    "GET /api/shop_view_by_id/{id}"
    "ANY /createCategory/{id}"
    "ANY /api/createCategory/{id}"
    "ANY /createItem/{shopid}/{catid}"
    "ANY /api/createItem/{shopid}/{catid}"
    "GET /shop_status_change/{id}"
    "GET /api/shop_status_change/{id}"
    "GET /view_del_boy/{id}"
    "GET /api/view_del_boy/{id}"
    "GET /del_shop/{id}"
    "GET /api/del_shop/{id}"
    "ANY /show_shop_images"
    "ANY /api/show_shop_images"
    "ANY /show_shop_images/{id}"
    "ANY /api/show_shop_images/{id}"
    "ANY /agent_report"
    "ANY /api/agent_report"
    "ANY /commission_track"
    "ANY /api/commission_track"
)

AGENT_MISSING=0
AGENT_EXISTS=0

for ROUTE_KEY in "${AGENT_ROUTES[@]}"; do
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
            AGENT_EXISTS=$((AGENT_EXISTS + 1))
        else
            echo "⚠️  $ROUTE_KEY -> Wrong target: $TARGET"
            AGENT_MISSING=$((AGENT_MISSING + 1))
        fi
    else
        echo "❌ $ROUTE_KEY -> NOT FOUND"
        AGENT_MISSING=$((AGENT_MISSING + 1))
    fi
done

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 Summary:"
echo "   Vendor Routes:"
echo "      ✅ Configured: $VENDOR_EXISTS"
echo "      ❌ Missing/Wrong: $VENDOR_MISSING"
echo "      Total: ${#VENDOR_ROUTES[@]}"
echo ""
echo "   Agent Routes:"
echo "      ✅ Configured: $AGENT_EXISTS"
echo "      ❌ Missing/Wrong: $AGENT_MISSING"
echo "      Total: ${#AGENT_ROUTES[@]}"
echo ""
echo "   Overall:"
TOTAL_EXISTS=$((VENDOR_EXISTS + AGENT_EXISTS))
TOTAL_MISSING=$((VENDOR_MISSING + AGENT_MISSING))
TOTAL_ROUTES=$((${#VENDOR_ROUTES[@]} + ${#AGENT_ROUTES[@]}))
echo "      ✅ Configured: $TOTAL_EXISTS"
echo "      ❌ Missing/Wrong: $TOTAL_MISSING"
echo "      Total: $TOTAL_ROUTES"
echo ""
echo "🧪 Test Endpoints:"
echo "   curl ${API_ENDPOINT}/api/vendors -H 'api-key: zyubkfzeumeoviaqzcsrvfwdzbiwnlnn'"
echo "   curl ${API_ENDPOINT}/api/agents -H 'api-key: zyubkfzeumeoviaqzcsrvfwdzbiwnlnn'"
echo "   curl ${API_ENDPOINT}/api/view_shops -H 'api-key: zyubkfzeumeoviaqzcsrvfwdzbiwnlnn'"
echo ""

