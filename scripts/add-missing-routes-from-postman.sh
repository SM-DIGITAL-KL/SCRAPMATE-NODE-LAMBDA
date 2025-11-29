#!/bin/bash

# Add Missing Routes from Postman Collection to API Gateway
# This script extracts routes from Postman collection and adds missing ones
# Usage: ./scripts/add-missing-routes-from-postman.sh [api-name] [stage] [region]
# Example: ./scripts/add-missing-routes-from-postman.sh scrapmate-api-dev dev ap-south-1

API_NAME=${1:-scrapmate-api-dev}
STAGE=${2:-dev}
REGION=${3:-ap-south-1}
POSTMAN_FILE="ScrapMate API Collection.postman_collection.json"

echo "🚀 Adding Missing Routes from Postman Collection"
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
    exit 1
fi

# Get integration IDs for different services (take first one if multiple)
WEB_INTEGRATION=$(aws apigatewayv2 get-integrations --api-id "$API_ID" --region "$REGION" --query "Items[?contains(IntegrationUri, 'scrapmate-ms-dev-web')].IntegrationId" --output text 2>/dev/null | awk '{print $1}')
AUTH_INTEGRATION=$(aws apigatewayv2 get-integrations --api-id "$API_ID" --region "$REGION" --query "Items[?contains(IntegrationUri, 'scrapmate-ms-dev-auth')].IntegrationId" --output text 2>/dev/null | awk '{print $1}')
SHOP_INTEGRATION=$(aws apigatewayv2 get-integrations --api-id "$API_ID" --region "$REGION" --query "Items[?contains(IntegrationUri, 'scrapmate-ms-dev-shop')].IntegrationId" --output text 2>/dev/null | awk '{print $1}')
PRODUCT_INTEGRATION=$(aws apigatewayv2 get-integrations --api-id "$API_ID" --region "$REGION" --query "Items[?contains(IntegrationUri, 'scrapmate-ms-dev-product')].IntegrationId" --output text 2>/dev/null | awk '{print $1}')
ORDER_INTEGRATION=$(aws apigatewayv2 get-integrations --api-id "$API_ID" --region "$REGION" --query "Items[?contains(IntegrationUri, 'scrapmate-ms-dev-order')].IntegrationId" --output text 2>/dev/null | awk '{print $1}')
UTILITY_INTEGRATION=$(aws apigatewayv2 get-integrations --api-id "$API_ID" --region "$REGION" --query "Items[?contains(IntegrationUri, 'scrapmate-ms-dev-utility')].IntegrationId" --output text 2>/dev/null | awk '{print $1}')
USER_INTEGRATION=$(aws apigatewayv2 get-integrations --api-id "$API_ID" --region "$REGION" --query "Items[?contains(IntegrationUri, 'scrapmate-ms-dev-user')].IntegrationId" --output text 2>/dev/null | awk '{print $1}')
DELIVERY_INTEGRATION=$(aws apigatewayv2 get-integrations --api-id "$API_ID" --region "$REGION" --query "Items[?contains(IntegrationUri, 'scrapmate-ms-dev-delivery')].IntegrationId" --output text 2>/dev/null | awk '{print $1}')

echo "✅ API Gateway found: $API_ID"
echo "✅ Integrations:"
echo "   Web: ${WEB_INTEGRATION:-NOT FOUND}"
echo "   Auth: ${AUTH_INTEGRATION:-NOT FOUND}"
echo "   Shop: ${SHOP_INTEGRATION:-NOT FOUND}"
echo "   Product: ${PRODUCT_INTEGRATION:-NOT FOUND}"
echo "   Order: ${ORDER_INTEGRATION:-NOT FOUND}"
echo "   Utility: ${UTILITY_INTEGRATION:-NOT FOUND}"
echo "   User: ${USER_INTEGRATION:-NOT FOUND}"
echo "   Delivery: ${DELIVERY_INTEGRATION:-NOT FOUND}"
echo ""

