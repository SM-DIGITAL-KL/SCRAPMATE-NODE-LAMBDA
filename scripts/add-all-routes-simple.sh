#!/bin/bash

# Add all service routes to API Gateway (simplified version)
# Usage: ./scripts/add-all-routes-simple.sh [api-name] [stage] [region]

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
echo ""

# Services to process (excluding delivery which is already done)
SERVICES=("auth" "shop" "product" "order" "user" "notification" "health")

# Process each service
for SERVICE in "${SERVICES[@]}"; do
    FUNCTION_NAME="${FUNCTION_PREFIX}-${SERVICE}"
    
    if ! aws lambda get-function --function-name "$FUNCTION_NAME" --region "$REGION" >/dev/null 2>&1; then
        echo "⚠️  Skipping $SERVICE - function not found"
        continue
    fi
    
    echo "📦 Processing $SERVICE service..."
    
    # Get function ARN and create integration
    FUNCTION_ARN=$(aws lambda get-function --function-name "$FUNCTION_NAME" --region "$REGION" --query 'Configuration.FunctionArn' --output text 2>/dev/null)
    INTEGRATION_URI="arn:aws:apigateway:${REGION}:lambda:path/2015-03-31/functions/${FUNCTION_ARN}/invocations"
    
    # Check for existing integration
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
        INTEGRATION_ID=$(aws apigatewayv2 create-integration \
            --api-id "$API_ID" \
            --integration-type AWS_PROXY \
            --integration-uri "$INTEGRATION_URI" \
            --integration-method POST \
            --payload-format-version "2.0" \
            --region "$REGION" \
            --query 'IntegrationId' \
            --output text 2>/dev/null)
        echo "   ✅ Integration created: $INTEGRATION_ID"
        
        ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text 2>/dev/null)
        SOURCE_ARN="arn:aws:execute-api:${REGION}:${ACCOUNT_ID}:${API_ID}/*/*"
        aws lambda add-permission \
            --function-name "$FUNCTION_NAME" \
            --statement-id "api-gateway-${SERVICE}-$(date +%s)" \
            --action lambda:InvokeFunction \
            --principal apigateway.amazonaws.com \
            --source-arn "$SOURCE_ARN" \
            --region "$REGION" >/dev/null 2>&1 || true
    else
        echo "   ✅ Integration exists: $INTEGRATION_ID"
    fi
    
    # Call the individual service route script
    case "$SERVICE" in
        auth)
            echo "   📋 Adding auth routes..."
            ROUTES=("POST /api/login" "POST /api/dologin" "GET /api/login_app/{mob}" "POST /api/users_register" "POST /api/user_mob_verification" "GET /api/")
            ;;
        shop)
            echo "   📋 Adding shop routes..."
            ROUTES=("POST /api/shop_image_upload" "GET /api/shop_image_delete/{id}" "GET /api/shop_image_list/{id}" "GET /api/shop_cat_list/{id}" "GET /api/shop_item_list/{shop_id}/{cat_id}" "GET /api/shop_orders/{shop_id}" "GET /api/shop_orders/{shop_id}/{status}" "GET /api/shop_orders/{shop_id}/{status}/{offset}" "GET /api/shop_dash_counts/{id}" "GET /api/shopReviews/{shop_id}" "POST /api/shops_list_for_sale" "POST /api/shop_ads_type_edit")
            ;;
        product)
            echo "   📋 Adding product routes..."
            ROUTES=("POST /api/shop_cat_create" "POST /api/shop_cat_edit" "GET /api/shop_cat_delete/{id}" "GET /api/all_pro_category" "GET /api/category_img_list" "POST /api/shop_item_create" "POST /api/shop_item_edit/{id}" "GET /api/shop_item_delete/{id}" "POST /api/items_list_for_sale")
            ;;
        order)
            echo "   📋 Adding order routes..."
            ROUTES=("GET /api/order_details/{order_no}" "GET /api/customer_orders/{customer_id}" "GET /api/customer_pending_orders/{customer_id}" "POST /api/cust_order_placeing" "POST /api/order_status_change" "POST /api/custOrderRating")
            ;;
        user)
            echo "   📋 Adding user routes..."
            ROUTES=("GET /api/users_profile_view/{id}" "GET /api/get_user_by_name/{name}" "POST /api/user_profile_pic_edit" "POST /api/userProEdit" "GET /api/cust_dash_counts/{id}" "POST /api/cust_ads_type_edit" "POST /api/fcm_token_store" "GET /api/fcmTokenClear/{userid}")
            ;;
        notification)
            echo "   📋 Adding notification routes..."
            ROUTES=("GET /api/noti_by_id/{id}" "GET /api/noti_by_id/{id}/{offset}" "POST /api/notif_read")
            ;;
        health)
            echo "   📋 Adding health routes..."
            ROUTES=("GET /api/health" "GET /health" "GET /api/test" "GET /test")
            ;;
    esac
    
    # Create routes
    for ROUTE_KEY in "${ROUTES[@]}"; do
        EXISTING_ROUTE_ID=$(aws apigatewayv2 get-routes \
            --api-id "$API_ID" \
            --region "$REGION" \
            --query "Items[?RouteKey=='$ROUTE_KEY'].RouteId" \
            --output text 2>/dev/null)
        
        if [ -n "$EXISTING_ROUTE_ID" ] && [ "$EXISTING_ROUTE_ID" != "None" ]; then
            EXISTING_ROUTE_ID="${EXISTING_ROUTE_ID%% *}"
            aws apigatewayv2 update-route \
                --api-id "$API_ID" \
                --route-id "$EXISTING_ROUTE_ID" \
                --target "integrations/$INTEGRATION_ID" \
                --region "$REGION" >/dev/null 2>&1 && echo "   ✅ Updated: $ROUTE_KEY" || echo "   ⚠️  Update failed: $ROUTE_KEY"
        else
            aws apigatewayv2 create-route \
                --api-id "$API_ID" \
                --route-key "$ROUTE_KEY" \
                --target "integrations/$INTEGRATION_ID" \
                --region "$REGION" >/dev/null 2>&1 && echo "   ✅ Created: $ROUTE_KEY" || echo "   ❌ Failed: $ROUTE_KEY"
        fi
    done
    
    echo ""
done

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ All routes added!"
echo ""

