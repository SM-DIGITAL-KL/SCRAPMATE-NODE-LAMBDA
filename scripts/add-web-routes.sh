#!/bin/bash

# Add Web Service Routes to API Gateway
# Usage: ./scripts/add-web-routes.sh [api-name] [stage] [region]
# Example: ./scripts/add-web-routes.sh scrapmate-api-dev dev ap-south-1

API_NAME=${1:-scrapmate-api-dev}
STAGE=${2:-dev}
REGION=${3:-ap-south-1}
SERVICE_NAME="web"
FUNCTION_PREFIX="scrapmate-ms-${STAGE}"
FUNCTION_NAME="${FUNCTION_PREFIX}-${SERVICE_NAME}"

echo "🚀 Adding Web Service Routes to API Gateway"
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
    echo "❌ API Gateway '$API_NAME' not found."
    exit 1
fi
echo "✅ Found API Gateway: $API_ID"

# Get Lambda function ARN
FUNCTION_ARN=$(aws lambda get-function --function-name "$FUNCTION_NAME" --region "$REGION" --query 'Configuration.FunctionArn' --output text 2>/dev/null)
if [ -z "$FUNCTION_ARN" ] || [ "$FUNCTION_ARN" == "None" ]; then
    echo "❌ Lambda function '$FUNCTION_NAME' not found."
    exit 1
fi
echo "✅ Found Lambda function: $FUNCTION_ARN"

# Create/Get integration
INTEGRATION_URI="arn:aws:apigateway:${REGION}:lambda:path/2015-03-31/functions/${FUNCTION_ARN}/invocations"
INTEGRATION_ID=$(aws apigatewayv2 get-integrations \
    --api-id "$API_ID" \
    --region "$REGION" \
    --query "Items[?IntegrationUri=='$INTEGRATION_URI'].IntegrationId" \
    --output text 2>/dev/null)

if [ -z "$INTEGRATION_ID" ] || [ "$INTEGRATION_ID" == "None" ]; then
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
    
    if [ -z "$INTEGRATION_ID" ] || [ "$INTEGRATION_ID" == "None" ]; then
        echo "❌ Failed to create integration."
        exit 1
    fi
    echo "✅ Integration created: $INTEGRATION_ID"

    # Grant API Gateway permission to invoke Lambda
    ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
    SOURCE_ARN="arn:aws:execute-api:${REGION}:${ACCOUNT_ID}:${API_ID}/*/*"
    aws lambda add-permission \
        --function-name "$FUNCTION_NAME" \
        --statement-id "api-gateway-invoke-${SERVICE_NAME}-$(date +%s)" \
        --action lambda:InvokeFunction \
        --principal apigateway.amazonaws.com \
        --source-arn "$SOURCE_ARN" \
        --region "$REGION" >/dev/null 2>&1 && echo "✅ Permission granted" || echo "⚠️  Permission may already exist"
else
    echo "✅ Integration exists: $INTEGRATION_ID"
fi

echo ""
echo "📋 Creating web service routes..."

# Define web routes (from services/web/routes.js)
# Using array format for proper variable handling
WEB_ROUTES=(
    # Login routes (no auth)
    "GET /"
    "GET /login"
    "GET /logout"
    "ANY /dologin"
    "GET /api/"
    "GET /api/login"
    "GET /api/logout"
    "ANY /api/dologin"
    # Admin routes
    "GET /admin/dashboard"
    "GET /api/admin/dashboard"
    "GET /users"
    "GET /api/users"
    "GET /admin/users"
    "GET /api/admin/users"
    "GET /admin/users/{id}"
    "GET /api/admin/users/{id}"
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
    # SubSchool routes
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

SUCCESS=0
FAILED=0
SKIPPED=0

# Get all existing routes for faster lookup
echo "📋 Checking existing routes..."
EXISTING_ROUTES=$(aws apigatewayv2 get-routes \
    --api-id "$API_ID" \
    --region "$REGION" \
    --query 'Items[*].RouteKey' \
    --output text 2>/dev/null)

echo "   Found $(echo "$EXISTING_ROUTES" | wc -w | tr -d ' ') existing routes"
echo ""

for ROUTE_KEY in "${WEB_ROUTES[@]}"; do
    # Check if route already exists
    if echo "$EXISTING_ROUTES" | grep -q "^${ROUTE_KEY}$" || echo "$EXISTING_ROUTES" | grep -q " ${ROUTE_KEY}$" || echo "$EXISTING_ROUTES" | grep -q "^${ROUTE_KEY} "; then
        # Route already exists, skip it
        SKIPPED=$((SKIPPED + 1))
        continue
    fi
    
    # Route doesn't exist, create it
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
done

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Complete!"
echo ""
echo "📊 Summary:"
echo "   ✅ Created: $SUCCESS"
echo "   ⏭️  Skipped (already exist): $SKIPPED"
echo "   ❌ Failed: $FAILED"
echo ""
API_ENDPOINT=$(aws apigatewayv2 get-api --api-id "$API_ID" --region "$REGION" --query ApiEndpoint --output text)
echo "🧪 Test Endpoints:"
echo "   curl ${API_ENDPOINT}/login"
echo "   curl ${API_ENDPOINT}/api/login"
echo "   curl ${API_ENDPOINT}/admin/dashboard"
echo ""

