#!/bin/bash

# Fix Routes Pointing to Wrong Services
# Usage: ./scripts/fix-wrong-service-routes.sh [api-name] [region]
# Example: ./scripts/fix-wrong-service-routes.sh scrapmate-api-dev ap-south-1

API_NAME=${1:-scrapmate-api-dev}
REGION=${2:-ap-south-1}

echo "🔍 Checking Routes Pointing to Wrong Services"
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

# Get all integrations
echo "🔍 Finding service integrations..."
AUTH_INTEGRATION=$(aws apigatewayv2 get-integrations --api-id "$API_ID" --region "$REGION" --query "Items[?contains(IntegrationUri, 'scrapmate-ms-dev-auth')].IntegrationId" --output text 2>/dev/null | awk '{print $1}')
SHOP_INTEGRATION=$(aws apigatewayv2 get-integrations --api-id "$API_ID" --region "$REGION" --query "Items[?contains(IntegrationUri, 'scrapmate-ms-dev-shop')].IntegrationId" --output text 2>/dev/null | awk '{print $1}')
PRODUCT_INTEGRATION=$(aws apigatewayv2 get-integrations --api-id "$API_ID" --region "$REGION" --query "Items[?contains(IntegrationUri, 'scrapmate-ms-dev-product')].IntegrationId" --output text 2>/dev/null | awk '{print $1}')
ORDER_INTEGRATION=$(aws apigatewayv2 get-integrations --api-id "$API_ID" --region "$REGION" --query "Items[?contains(IntegrationUri, 'scrapmate-ms-dev-order')].IntegrationId" --output text 2>/dev/null | awk '{print $1}')
DELIVERY_INTEGRATION=$(aws apigatewayv2 get-integrations --api-id "$API_ID" --region "$REGION" --query "Items[?contains(IntegrationUri, 'scrapmate-ms-dev-delivery')].IntegrationId" --output text 2>/dev/null | awk '{print $1}')
USER_INTEGRATION=$(aws apigatewayv2 get-integrations --api-id "$API_ID" --region "$REGION" --query "Items[?contains(IntegrationUri, 'scrapmate-ms-dev-user')].IntegrationId" --output text 2>/dev/null | awk '{print $1}')
NOTIFICATION_INTEGRATION=$(aws apigatewayv2 get-integrations --api-id "$API_ID" --region "$REGION" --query "Items[?contains(IntegrationUri, 'scrapmate-ms-dev-notification')].IntegrationId" --output text 2>/dev/null | awk '{print $1}')
UTILITY_INTEGRATION=$(aws apigatewayv2 get-integrations --api-id "$API_ID" --region "$REGION" --query "Items[?contains(IntegrationUri, 'scrapmate-ms-dev-utility')].IntegrationId" --output text 2>/dev/null | awk '{print $1}')
WEB_INTEGRATION=$(aws apigatewayv2 get-integrations --api-id "$API_ID" --region "$REGION" --query "Items[?contains(IntegrationUri, 'scrapmate-ms-dev-web')].IntegrationId" --output text 2>/dev/null | awk '{print $1}')

echo "✅ API Gateway found: $API_ID"
echo ""

# Get all routes
ALL_ROUTES=$(aws apigatewayv2 get-routes --api-id "$API_ID" --region "$REGION" --query 'Items[*].{RouteKey:RouteKey,Target:Target,RouteId:RouteId}' --output json 2>/dev/null)

python3 << PYTHON_SCRIPT
import json
import sys
import subprocess
import re

API_ID = "${API_ID}"
REGION = "${REGION}"
AUTH_INTEGRATION = "${AUTH_INTEGRATION}"
SHOP_INTEGRATION = "${SHOP_INTEGRATION}"
PRODUCT_INTEGRATION = "${PRODUCT_INTEGRATION}"
ORDER_INTEGRATION = "${ORDER_INTEGRATION}"
DELIVERY_INTEGRATION = "${DELIVERY_INTEGRATION}"
USER_INTEGRATION = "${USER_INTEGRATION}"
NOTIFICATION_INTEGRATION = "${NOTIFICATION_INTEGRATION}"
UTILITY_INTEGRATION = "${UTILITY_INTEGRATION}"
WEB_INTEGRATION = "${WEB_INTEGRATION}"

