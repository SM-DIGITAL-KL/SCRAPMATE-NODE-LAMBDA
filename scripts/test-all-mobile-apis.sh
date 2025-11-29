#!/bin/bash

# Test ALL mobile APIs with both monolithic and microservice URLs
# Compare responses and fix differences
# Usage: ./scripts/test-all-mobile-apis.sh [api-key] [stage] [region]

API_KEY=${1:-'zyubkfzeumeoviaqzcsrvfwdzbiwnlnn'}
STAGE=${2:-dev}
REGION=${3:-ap-south-1}

echo "🧪 Testing ALL Mobile APIs - Monolithic vs Microservices"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
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

# Get URLs
MONOLITHIC_URL=$(aws lambda get-function-url-config --function-name scrapmate-node-api-${STAGE} --region "$REGION" --query 'FunctionUrl' --output text 2>/dev/null | sed 's|/$||')
API_ID=$(aws apigatewayv2 get-apis --region "$REGION" --query "Items[?Name=='scrapmate-api-${STAGE}'].ApiId" --output text 2>/dev/null)
MICROSERVICE_URL=$(aws apigatewayv2 get-api --api-id "$API_ID" --region "$REGION" --query 'ApiEndpoint' --output text 2>/dev/null | sed 's|/$||')

if [ -z "$MONOLITHIC_URL" ] || [ -z "$MICROSERVICE_URL" ]; then
    echo "❌ Failed to get URLs"
    exit 1
fi

echo "📋 URLs:"
echo "   Monolithic: $MONOLITHIC_URL"
echo "   Microservice: $MICROSERVICE_URL"
echo ""

# Define all Flutter routes with test data
# Format: METHOD|PATH|BODY (body is optional)
TEST_ROUTES=(
    # Common URLs - GET
    "GET|/api/thirdPartyCredentials"
    "GET|/api/get_all_tables"
    "GET|/api/stateAllow"
    "GET|/api/packagesSub"
    "GET|/api/count_row/users"
    "GET|/api/versionCheck/1.0.0"
    
    # Common URLs - POST
    "POST|/api/get_table_condition|{\"table\":\"users\"}"
    "POST|/api/login_app|{\"mob\":\"9605056015\"}"
    "POST|/api/users_register|{\"name\":\"Test\",\"email\":\"test@test.com\",\"mob_number\":\"9999999999\",\"usertype\":\"C\",\"address\":\"Test\",\"language\":\"en\"}"
    "POST|/api/PermanentDelete|{\"table\":\"test\",\"id\":\"1\"}"
    "POST|/api/failedJobs|{\"job_id\":\"1\"}"
    
    # Vendor URLs - GET
    "GET|/api/shop_image_list/1"
    "GET|/api/delivery_boy_list/1"
    "GET|/api/users_profile_view/1"
    "GET|/api/shop_cat_list/1"
    "GET|/api/all_pro_category"
    "GET|/api/shop_item_list/1/1"
    "GET|/api/shop_dash_counts/1"
    "GET|/api/get_user_by_id/1/users"
    "GET|/api/keyword_search/item_keywords/test"
    
    # Vendor URLs - POST
    "POST|/api/shop_image_upload|{\"shop_id\":\"1\"}"
    "POST|/api/shop_cat_create|{\"shop_id\":\"1\",\"cat_name\":\"Test\"}"
    "POST|/api/shop_cat_edit|{\"id\":\"1\",\"cat_name\":\"Test\"}"
    "POST|/api/shop_item_create|{\"shop_id\":\"1\",\"item_name\":\"Test\"}"
    "POST|/api/shop_item_edit/1|{\"item_name\":\"Test\"}"
    "POST|/api/shops_list_for_sale|{\"lat\":\"0\",\"lng\":\"0\"}"
    "POST|/api/savecallLog|{\"user_id\":\"1\"}"
    "POST|/api/shop_ads_type_edit|{\"shop_id\":\"1\"}"
    
    # Vendor URLs - DELETE
    "GET|/api/shop_image_delete/1"
    "GET|/api/shop_cat_delete/1"
    "GET|/api/shop_item_delete/1"
    
    # Delivery URLs
    "POST|/api/delv_boy_add|{\"name\":\"Test\",\"mob\":\"9999999999\"}"
    
    # FCM URL
    "POST|/api/fcm_token_store|{\"user_id\":\"1\",\"fcm_token\":\"test\"}"
    
    # Customer URLs - GET
    "GET|/api/category_img_list"
    "GET|/api/cust_dash_counts/1"
    "GET|/api/customer_pending_orders/1"
    
    # Customer URLs - POST
    "POST|/api/cust_order_placeing|{\"customer_id\":\"1\",\"shop_id\":\"1\"}"
    "POST|/api/cust_ads_type_edit|{\"customer_id\":\"1\"}"
    "POST|/api/items_list_for_sale|{\"shop_id\":\"1\"}"
    "POST|/api/user_profile_pic_edit|{\"user_id\":\"1\"}"
    "POST|/api/custOrderRating|{\"order_id\":\"1\",\"rating\":\"5\"}"
    "POST|/api/savecallLogCust|{\"user_id\":\"1\"}"
    "POST|/api/userProEdit|{\"user_id\":\"1\",\"name\":\"Test\"}"
    "POST|/api/profile_update|{\"user_id\":\"1\",\"name\":\"Test\"}"
)

TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0
FAILED_ROUTES=()

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🧪 Running Tests..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Clear previous diff file
> /tmp/api-diffs.txt

for route_entry in "${TEST_ROUTES[@]}"; do
    IFS='|' read -r method path body <<< "$route_entry"
    
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    
    printf "Test %2d: %-4s %-50s " "$TOTAL_TESTS" "$method" "$path"
    
    # Prepare curl command
    if [ "$method" = "GET" ]; then
        MONO_CMD="curl -s -w '\n%{http_code}' -X GET \"${MONOLITHIC_URL}${path}\" -H \"api-key: ${API_KEY}\" 2>&1"
        MICRO_CMD="curl -s -w '\n%{http_code}' -X GET \"${MICROSERVICE_URL}${path}\" -H \"api-key: ${API_KEY}\" 2>&1"
    else
        if [ -n "$body" ]; then
            MONO_CMD="curl -s -w '\n%{http_code}' -X POST \"${MONOLITHIC_URL}${path}\" -H \"api-key: ${API_KEY}\" -H \"Content-Type: application/json\" -d '${body}' 2>&1"
            MICRO_CMD="curl -s -w '\n%{http_code}' -X POST \"${MICROSERVICE_URL}${path}\" -H \"api-key: ${API_KEY}\" -H \"Content-Type: application/json\" -d '${body}' 2>&1"
        else
            MONO_CMD="curl -s -w '\n%{http_code}' -X POST \"${MONOLITHIC_URL}${path}\" -H \"api-key: ${API_KEY}\" -H \"Content-Type: application/json\" 2>&1"
            MICRO_CMD="curl -s -w '\n%{http_code}' -X POST \"${MICROSERVICE_URL}${path}\" -H \"api-key: ${API_KEY}\" -H \"Content-Type: application/json\" 2>&1"
        fi
    fi
    
    # Get responses (separate body and status code)
    MONO_FULL=$(eval "$MONO_CMD")
    MICRO_FULL=$(eval "$MICRO_CMD")
    
    MONO_HTTP_CODE=$(echo "$MONO_FULL" | tail -1)
    MICRO_HTTP_CODE=$(echo "$MICRO_FULL" | tail -1)
    
    MONO_RESPONSE=$(echo "$MONO_FULL" | sed '$d')
    MICRO_RESPONSE=$(echo "$MICRO_FULL" | sed '$d')
    
    # Check HTTP status codes first
    if [ "$MONO_HTTP_CODE" != "$MICRO_HTTP_CODE" ]; then
        echo "❌ HTTP CODE MISMATCH (Monolithic: $MONO_HTTP_CODE, Microservice: $MICRO_HTTP_CODE)"
        FAILED_TESTS=$((FAILED_TESTS + 1))
        FAILED_ROUTES+=("$method $path")
        continue
    fi
    
    # Normalize responses (remove whitespace, sort keys if JSON)
    MONO_NORM=$(echo "$MONO_RESPONSE" | jq -S . 2>/dev/null || echo "$MONO_RESPONSE" | tr -d '[:space:]')
    MICRO_NORM=$(echo "$MICRO_RESPONSE" | jq -S . 2>/dev/null || echo "$MICRO_RESPONSE" | tr -d '[:space:]')
    
    # Compare
    if [ "$MONO_NORM" = "$MICRO_NORM" ]; then
        echo "✅ PASS"
        PASSED_TESTS=$((PASSED_TESTS + 1))
    else
        echo "❌ FAIL"
        FAILED_TESTS=$((FAILED_TESTS + 1))
        FAILED_ROUTES+=("$method $path")
        
        # Save diff to file
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" >> /tmp/api-diffs.txt
        echo "$method $path" >> /tmp/api-diffs.txt
        echo "HTTP Code: Monolithic=$MONO_HTTP_CODE, Microservice=$MICRO_HTTP_CODE" >> /tmp/api-diffs.txt
        echo "" >> /tmp/api-diffs.txt
        echo "Monolithic Response:" >> /tmp/api-diffs.txt
        echo "$MONO_RESPONSE" | jq . 2>/dev/null || echo "$MONO_RESPONSE" >> /tmp/api-diffs.txt
        echo "" >> /tmp/api-diffs.txt
        echo "Microservice Response:" >> /tmp/api-diffs.txt
        echo "$MICRO_RESPONSE" | jq . 2>/dev/null || echo "$MICRO_RESPONSE" >> /tmp/api-diffs.txt
        echo "" >> /tmp/api-diffs.txt
    fi
done

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 Test Summary"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "   Total Tests: $TOTAL_TESTS"
echo "   ✅ Passed: $PASSED_TESTS"
echo "   ❌ Failed: $FAILED_TESTS"
echo ""

if [ $FAILED_TESTS -gt 0 ]; then
    echo "⚠️  Differences found! Check /tmp/api-diffs.txt for details"
    echo ""
    echo "📋 Failed routes:"
    for route in "${FAILED_ROUTES[@]}"; do
        echo "   - $route"
    done
    echo ""
    echo "💡 Next steps:"
    echo "   1. Review /tmp/api-diffs.txt"
    echo "   2. Fix microservice controllers to match monolithic responses"
    echo "   3. Re-run tests: ./scripts/test-all-mobile-apis.sh"
    exit 1
else
    echo "✅ All tests passed! Responses match perfectly."
    exit 0
fi