# Extract endpoints from Postman collection and determine which service they belong to
echo "📋 Extracting and mapping endpoints..."
MISSING_ROUTES=$(python3 << 'PYTHON_SCRIPT'
import json
import sys
import re

try:
    with open('ScrapMate API Collection.postman_collection.json', 'r') as f:
        data = json.load(f)
    
    endpoints = []
    
    def extract_endpoints(items, folder_name=""):
        for item in items:
            if 'item' in item:
                extract_endpoints(item['item'], item.get('name', ''))
            elif 'request' in item:
                request = item['request']
                method = request.get('method', 'GET')
                url = request.get('url', {})
                
                if isinstance(url.get('path'), list):
                    path = '/'.join(url['path'])
                elif isinstance(url.get('path'), str):
                    path = url['path']
                else:
                    path = ''
                
                # Replace :param with {param} for API Gateway format
                path = re.sub(r':(\w+)', r'{\1}', path)
                path = path.replace('{{base_url}}', '').replace('//', '/')
                
                if path and not path.startswith('/'):
                    path = '/' + path
                
                if path and path != '/':
                    route_key = f"{method} {path}"
                    endpoints.append(route_key)
    
    extract_endpoints(data.get('item', []))
    
    # Print unique endpoints
    for endpoint in sorted(set(endpoints)):
        print(endpoint)
        
except Exception as e:
    print(f"Error: {e}", file=sys.stderr)
    sys.exit(1)
PYTHON_SCRIPT
)

# Get existing routes
EXISTING_ROUTES=$(aws apigatewayv2 get-routes \
    --api-id "$API_ID" \
    --region "$REGION" \
    --query 'Items[*].RouteKey' \
    --output text 2>/dev/null)

# Function to determine which service a route belongs to
get_service_for_route() {
    local route="$1"
    
    # Web service routes (admin panel, web UI)
    if [[ "$route" == *"/admin/"* ]] || \
       [[ "$route" == *"/agent/"* ]] || \
       [[ "$route" == *"/customer/"* ]] || \
       [[ "$route" == *"/course/"* ]] || \
       [[ "$route" == *"/exam/"* ]] || \
       [[ "$route" == *"/store/"* ]] || \
       [[ "$route" == *"/student/"* ]] || \
       [[ "$route" == *"/subschool/"* ]] || \
       [[ "$route" == *"/accounts/"* ]] || \
       [[ "$route" == *"/site"* ]] || \
       [[ "$route" == *"/report"* ]] || \
       [[ "$route" == *"/vendors"* ]] || \
       [[ "$route" == *"/agents"* ]] || \
       [[ "$route" == *"/customers"* ]] || \
       [[ "$route" == *"/orders"* ]] || \
       [[ "$route" == *"/users"* ]] || \
       [[ "$route" == *"/subPackages"* ]] || \
       [[ "$route" == *"/subcribersList"* ]]; then
        echo "$WEB_INTEGRATION"
    # Utility service routes
    elif [[ "$route" == *"/get_table"* ]] || \
         [[ "$route" == *"/get_table_condition"* ]] || \
         [[ "$route" == *"/count_row"* ]] || \
         [[ "$route" == *"/keyword_search"* ]] || \
         [[ "$route" == *"/get_user_by_id"* ]] || \
         [[ "$route" == *"/get_all_tables"* ]] || \
         [[ "$route" == *"/savecallLog"* ]] || \
         [[ "$route" == *"/stateAllow"* ]] || \
         [[ "$route" == *"/packagesSub"* ]] || \
         [[ "$route" == *"/thirdPartyCredentials"* ]] || \
         [[ "$route" == *"/versionCheck"* ]] || \
         [[ "$route" == *"/smstesting"* ]] || \
         [[ "$route" == *"/PermanentDelete"* ]] || \
         [[ "$route" == *"/failedJobs"* ]] || \
         [[ "$route" == *"/clear_redis_cache"* ]] || \
         [[ "$route" == *"/metrics"* ]]; then
        echo "$UTILITY_INTEGRATION"
    # Auth service routes
    elif [[ "$route" == *"/login"* ]] || \
         [[ "$route" == *"/register"* ]] || \
         [[ "$route" == *"/login_app"* ]] || \
         [[ "$route" == *"/users_register"* ]] || \
         [[ "$route" == *"/user_mob_verification"* ]]; then
        echo "$AUTH_INTEGRATION"
    # Shop service routes
    elif [[ "$route" == *"/shop"* ]] || \
         [[ "$route" == *"/shops"* ]] || \
         [[ "$route" == *"/shop_image"* ]] || \
         [[ "$route" == *"/shop_cat"* ]] || \
         [[ "$route" == *"/shop_item"* ]] || \
         [[ "$route" == *"/shop_dash"* ]] || \
         [[ "$route" == *"/shopReviews"* ]] || \
         [[ "$route" == *"/shop_ads"* ]] || \
         [[ "$route" == *"/shop_orders"* ]]; then
        echo "$SHOP_INTEGRATION"
    # Product service routes
    elif [[ "$route" == *"/all_pro_category"* ]] || \
         [[ "$route" == *"/category_img"* ]] || \
         [[ "$route" == *"/items_list"* ]]; then
        echo "$PRODUCT_INTEGRATION"
    # Order service routes
    elif [[ "$route" == *"/order_details"* ]] || \
         [[ "$route" == *"/customer_orders"* ]] || \
         [[ "$route" == *"/customer_pending_orders"* ]] || \
         [[ "$route" == *"/cust_order_placeing"* ]] || \
         [[ "$route" == *"/order_status_change"* ]] || \
         [[ "$route" == *"/custOrderRating"* ]]; then
        echo "$ORDER_INTEGRATION"
    # Delivery service routes
    elif [[ "$route" == *"/delv_boy"* ]] || \
         [[ "$route" == *"/delivery_boy"* ]] || \
         [[ "$route" == *"/delv_orders"* ]] || \
         [[ "$route" == *"/delv_completed"* ]]; then
        echo "$DELIVERY_INTEGRATION"
    # User service routes
    elif [[ "$route" == *"/users_profile_view"* ]] || \
         [[ "$route" == *"/user_profile_pic"* ]] || \
         [[ "$route" == *"/userProEdit"* ]] || \
         [[ "$route" == *"/cust_dash_counts"* ]] || \
         [[ "$route" == *"/fcm_token"* ]] || \
         [[ "$route" == *"/fcmTokenClear"* ]] || \
         [[ "$route" == *"/noti_by_id"* ]] || \
         [[ "$route" == *"/notif_read"* ]]; then
        echo "$USER_INTEGRATION"
    else
        # Default to web service for unknown routes
        echo "$WEB_INTEGRATION"
    fi
}

