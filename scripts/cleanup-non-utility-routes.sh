#!/bin/bash

# Delete all routes from API Gateway except utility routes
# Usage: ./scripts/cleanup-non-utility-routes.sh [api-name] [region]

set -e

API_NAME=${1:-scrapmate-api-dev}
REGION=${2:-ap-south-1}

echo "🧹 Cleaning up non-utility routes from API Gateway"
echo "   API Name: $API_NAME"
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
echo ""

# Get all routes
echo "📋 Fetching all routes..."
ROUTES_JSON=$(aws apigatewayv2 get-routes --api-id "$API_ID" --region "$REGION" 2>/dev/null)

# Utility routes to KEEP (from services/utility/routes.js)
UTILITY_ROUTES=(
    "POST /api/get_table"
    "POST /api/get_table_condition"
    "GET /api/count_row/{table_name}"
    "GET /api/keyword_search/{table}/{name}"
    "GET /api/get_user_by_id/{user_id}/{table}"
    "GET /api/get_all_tables"
    "POST /api/savecallLog"
    "POST /api/savecallLogCust"
    "POST /api/searchShopCallLogSave"
    "GET /api/stateAllow"
    "GET /api/packagesSub"
    "POST /api/saveUserPackages"
    "POST /api/paymentHistory"
    "GET /api/thirdPartyCredentials"
    "GET /api/versionCheck/{version}"
    "GET /api/smstesting"
    "POST /api/PermanentDelete"
    "POST /api/failedJobs"
    "POST /api/clear_redis_cache"
    "GET /api/metrics"
)

# Also keep $default route if it exists
KEEP_ROUTES=("${UTILITY_ROUTES[@]}" "\$default")

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📋 Routes to KEEP (utility routes):"
for route in "${UTILITY_ROUTES[@]}"; do
    echo "   ✅ $route"
done
echo "   ✅ \$default (if exists)"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Extract route IDs and keys from JSON
ROUTES_TO_DELETE=()
ROUTES_TO_KEEP=()

# Parse routes from JSON
echo "$ROUTES_JSON" | grep -o '"RouteId":"[^"]*"' | sed 's/"RouteId":"\([^"]*\)"/\1/' | while read -r ROUTE_ID; do
    if [ -n "$ROUTE_ID" ]; then
        ROUTE_KEY=$(aws apigatewayv2 get-route --api-id "$API_ID" --route-id "$ROUTE_ID" --region "$REGION" --query 'RouteKey' --output text 2>/dev/null)
        
        if [ -n "$ROUTE_KEY" ]; then
            # Check if this is a utility route or $default
            IS_UTILITY=false
            for keep_route in "${KEEP_ROUTES[@]}"; do
                if [ "$ROUTE_KEY" == "$keep_route" ]; then
                    IS_UTILITY=true
                    break
                fi
            done
            
            if [ "$IS_UTILITY" = false ]; then
                ROUTES_TO_DELETE+=("$ROUTE_ID|$ROUTE_KEY")
            else
                ROUTES_TO_KEEP+=("$ROUTE_ID|$ROUTE_KEY")
            fi
        fi
    fi
done

# Use a different approach - get routes and process them
TEMP_FILE=$(mktemp)
aws apigatewayv2 get-routes --api-id "$API_ID" --region "$REGION" --query 'Items[*].[RouteId,RouteKey]' --output text > "$TEMP_FILE" 2>/dev/null

DELETED_COUNT=0
KEPT_COUNT=0

echo "📋 Processing routes..."
echo ""

while IFS=$'\t' read -r ROUTE_ID ROUTE_KEY; do
    if [ -z "$ROUTE_ID" ] || [ "$ROUTE_ID" == "None" ]; then
        continue
    fi
    
    # Check if this is a utility route or $default
    IS_UTILITY=false
    for keep_route in "${KEEP_ROUTES[@]}"; do
        if [ "$ROUTE_KEY" == "$keep_route" ]; then
            IS_UTILITY=true
            break
        fi
    done
    
    if [ "$IS_UTILITY" = true ]; then
        echo "   ✅ KEEP: $ROUTE_KEY"
        KEPT_COUNT=$((KEPT_COUNT + 1))
    else
        echo "   🗑️  DELETE: $ROUTE_KEY"
        if aws apigatewayv2 delete-route --api-id "$API_ID" --route-id "$ROUTE_ID" --region "$REGION" >/dev/null 2>&1; then
            DELETED_COUNT=$((DELETED_COUNT + 1))
        else
            echo "      ❌ Failed to delete"
        fi
    fi
done < "$TEMP_FILE"

rm -f "$TEMP_FILE"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Cleanup Complete!"
echo ""
echo "📊 Summary:"
echo "   Kept: $KEPT_COUNT route(s)"
echo "   Deleted: $DELETED_COUNT route(s)"
echo ""
echo "✅ Only utility routes remain in API Gateway"
echo ""