def determine_correct_service(path, method):
    """Determine which service should handle this route"""
    path_lower = path.lower()
    
    # Admin/Web panel routes
    if any(x in path_lower for x in ['admin', 'vendor', 'agent', 'customer', 'student', 'subschool', 'course', 'store', 'exam', 'report', 'site', 'accounts']):
        return 'web', WEB_INTEGRATION
    
    # Auth routes
    if any(x in path_lower for x in ['login', 'register', 'user_mob', 'dologin']):
        return 'auth', AUTH_INTEGRATION
    
    # Shop routes
    if 'shop' in path_lower:
        return 'shop', SHOP_INTEGRATION
    
    # Product/Category routes
    if any(x in path_lower for x in ['category', 'product', 'item', 'all_pro']):
        return 'product', PRODUCT_INTEGRATION
    
    # Order routes
    if 'order' in path_lower:
        return 'order', ORDER_INTEGRATION
    
    # Delivery routes
    if any(x in path_lower for x in ['delv', 'delivery']):
        return 'delivery', DELIVERY_INTEGRATION
    
    # Notification routes
    if any(x in path_lower for x in ['noti', 'notification']):
        return 'notification', NOTIFICATION_INTEGRATION
    
    # Utility routes
    if any(x in path_lower for x in ['get_table', 'count_row', 'keyword_search', 'get_user_by_id', 'get_all_tables', 'savecall', 'stateallow', 'packages', 'paymenthistory', 'thirdparty', 'versioncheck', 'smstesting', 'permanentdelete', 'failedjobs', 'clear_redis', 'metrics']):
        return 'utility', UTILITY_INTEGRATION
    
    # User routes (default)
    return 'user', USER_INTEGRATION

# Parse routes from bash variable
routes_json = '''${ALL_ROUTES}'''
routes = json.loads(routes_json)

wrong_routes = []
fixed_count = 0

for route in routes:
    route_key = route['RouteKey']
    current_target = route['Target']
    route_id = route['RouteId']
    
    # Extract method and path
    parts = route_key.split(' ', 1)
    if len(parts) != 2:
        continue
    
    method = parts[0]
    path = parts[1]
    
    # Determine correct service
    correct_service, correct_integration = determine_correct_service(path, method)
    
    if not correct_integration or correct_integration == '':
        continue
    
    expected_target = f'integrations/{correct_integration}'
    
    # Check if pointing to wrong service
    if current_target != expected_target:
        # Check if current target is utility (common mistake)
        if 'utility' in current_target.lower() or current_target.endswith(UTILITY_INTEGRATION):
            if correct_service != 'utility':
                wrong_routes.append({
                    'route_key': route_key,
                    'route_id': route_id,
                    'current_target': current_target,
                    'correct_service': correct_service,
                    'correct_target': expected_target
                })

print(f"🔍 Found {len(wrong_routes)} routes pointing to wrong service")
print("")

if wrong_routes:
    print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    print("🔧 Fixing routes...")
    print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    print("")
    
    for route_info in wrong_routes[:20]:  # Fix first 20
        route_key = route_info['route_key']
        route_id = route_info['route_id']
        correct_target = route_info['correct_target']
        correct_service = route_info['correct_service']
        
        try:
            result = subprocess.run(
                ['aws', 'apigatewayv2', 'update-route',
                 '--api-id', API_ID,
                 '--route-id', route_id,
                 '--target', correct_target,
                 '--region', REGION],
                capture_output=True,
                text=True,
                timeout=10
            )
            
            if result.returncode == 0:
                print(f"✅ Fixed: {route_key} -> {correct_service}")
                fixed_count += 1
            else:
                print(f"❌ Failed: {route_key} - {result.stderr.strip()}")
        except Exception as e:
            print(f"❌ Error: {route_key} - {e}")
    
    if len(wrong_routes) > 20:
        print(f"\n⚠️  ... and {len(wrong_routes) - 20} more routes need fixing")
        print("   Run the script again to fix remaining routes")
else:
    print("✅ All routes are pointing to correct services!")

print("")
print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
print(f"📊 Fixed: {fixed_count} routes")
print("")

PYTHON_SCRIPT

echo "✅ Complete!"