TOTAL_MISSING=0
ADDED_COUNT=0
FAILED_COUNT=0

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📋 Processing Missing Routes"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

while IFS= read -r ROUTE_KEY; do
    if [ -z "$ROUTE_KEY" ]; then
        continue
    fi
    
    # Check if route already exists
    if echo "$EXISTING_ROUTES" | grep -q "^${ROUTE_KEY}$"; then
        continue
    fi
    
    TOTAL_MISSING=$((TOTAL_MISSING + 1))
    
    # Determine which service this route belongs to
    INTEGRATION_ID=$(get_service_for_route "$ROUTE_KEY")
    
    if [ -z "$INTEGRATION_ID" ] || [ "$INTEGRATION_ID" == "None" ]; then
        echo "⚠️  $ROUTE_KEY -> No integration found, skipping"
        FAILED_COUNT=$((FAILED_COUNT + 1))
        continue
    fi
    
    # Create route
    CREATE_OUTPUT=$(aws apigatewayv2 create-route \
        --api-id "$API_ID" \
        --route-key "$ROUTE_KEY" \
        --target "integrations/$INTEGRATION_ID" \
        --region "$REGION" 2>&1)
    
    if [ $? -eq 0 ]; then
        echo "✅ $ROUTE_KEY -> $INTEGRATION_ID"
        ADDED_COUNT=$((ADDED_COUNT + 1))
    else
        # Check if route already exists (that's okay)
        if echo "$CREATE_OUTPUT" | grep -q "already exists\|ConflictException"; then
            echo "⏭️  $ROUTE_KEY -> Already exists"
        else
            echo "❌ $ROUTE_KEY -> Failed: $(echo "$CREATE_OUTPUT" | head -1)"
            FAILED_COUNT=$((FAILED_COUNT + 1))
        fi
    fi
done <<< "$MISSING_ROUTES"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Complete!"
echo ""
echo "📊 Summary:"
echo "   Total missing routes processed: $TOTAL_MISSING"
echo "   ✅ Added: $ADDED_COUNT"
echo "   ❌ Failed: $FAILED_COUNT"
echo ""

