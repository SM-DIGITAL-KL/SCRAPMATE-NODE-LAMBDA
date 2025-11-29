#!/bin/bash

# Add All Web Routes to API Gateway
# Usage: ./scripts/add-all-web-routes.sh [api-name] [stage] [region]
# Example: ./scripts/add-all-web-routes.sh scrapmate-api-dev dev ap-south-1

API_NAME=${1:-scrapmate-api-dev}
STAGE=${2:-dev}
REGION=${3:-ap-south-1}
INTEGRATION_ID="3cchzqa"  # Web service integration ID

echo "🚀 Adding All Web Routes to API Gateway"
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

# Get integration ID if not provided
if [ -z "$INTEGRATION_ID" ] || [ "$INTEGRATION_ID" == "None" ]; then
    INTEGRATION_ID=$(aws apigatewayv2 get-integrations \
        --api-id "$API_ID" \
        --region "$REGION" \
        --query "Items[?contains(IntegrationUri, 'scrapmate-ms-dev-web')].IntegrationId" \
        --output text 2>/dev/null | head -1)
fi

if [ -z "$INTEGRATION_ID" ] || [ "$INTEGRATION_ID" == "None" ]; then
    echo "❌ Web service integration not found."
    exit 1
fi

echo "✅ API Gateway found: $API_ID"
echo "✅ Integration ID: $INTEGRATION_ID"
echo ""

# Define all routes from webRoutes.js
declare -a ALL_ROUTES=(
    # Login routes
    "GET /"
    "GET /api/"
    "GET /login"
    "GET /api/login"
    "GET /logout"
    "GET /api/logout"
    "ANY /dologin"
    "ANY /api/dologin"
    # Admin routes
    "GET /admin/dashboard"
    "GET /api/admin/dashboard"
    "GET /users"
    "GET /api/users"
    "GET /admin/users"
    "GET /api/admin/users"
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
    "GET /admin/set_permission"
    "GET /api/admin/set_permission"
    "GET /admin/set_permission/{id}"
    "GET /api/admin/set_permission/{id}"
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
    # Vendor routes
    "GET /vendors"
    "GET /api/vendors"
    "ANY /manage_vendors"
    "ANY /api/manage_vendors"
    # Agent routes
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
    # Student routes
    "GET /student"
    "GET /api/student"
    "ANY /student_payment"
    "ANY /api/student_payment"
    "ANY /manage_student"
    "ANY /api/manage_student"
    "GET /student_activation"
    "GET /api/student_activation"
    # Subschool routes
    "GET /subschool"
    "GET /api/subschool"
    "ANY /manage_schools"
    "ANY /api/manage_schools"
    # Course routes
    "GET /courses_category"
    "GET /api/courses_category"
    "GET /courses"
    "GET /api/courses"
    "ANY /manage_category"
    "ANY /api/manage_category"
    "ANY /manage_courses"
    "ANY /api/manage_courses"
    "GET /course_report"
    "GET /api/course_report"
    "GET /sub_topic_list"
    "GET /api/sub_topic_list"
    "ANY /manage_subjects"
    "ANY /api/manage_subjects"
    "ANY /manage_topics"
    "ANY /api/manage_topics"
    "GET /videos"
    "GET /api/videos"
    "ANY /manage_videos"
    "ANY /api/manage_videos"
    "GET /notes"
    "GET /api/notes"
    "ANY /manage_notes"
    "ANY /api/manage_notes"
    "GET /audios"
    "GET /api/audios"
    "ANY /manage_audios"
    "ANY /api/manage_audios"
    "GET /assignment"
    "GET /api/assignment"
    "ANY /manage_assignment"
    "ANY /api/manage_assignment"
    # Store routes
    "GET /store_category"
    "GET /api/store_category"
    "ANY /manage_store_cat"
    "ANY /api/manage_store_cat"
    "ANY /manage_store_cat/{id}"
    "ANY /api/manage_store_cat/{id}"
    "GET /view_store_category"
    "GET /api/view_store_category"
    "GET /del_storecategory/{id}"
    "GET /api/del_storecategory/{id}"
    "ANY /store_report"
    "ANY /api/store_report"
    "ANY /manage_store"
    "ANY /api/manage_store"
    "ANY /manage_producs"
    "ANY /api/manage_producs"
    # Exam routes
    "GET /exams"
    "GET /api/exams"
    "ANY /manage_exams"
    "ANY /api/manage_exams"
    "GET /questions"
    "GET /api/questions"
    "ANY /manage_questions"
    "ANY /api/manage_questions"
    "ANY /import_questions"
    "ANY /api/import_questions"
    "GET /assesment"
    "GET /api/assesment"
    # Report routes
    "GET /report"
    "GET /api/report"
    # Site routes
    "GET /site"
    "GET /api/site"
    "PUT /site"
    "PUT /api/site"
    "ANY /manage_site"
    "ANY /api/manage_site"
    "ANY /updateAppVersion"
    "ANY /api/updateAppVersion"
    # Customer routes
    "GET /customers"
    "GET /api/customers"
    "GET /orders"
    "GET /api/orders"
    "GET /view_customers"
    "GET /api/view_customers"
    "GET /view_order_details/{id}"
    "GET /api/view_order_details/{id}"
    "GET /view_orders"
    "GET /api/view_orders"
    "GET /del_customer/{id}"
    "GET /api/del_customer/{id}"
    "ANY /show_recent_orders"
    "ANY /api/show_recent_orders"
    "ANY /show_recent_orders/{id}"
    "ANY /api/show_recent_orders/{id}"
    # Accounts routes
    "GET /subPackages"
    "GET /api/subPackages"
    "ANY /createSubPackage"
    "ANY /api/createSubPackage"
    "ANY /editSubPackage/{id}"
    "ANY /api/editSubPackage/{id}"
    "GET /delSubPackage/{id}"
    "GET /api/delSubPackage/{id}"
    "ANY /updateSubPackageStatus"
    "ANY /api/updateSubPackageStatus"
    "GET /subcribersList"
    "GET /api/subcribersList"
    "GET /view_subcribersList"
    "GET /api/view_subcribersList"
)

