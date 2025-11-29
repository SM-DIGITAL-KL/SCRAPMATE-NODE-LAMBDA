#!/bin/bash

# Verify all Flutter app routes are present in microservices
# Usage: ./scripts/verify-flutter-routes.sh

echo "🔍 Verifying Flutter App Routes in Microservices"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Define routes as array of "route|method|service"
FLUTTER_ROUTES=(
    # Common URLs
    "thirdPartyCredentials|GET|utility"
    "get_table_condition|POST|utility"
    "login_app|POST|auth"
    "users_register|POST|auth"
    "delv_boy_add|POST|delivery"
    "userProEdit|POST|user"
    "profile_update|POST|user"
    "PermanentDelete|POST|utility"
    "failedJobs|POST|utility"
    
    # Vendor URLs
    "shop_image_list|GET|shop"
    "shop_image_upload|POST|shop"
    "shop_image_delete|DELETE|shop"
    "delivery_boy_list|GET|delivery"
    "users_profile_view|GET|user"
    "shop_cat_edit|POST|product"
    "shop_cat_list|GET|shop"
    "all_pro_category|GET|product"
    "shop_cat_delete|DELETE|product"
    "shop_cat_create|POST|product"
    "keyword_search/item_keywords|GET|utility"
    "shop_item_create|POST|product"
    "shop_item_edit|POST|product"
    "shop_item_delete|DELETE|product"
    "shop_item_list|GET|shop"
    "shop_dash_counts|GET|shop"
    "get_user_by_id|GET|utility"
    "shops_list_for_sale|POST|shop"
    "savecallLog|POST|utility"
    
    # FCM URL
    "fcm_token_store|POST|user"
    
    # Customer URLs
    "category_img_list|GET|product"
    "cust_order_placeing|POST|order"
    "cust_ads_type_edit|POST|user"
    "items_list_for_sale|POST|product"
    "cust_dash_counts|GET|user"
    "user_profile_pic_edit|POST|user"
    "customer_pending_orders|GET|order"
    "custOrderRating|POST|order"
    "shop_ads_type_edit|POST|shop"
    "versionCheck|GET|utility"
    "savecallLogCust|POST|utility"
)

MISSING_COUNT=0
FOUND_COUNT=0

echo "📋 Checking routes..."
echo ""

for route_entry in "${FLUTTER_ROUTES[@]}"; do
    IFS='|' read -r route method service <<< "$route_entry"
    
    # Check in service routes file
    SERVICE_FILE="services/${service}/routes.js"
    
    if [ -f "$SERVICE_FILE" ]; then
        # Check if route exists (handle path parameters and slashes)
        ROUTE_PATTERN=$(echo "$route" | sed 's|/|\\/|g' | sed 's|\.|\\\.|g')
        if grep -q "$ROUTE_PATTERN" "$SERVICE_FILE" 2>/dev/null; then
            echo "   ✅ $method /api/$route → $service service"
            FOUND_COUNT=$((FOUND_COUNT + 1))
        else
            echo "   ❌ $method /api/$route → MISSING in $service service"
            MISSING_COUNT=$((MISSING_COUNT + 1))
        fi
    else
        echo "   ⚠️  $method /api/$route → Service file not found: $SERVICE_FILE"
        MISSING_COUNT=$((MISSING_COUNT + 1))
    fi
done

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 Summary:"
echo "   ✅ Found: $FOUND_COUNT"
echo "   ❌ Missing: $MISSING_COUNT"
echo ""

if [ $MISSING_COUNT -eq 0 ]; then
    echo "✅ All Flutter app routes are present in microservices!"
    exit 0
else
    echo "⚠️  Some routes are missing. Please add them to the appropriate service."
    exit 1
fi
