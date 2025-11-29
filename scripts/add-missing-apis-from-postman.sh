#!/bin/bash

# Add Missing APIs from Postman Collection to API Gateway
# Usage: ./scripts/add-missing-apis-from-postman.sh [api-name] [stage] [region]
# Example: ./scripts/add-missing-apis-from-postman.sh scrapmate-api-dev dev ap-south-1

API_NAME=${1:-scrapmate-api-dev}
STAGE=${2:-dev}
REGION=${3:-ap-south-1}

echo "🚀 Adding Missing APIs from Postman Collection"
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

# Get integration IDs for each service
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

echo "   AUTH: $AUTH_INTEGRATION"
echo "   SHOP: $SHOP_INTEGRATION"
echo "   PRODUCT: $PRODUCT_INTEGRATION"
echo "   ORDER: $ORDER_INTEGRATION"
echo "   DELIVERY: $DELIVERY_INTEGRATION"
echo "   USER: $USER_INTEGRATION"
echo "   NOTIFICATION: $NOTIFICATION_INTEGRATION"
echo "   UTILITY: $UTILITY_INTEGRATION"
echo "   WEB: $WEB_INTEGRATION"
echo ""

echo "✅ API Gateway found: $API_ID"
echo ""

# Use Python to process Postman collection and add routes
python3 << PYTHON_SCRIPT
import json
import subprocess
import sys
import re
import os

API_ID = os.environ.get('API_ID', '')
REGION = os.environ.get('REGION', 'ap-south-1')
AUTH_INTEGRATION = os.environ.get('AUTH_INTEGRATION', '')
SHOP_INTEGRATION = os.environ.get('SHOP_INTEGRATION', '')
PRODUCT_INTEGRATION = os.environ.get('PRODUCT_INTEGRATION', '')
ORDER_INTEGRATION = os.environ.get('ORDER_INTEGRATION', '')
DELIVERY_INTEGRATION = os.environ.get('DELIVERY_INTEGRATION', '')
USER_INTEGRATION = os.environ.get('USER_INTEGRATION', '')
NOTIFICATION_INTEGRATION = os.environ.get('NOTIFICATION_INTEGRATION', '')
UTILITY_INTEGRATION = os.environ.get('UTILITY_INTEGRATION', '')
WEB_INTEGRATION = os.environ.get('WEB_INTEGRATION', '')

def normalize_path(path):
    """Normalize path for API Gateway (convert :param to {param})"""
    return re.sub(r':(\w+)', r'{\1}', path)

def determine_service(path, method):
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

# Read Postman collection
with open('ScrapMate API Collection.postman_collection.json', 'r') as f:
    data = json.load(f)

def extract_apis(item, apis=[]):
    if 'item' in item:
        for subitem in item['item']:
            extract_apis(subitem, apis)
    else:
        name = item.get('name', '')
        method = item.get('request', {}).get('method', 'GET')
        url = item.get('request', {}).get('url', {})
        
        if isinstance(url, str):
            path = url.replace('{{base_url}}', '').strip()
        elif 'raw' in url:
            path = url['raw'].replace('{{base_url}}', '').strip()
        elif 'path' in url and url['path']:
            path = '/' + '/'.join([p for p in url['path'] if p])
        else:
            return
        
        # Remove query params
        if '?' in path:
            path = path.split('?')[0]
        
        if path:
            apis.append({
                'name': name,
                'method': method,
                'path': path
            })
    return apis

apis = []
for item in data.get('item', []):
    extract_apis(item, apis)

# Get unique APIs
unique_apis = {}
for api in apis:
    key = f"{api['method']} {api['path']}"
    if key not in unique_apis:
        unique_apis[key] = api

# Get existing routes
result = subprocess.run(
    ['aws', 'apigatewayv2', 'get-routes', '--api-id', API_ID, '--region', REGION, '--query', 'Items[*].RouteKey', '--output', 'text'],
    capture_output=True,
    text=True
)
existing_routes = set(result.stdout.strip().split()) if result.stdout.strip() else set()

# Process each API
added_count = 0
skipped_count = 0
failed_count = 0

for api in unique_apis.values():
    method = api['method']
    path = api['path']
    normalized_path = normalize_path(path)
    route_key = f"{method} {normalized_path}"
    
    # Determine service
    service, integration_id = determine_service(path, method)
    
    if not integration_id or integration_id == 'None':
        print(f"⚠️  No integration for: {route_key} (service: {service})")
        failed_count += 1
        continue
    
    # Check if route already exists
    if route_key in existing_routes:
        # Check if it points to the correct integration
        result = subprocess.run(
            ['aws', 'apigatewayv2', 'get-routes', '--api-id', API_ID, '--region', REGION, '--query', f"Items[?RouteKey=='{route_key}'].Target", '--output', 'text'],
            capture_output=True,
            text=True
        )
        current_target = result.stdout.strip()
        
        expected_target = f'integrations/{integration_id}'
        if current_target == expected_target:
            skipped_count += 1
            continue
        else:
            # Update route to point to correct service
            route_id_result = subprocess.run(
                ['aws', 'apigatewayv2', 'get-routes', '--api-id', API_ID, '--region', REGION, '--query', f"Items[?RouteKey=='{route_key}'].RouteId", '--output', 'text'],
                capture_output=True,
                text=True
            )
            route_id = route_id_result.stdout.strip().split()[0] if route_id_result.stdout.strip() else None
            
            if route_id:
                try:
                    result = subprocess.run(
                        ['aws', 'apigatewayv2', 'update-route',
                         '--api-id', API_ID,
                         '--route-id', route_id,
                         '--target', expected_target,
                         '--region', REGION],
                        capture_output=True,
                        text=True,
                        timeout=10
                    )
                    if result.returncode == 0:
                        print(f"🔄 Updated: {route_key} -> {service} (was: {current_target})")
                        added_count += 1
                    else:
                        print(f"⚠️  Could not update: {route_key} - {result.stderr}")
                        skipped_count += 1
                except Exception as e:
                    print(f"⚠️  Error updating {route_key}: {e}")
                    skipped_count += 1
            else:
                skipped_count += 1
    else:
        # Create new route
        try:
            result = subprocess.run(
                ['aws', 'apigatewayv2', 'create-route',
                 '--api-id', API_ID,
                 '--route-key', route_key,
                 '--target', f'integrations/{integration_id}',
                 '--region', REGION],
                capture_output=True,
                text=True,
                timeout=10
            )
            
            if result.returncode == 0:
                print(f"✅ Added: {route_key} -> {service}")
                added_count += 1
            else:
                if 'ConflictException' in result.stderr:
                    skipped_count += 1
                else:
                    print(f"❌ Failed: {route_key} - {result.stderr}")
                    failed_count += 1
        except Exception as e:
            print(f"❌ Error adding {route_key}: {e}")
            failed_count += 1

print("")
print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
print("📊 Summary:")
print(f"   ✅ Added: {added_count}")
print(f"   ⏭️  Skipped (already exists): {skipped_count}")
print(f"   ❌ Failed: {failed_count}")
print(f"   Total processed: {len(unique_apis)}")
print("")

PYTHON_SCRIPT

echo "✅ Complete!"

