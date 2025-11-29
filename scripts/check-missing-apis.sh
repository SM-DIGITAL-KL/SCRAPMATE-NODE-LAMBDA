#!/bin/bash

# Check Missing APIs from Postman Collection
# Usage: ./scripts/check-missing-apis.sh [api-name] [region]
# Example: ./scripts/check-missing-apis.sh scrapmate-api-dev ap-south-1

API_NAME=${1:-scrapmate-api-dev}
REGION=${2:-ap-south-1}
POSTMAN_FILE="ScrapMate API Collection.postman_collection.json"

echo "🔍 Checking Missing APIs from Postman Collection"
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

echo "✅ API Gateway found: $API_ID"
echo ""

# Extract endpoints from Postman collection
echo "📋 Extracting endpoints from Postman collection..."
POSTMAN_ENDPOINTS=$(python3 << 'PYTHON_SCRIPT'
import json
import sys

try:
    with open('ScrapMate API Collection.postman_collection.json', 'r') as f:
        data = json.load(f)
    
    endpoints = []
    
    def extract_endpoints(items, folder_name=""):
        for item in items:
            if 'item' in item:
                # It's a folder
                extract_endpoints(item['item'], item.get('name', ''))
            elif 'request' in item:
                # It's an endpoint
                request = item['request']
                method = request.get('method', 'GET')
                url = request.get('url', {})
                
                # Get path
                if isinstance(url.get('path'), list):
                    path = '/'.join(url['path'])
                elif isinstance(url.get('path'), str):
                    path = url['path']
                else:
                    path = ''
                
                # Replace :param with {param} for API Gateway format
                import re
                path = re.sub(r':(\w+)', r'{\1}', path)
                
                # Remove {{base_url}} prefix if present
                path = path.replace('{{base_url}}', '').replace('//', '/')
                
                # Ensure it starts with /
                if path and not path.startswith('/'):
                    path = '/' + path
                
                # Skip empty paths
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

if [ $? -ne 0 ]; then
    echo "❌ Failed to extract endpoints from Postman collection"
    exit 1
fi

TOTAL_POSTMAN=$(echo "$POSTMAN_ENDPOINTS" | wc -l | tr -d ' ')
echo "   Found $TOTAL_POSTMAN endpoints in Postman collection"
echo ""

# Get all existing routes from API Gateway
echo "📋 Checking existing routes in API Gateway..."
EXISTING_ROUTES=$(aws apigatewayv2 get-routes \
    --api-id "$API_ID" \
    --region "$REGION" \
    --query 'Items[*].RouteKey' \
    --output text 2>/dev/null)

MISSING_COUNT=0
FOUND_COUNT=0
MISSING_ROUTES=()

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 Missing APIs Report"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

while IFS= read -r POSTMAN_ROUTE; do
    if [ -z "$POSTMAN_ROUTE" ]; then
        continue
    fi
    
    # Check if route exists
    if echo "$EXISTING_ROUTES" | grep -q "^${POSTMAN_ROUTE}$"; then
        echo "✅ $POSTMAN_ROUTE"
        FOUND_COUNT=$((FOUND_COUNT + 1))
    else
        echo "❌ $POSTMAN_ROUTE -> MISSING"
        MISSING_ROUTES+=("$POSTMAN_ROUTE")
        MISSING_COUNT=$((MISSING_COUNT + 1))
    fi
done <<< "$POSTMAN_ENDPOINTS"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 Summary:"
echo "   Total in Postman: $TOTAL_POSTMAN"
echo "   ✅ Found in API Gateway: $FOUND_COUNT"
echo "   ❌ Missing: $MISSING_COUNT"
echo ""

if [ $MISSING_COUNT -gt 0 ]; then
    echo "📝 Missing Routes:"
    for route in "${MISSING_ROUTES[@]}"; do
        echo "   - $route"
    done
    echo ""
    echo "💡 To add missing routes, run:"
    echo "   ./scripts/add-missing-routes.sh scrapmate-api-dev dev ap-south-1"
fi

echo ""