TOTAL_ROUTES=${#ALL_ROUTES[@]}
SUCCESS_COUNT=0
FAILED_COUNT=0
SKIPPED_COUNT=0

echo "📋 Processing $TOTAL_ROUTES routes..."
echo ""

for ROUTE_KEY in "${ALL_ROUTES[@]}"; do
    # Check if route already exists
    EXISTING_ROUTE_ID=$(aws apigatewayv2 get-routes \
        --api-id "$API_ID" \
        --region "$REGION" \
        --query "Items[?RouteKey=='$ROUTE_KEY'].RouteId" \
        --output text 2>/dev/null | head -1)
    
    if [ -n "$EXISTING_ROUTE_ID" ] && [ "$EXISTING_ROUTE_ID" != "None" ]; then
        # Check if it points to the correct integration
        EXISTING_TARGET=$(aws apigatewayv2 get-route \
            --api-id "$API_ID" \
            --route-id "$EXISTING_ROUTE_ID" \
            --region "$REGION" \
            --query 'Target' \
            --output text 2>/dev/null)
        
        if [[ "$EXISTING_TARGET" == *"$INTEGRATION_ID"* ]]; then
            echo "   ⏭️  Skipped (exists): $ROUTE_KEY"
            SKIPPED_COUNT=$((SKIPPED_COUNT + 1))
            continue
        else
            # Update to point to web service
            if aws apigatewayv2 update-route \
                --api-id "$API_ID" \
                --route-id "$EXISTING_ROUTE_ID" \
                --target "integrations/$INTEGRATION_ID" \
                --region "$REGION" >/dev/null 2>&1; then
                echo "   ✅ Updated: $ROUTE_KEY"
                SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
            else
                echo "   ❌ Failed to update: $ROUTE_KEY"
                FAILED_COUNT=$((FAILED_COUNT + 1))
            fi
        fi
    else
        # Create new route
        if aws apigatewayv2 create-route \
            --api-id "$API_ID" \
            --route-key "$ROUTE_KEY" \
            --target "integrations/$INTEGRATION_ID" \
            --region "$REGION" >/dev/null 2>&1; then
            echo "   ✅ Created: $ROUTE_KEY"
            SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
        else
            echo "   ❌ Failed: $ROUTE_KEY"
            FAILED_COUNT=$((FAILED_COUNT + 1))
        fi
    fi
done

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Complete!"
echo ""
echo "📊 Summary:"
echo "   Total routes: $TOTAL_ROUTES"
echo "   ✅ Created/Updated: $SUCCESS_COUNT"
echo "   ⏭️  Skipped (already exists): $SKIPPED_COUNT"
echo "   ❌ Failed: $FAILED_COUNT"
echo ""

API_ENDPOINT=$(aws apigatewayv2 get-api --api-id "$API_ID" --region "$REGION" --query ApiEndpoint --output text)
echo "🧪 Test Endpoints:"
echo "   curl ${API_ENDPOINT}/api/admin/dashboard -H 'api-key: zyubkfzeumeoviaqzcsrvfwdzbiwnlnn'"
echo "   curl ${API_ENDPOINT}/api/vendors -H 'api-key: zyubkfzeumeoviaqzcsrvfwdzbiwnlnn'"
echo "   curl ${API_ENDPOINT}/api/agents -H 'api-key: zyubkfzeumeoviaqzcsrvfwdzbiwnlnn'"
echo ""

