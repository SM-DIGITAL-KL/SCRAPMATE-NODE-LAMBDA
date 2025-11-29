#!/bin/bash

# Add all routes from all services to API Gateway
# Usage: ./scripts/add-all-service-routes.sh [api-name] [stage] [region]

set -e

API_NAME=${1:-scrapmate-api-dev}
STAGE=${2:-dev}
REGION=${3:-ap-south-1}
FUNCTION_PREFIX="scrapmate-ms-${STAGE}"

echo "🚀 Adding All Service Routes to API Gateway"
echo "   API Name: $API_NAME"
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
    echo "❌ API Gateway '$API_NAME' not found"
    exit 1
fi

echo "✅ Found API Gateway: $API_ID"
API_ENDPOINT=$(aws apigatewayv2 get-api --api-id "$API_ID" --region "$REGION" --query 'ApiEndpoint' --output text 2>/dev/null)
echo "   🌐 Endpoint: $API_ENDPOINT"
echo ""

# Get account ID
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text 2>/dev/null)
SOURCE_ARN_PREFIX="arn:aws:execute-api:${REGION}:${ACCOUNT_ID}:${API_ID}"

# Function to get routes for a service
get_service_routes() {
    local service=$1
    case "$service" in
        auth)
            echo "POST /api/login
POST /api/dologin
GET /api/login_app/{mob}
POST /api/users_register
POST /api/user_mob_verification
GET /api/"
            ;;
        shop)
            echo "POST /api/shop_image_upload
GET /api/shop_image_delete/{id}
GET /api/shop_image_list/{id}
GET /api/shop_cat_list/{id}
GET /api/shop_item_list/{shop_id}/{cat_id}
GET /api/shop_orders/{shop_id}
GET /api/shop_orders/{shop_id}/{status}
GET /api/shop_orders/{shop_id}/{status}/{offset}
GET /api/shop_dash_counts/{id}
GET /api/shopReviews/{shop_id}
POST /api/shops_list_for_sale
POST /api/shop_ads_type_edit"
            ;;
        product)
            echo "POST /api/shop_cat_create
POST /api/shop_cat_edit
GET /api/shop_cat_delete/{id}
GET /api/all_pro_category
GET /api/category_img_list
POST /api/shop_item_create
POST /api/shop_item_edit/{id}
GET /api/shop_item_delete/{id}
POST /api/items_list_for_sale"
            ;;
        order)
            echo "GET /api/order_details/{order_no}
GET /api/customer_orders/{customer_id}
GET /api/customer_pending_orders/{customer_id}
POST /api/cust_order_placeing
POST /api/order_status_change
POST /api/custOrderRating"
            ;;
        delivery)
            echo "POST /api/delv_boy_add
GET /api/delivery_boy_list/{id}
POST /api/delivery_boy_edit
GET /api/delv_boy_delete/{deliveryBoyID}/{shop_id}
GET /api/delv_orders/{delv_boy_id}
GET /api/delv_completed_orders/{delv_boy_id}
GET /api/delv_boy_dash_counts/{id}"
            ;;
        user)
            echo "GET /api/users_profile_view/{id}
GET /api/get_user_by_name/{name}
POST /api/user_profile_pic_edit
POST /api/userProEdit
GET /api/cust_dash_counts/{id}
POST /api/cust_ads_type_edit
POST /api/fcm_token_store
GET /api/fcmTokenClear/{userid}"
            ;;
        notification)
            echo "GET /api/noti_by_id/{id}
GET /api/noti_by_id/{id}/{offset}
POST /api/notif_read"
            ;;
        utility)
            echo "POST /api/get_table
POST /api/get_table_condition
GET /api/count_row/{table_name}
GET /api/keyword_search/{table}/{name}
GET /api/get_user_by_id/{user_id}/{table}
GET /api/get_all_tables
POST /api/savecallLog
POST /api/savecallLogCust
POST /api/searchShopCallLogSave
GET /api/stateAllow
GET /api/packagesSub
POST /api/saveUserPackages
POST /api/paymentHistory
GET /api/thirdPartyCredentials
GET /api/versionCheck/{version}
GET /api/smstesting
POST /api/PermanentDelete
POST /api/failedJobs
POST /api/clear_redis_cache
GET /api/metrics"
            ;;
        health)
            echo "GET /api/health
GET /health
GET /api/test
GET /test"
            ;;
    esac
}

SERVICES=("auth" "shop" "product" "order" "delivery" "user" "notification" "utility" "health")

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📋 Creating Routes and Integrations"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

TOTAL_ROUTES=0
SUCCESS_ROUTES=0
FAILED_ROUTES=0

