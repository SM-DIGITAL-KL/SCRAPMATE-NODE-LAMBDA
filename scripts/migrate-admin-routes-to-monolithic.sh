#!/bin/bash

# Migrate Admin Panel Routes from Web Microservice to Monolithic Lambda
# This script:
# 1. Deletes admin panel routes from API Gateway (pointing to web microservice)
# 2. Creates new admin panel routes pointing to monolithic Lambda
# Usage: ./scripts/migrate-admin-routes-to-monolithic.sh [api-name] [stage] [region]

API_NAME=${1:-scrapmate-api-dev}
STAGE=${2:-dev}
REGION=${3:-ap-south-1}
MONOLITHIC_FUNCTION="scrapmate-node-api-${STAGE}"

echo "🔄 Migrating Admin Panel Routes to Monolithic Lambda"
echo "   API: $API_NAME"
echo "   Function: $MONOLITHIC_FUNCTION"
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

# Get monolithic Lambda integration
FUNCTION_ARN=$(aws lambda get-function --function-name "$MONOLITHIC_FUNCTION" --region "$REGION" --query 'Configuration.FunctionArn' --output text 2>/dev/null)
INTEGRATION_URI="arn:aws:apigateway:${REGION}:lambda:path/2015-03-31/functions/${FUNCTION_ARN}/invocations"
MONOLITHIC_INTEGRATION=$(aws apigatewayv2 get-integrations \
    --api-id "$API_ID" \
    --region "$REGION" \
    --query "Items[?IntegrationUri=='$INTEGRATION_URI'].IntegrationId" \
    --output text 2>/dev/null | awk '{print $1}')

if [ -z "$MONOLITHIC_INTEGRATION" ] || [ "$MONOLITHIC_INTEGRATION" == "None" ]; then
    echo "❌ Monolithic Lambda integration not found."
    echo "   Please run: ./scripts/setup-monolithic-integration.sh $API_NAME $STAGE $REGION"
    exit 1
fi

# Get web microservice integration
WEB_INTEGRATION=$(aws apigatewayv2 get-integrations \
    --api-id "$API_ID" \
    --region "$REGION" \
    --query "Items[?contains(IntegrationUri, 'scrapmate-ms-dev-web')].IntegrationId" \
    --output text 2>/dev/null | awk '{print $1}')

echo "✅ API Gateway: $API_ID"
echo "✅ Monolithic Integration: $MONOLITHIC_INTEGRATION"
echo "✅ Web Microservice Integration: $WEB_INTEGRATION"
echo ""

# Define admin panel routes to migrate
declare -a ADMIN_ROUTES=(
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
)

DELETED_COUNT=0
CREATED_COUNT=0
FAILED_COUNT=0

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📋 Migrating Admin Panel Routes"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

for ROUTE_KEY in "${ADMIN_ROUTES[@]}"; do
    # Check if route exists and points to web microservice
    ROUTE_ID=$(aws apigatewayv2 get-routes \
        --api-id "$API_ID" \
        --region "$REGION" \
        --query "Items[?RouteKey=='$ROUTE_KEY'].RouteId" \
        --output text 2>/dev/null | awk '{print $1}')
    
    if [ -n "$ROUTE_ID" ] && [ "$ROUTE_ID" != "None" ]; then
        # Check current target
        CURRENT_TARGET=$(aws apigatewayv2 get-route \
            --api-id "$API_ID" \
            --route-id "$ROUTE_ID" \
            --region "$REGION" \
            --query 'Target' \
            --output text 2>/dev/null)
        
        # If it points to web microservice, update to point to monolithic (avoid route limit)
        if [[ "$CURRENT_TARGET" == *"$WEB_INTEGRATION"* ]]; then
            # Update route to point to monolithic (don't delete/create to avoid hitting route limit)
            if aws apigatewayv2 update-route \
                --api-id "$API_ID" \
                --route-id "$ROUTE_ID" \
                --target "integrations/$MONOLITHIC_INTEGRATION" \
                --region "$REGION" >/dev/null 2>&1; then
                echo "🔄 Updated: $ROUTE_KEY (web microservice → monolithic)"
                CREATED_COUNT=$((CREATED_COUNT + 1))
            else
                echo "❌ Failed to update: $ROUTE_KEY"
                FAILED_COUNT=$((FAILED_COUNT + 1))
            fi
        elif [[ "$CURRENT_TARGET" == *"$MONOLITHIC_INTEGRATION"* ]]; then
            echo "⏭️  Skipped: $ROUTE_KEY (already points to monolithic)"
        else
            # Update to point to monolithic
            if aws apigatewayv2 update-route \
                --api-id "$API_ID" \
                --route-id "$ROUTE_ID" \
                --target "integrations/$MONOLITHIC_INTEGRATION" \
                --region "$REGION" >/dev/null 2>&1; then
                echo "🔄 Updated: $ROUTE_KEY (now points to monolithic)"
                CREATED_COUNT=$((CREATED_COUNT + 1))
            else
                echo "❌ Failed to update: $ROUTE_KEY"
                FAILED_COUNT=$((FAILED_COUNT + 1))
            fi
        fi
    else
        # Route doesn't exist, create it pointing to monolithic
        if aws apigatewayv2 create-route \
            --api-id "$API_ID" \
            --route-key "$ROUTE_KEY" \
            --target "integrations/$MONOLITHIC_INTEGRATION" \
            --region "$REGION" >/dev/null 2>&1; then
            echo "✅ Created: $ROUTE_KEY (pointing to monolithic)"
            CREATED_COUNT=$((CREATED_COUNT + 1))
        else
            echo "❌ Failed to create: $ROUTE_KEY"
            FAILED_COUNT=$((FAILED_COUNT + 1))
        fi
    fi
done

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Migration Complete!"
echo ""
echo "📊 Summary:"
echo "   🗑️  Deleted from web microservice: $DELETED_COUNT"
echo "   ✅ Created/Updated for monolithic: $CREATED_COUNT"
echo "   ❌ Failed: $FAILED_COUNT"
echo ""