for SERVICE in "${SERVICES[@]}"; do
    FUNCTION_NAME="${FUNCTION_PREFIX}-${SERVICE}"
    
    # Check if function exists
    if ! aws lambda get-function --function-name "$FUNCTION_NAME" --region "$REGION" >/dev/null 2>&1; then
        echo "⚠️  Skipping $SERVICE - function '$FUNCTION_NAME' not found"
        continue
    fi
    
    echo "📦 Processing $SERVICE service..."
    
    # Get Lambda function ARN
    FUNCTION_ARN=$(aws lambda get-function --function-name "$FUNCTION_NAME" --region "$REGION" --query 'Configuration.FunctionArn' --output text 2>/dev/null)
    
    if [ -z "$FUNCTION_ARN" ] || [ "$FUNCTION_ARN" == "None" ]; then
        echo "   ❌ Failed to get function ARN"
        continue
    fi
    
    # Create or get integration
    INTEGRATION_URI="arn:aws:apigateway:${REGION}:lambda:path/2015-03-31/functions/${FUNCTION_ARN}/invocations"
    
    # Check if integration exists
    INTEGRATIONS=$(aws apigatewayv2 get-integrations --api-id "$API_ID" --region "$REGION" 2>/dev/null)
    INTEGRATION_ID=""
    
    # Try to find existing integration
    for integ in $(echo "$INTEGRATIONS" | grep -o '"IntegrationId":"[^"]*"' | sed 's/"IntegrationId":"\([^"]*\)"/\1/'); do
        INTEG_URI=$(aws apigatewayv2 get-integration --api-id "$API_ID" --integration-id "$integ" --region "$REGION" --query 'IntegrationUri' --output text 2>/dev/null)
        if [ "$INTEG_URI" == "$INTEGRATION_URI" ]; then
            INTEGRATION_ID="$integ"
            break
        fi
    done
    
    if [ -z "$INTEGRATION_ID" ]; then
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
        
        echo "   ✅ Integration created: $INTEGRATION_ID"
        
        # Grant Lambda invoke permission
        echo "   🔐 Granting Lambda invoke permission..."
        SOURCE_ARN="${SOURCE_ARN_PREFIX}/*/*"
        STATEMENT_ID="api-gateway-${SERVICE}-$(date +%s)"
        aws lambda add-permission \
            --function-name "$FUNCTION_NAME" \
            --statement-id "$STATEMENT_ID" \
            --action lambda:InvokeFunction \
            --principal apigateway.amazonaws.com \
            --source-arn "$SOURCE_ARN" \
            --region "$REGION" >/dev/null 2>&1 && echo "   ✅ Permission granted" || echo "   ⚠️  Permission may already exist"
    else
        echo "   ✅ Integration exists: $INTEGRATION_ID"
    fi
    
    # Get routes for this service
    ROUTES=$(get_service_routes "$SERVICE" | grep -v '^$')
    SERVICE_ROUTE_COUNT=0
    
    # Process each route
    echo "$ROUTES" | while IFS= read -r ROUTE_LINE; do
        if [ -z "$ROUTE_LINE" ]; then
            continue
        fi
        
        # Parse route: METHOD /path
        METHOD="${ROUTE_LINE%% *}"
        PATH="${ROUTE_LINE#* }"
        
        if [ -z "$METHOD" ] || [ -z "$PATH" ]; then
            continue
        fi
        
        TOTAL_ROUTES=$((TOTAL_ROUTES + 1))
        SERVICE_ROUTE_COUNT=$((SERVICE_ROUTE_COUNT + 1))
        ROUTE_KEY="${METHOD} ${PATH}"
        
        # Check if route exists
        EXISTING_ROUTE_ID=$(aws apigatewayv2 get-routes \
            --api-id "$API_ID" \
            --region "$REGION" \
            --query "Items[?RouteKey=='$ROUTE_KEY'].RouteId" \
            --output text 2>/dev/null)
        
        if [ -n "$EXISTING_ROUTE_ID" ]; then
            EXISTING_ROUTE_ID="${EXISTING_ROUTE_ID%% *}"
        fi
        
        if [ -n "$EXISTING_ROUTE_ID" ] && [ "$EXISTING_ROUTE_ID" != "None" ]; then
            # Update existing route
            if aws apigatewayv2 update-route \
                --api-id "$API_ID" \
                --route-id "$EXISTING_ROUTE_ID" \
                --target "integrations/$INTEGRATION_ID" \
                --region "$REGION" >/dev/null 2>&1; then
                echo "   ✅ Updated: $ROUTE_KEY"
                SUCCESS_ROUTES=$((SUCCESS_ROUTES + 1))
            else
                echo "   ❌ Failed to update: $ROUTE_KEY"
                FAILED_ROUTES=$((FAILED_ROUTES + 1))
            fi
        else
            # Create new route
            if aws apigatewayv2 create-route \
                --api-id "$API_ID" \
                --route-key "$ROUTE_KEY" \
                --target "integrations/$INTEGRATION_ID" \
                --region "$REGION" >/dev/null 2>&1; then
                echo "   ✅ Created: $ROUTE_KEY"
                SUCCESS_ROUTES=$((SUCCESS_ROUTES + 1))
            else
                echo "   ❌ Failed: $ROUTE_KEY"
                FAILED_ROUTES=$((FAILED_ROUTES + 1))
            fi
        fi
    done
    
    # Count routes for this service (need to do it outside the subshell)
    SERVICE_ROUTE_COUNT=$(echo "$ROUTES" | grep -v '^$' | wc -l | tr -d ' ')
    
    echo "   📊 $SERVICE: $SERVICE_ROUTE_COUNT routes processed"
    echo ""
done

FINAL_ENDPOINT="${API_ENDPOINT}"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Complete!"
echo ""
echo "📊 Summary:"
echo "   API ID: $API_ID"
echo "   API Name: $API_NAME"
echo "   Endpoint: $FINAL_ENDPOINT"
echo "   Total Routes: $TOTAL_ROUTES"
echo "   Successful: $SUCCESS_ROUTES"
echo "   Failed: $FAILED_ROUTES"
echo ""
echo "🧪 Test Endpoints:"
echo "   curl $FINAL_ENDPOINT/api/health -H 'api-key: zyubkfzeumeoviaqzcsrvfwdzbiwnlnn'"
echo "   curl $FINAL_ENDPOINT/api/get_all_tables -H 'api-key: zyubkfzeumeoviaqzcsrvfwdzbiwnlnn'"
echo "   curl $FINAL_ENDPOINT/api/login -X POST -H 'api-key: zyubkfzeumeoviaqzcsrvfwdzbiwnlnn' -H 'Content-Type: application/json' -d '{\"email\":\"test@test.com\",\"password\":\"test\"}'"
echo ""

