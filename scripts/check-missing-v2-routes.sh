#!/bin/bash

# Check for Missing V2 Routes in API Gateway
# Usage: ./scripts/check-missing-v2-routes.sh [api-name] [region]
# Example: ./scripts/check-missing-v2-routes.sh scrapmate-api-dev ap-south-1

API_NAME=${1:-scrapmate-api-dev}
REGION=${2:-ap-south-1}

echo "🔍 Checking for Missing V2 Routes in API Gateway"
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

# Get all routes from API Gateway
echo "📋 Fetching routes from API Gateway..."
API_GATEWAY_ROUTES=$(aws apigatewayv2 get-routes \
    --api-id "$API_ID" \
    --region "$REGION" \
    --query 'Items[*].RouteKey' \
    --output text 2>/dev/null)

# Define expected V2 routes by parsing serverless-microservices.yml
echo "📋 Parsing serverless-microservices.yml for V2 routes..."

if [ ! -f "serverless-microservices.yml" ]; then
    echo "❌ serverless-microservices.yml not found in current directory."
    exit 1
fi

# Extract V2 routes using grep and awk
# Looks for patterns like:
#   path: /api/v2/...
#   method: ...
# And combines them into "METHOD /api/v2/..."
EXPECTED_V2_ROUTES=()

# We use a temporary file to store the raw extracted lines to handle the multi-line grep output
grep -A 1 "path: /api/v2/" serverless-microservices.yml > .temp_routes.txt

while read -r line; do
    if [[ $line == *"path: /api/v2/"* ]]; then
        current_path=$(echo "$line" | awk '{print $2}')
    elif [[ $line == *"method:"* ]] && [ -n "$current_path" ]; then
        current_method=$(echo "$line" | awk '{print $2}')
        if [ "$current_method" == "ANY" ]; then
             # If ANY, we might want to list specific methods or just keep ANY. 
             # For now, let's keep ANY as it matches what might be in API Gateway if configured that way,
             # but usually specific routes have specific methods.
             # However, the previous hardcoded list had specific methods.
             # If the yaml has ANY, we'll use ANY.
             :
        fi
        
        # Construct route string: "METHOD PATH"
        route_string="${current_method} ${current_path}"
        EXPECTED_V2_ROUTES+=("$route_string")
        
        # Reset for next pair
        current_path=""
        current_method=""
    fi
done < .temp_routes.txt

rm .temp_routes.txt

if [ ${#EXPECTED_V2_ROUTES[@]} -eq 0 ]; then
    echo "⚠️  No V2 routes found in serverless-microservices.yml"
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 V2 Routes Analysis"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "   Expected V2 Routes: ${#EXPECTED_V2_ROUTES[@]}"
echo ""

# Convert API Gateway routes to array
IFS=$'\n' read -rd '' -a GATEWAY_ROUTES_ARRAY <<<"$API_GATEWAY_ROUTES"

# Find missing routes
MISSING_ROUTES=()
FOUND_ROUTES=()

# Convert API Gateway routes to a single string for easier searching
GATEWAY_ROUTES_STRING=$(echo "$API_GATEWAY_ROUTES" | tr '\t' '\n' | tr '[:upper:]' '[:lower:]')

for route in "${EXPECTED_V2_ROUTES[@]}"; do
    # Normalize route for comparison
    # Extract method and path
    method=$(echo "$route" | awk '{print $1}')
    path=$(echo "$route" | awk '{print $2}')
    
    # Normalize path (lowercase, handle {userId} variations)
    normalized_path=$(echo "$path" | tr '[:upper:]' '[:lower:]' | sed 's/{userid}/{userId}/g')
    route_key="${method} ${normalized_path}"
    route_key_lower=$(echo "$route_key" | tr '[:upper:]' '[:lower:]')
    
    # Check if route exists in API Gateway (case-insensitive)
    if echo "$GATEWAY_ROUTES_STRING" | grep -qi "^${route_key_lower}$"; then
        FOUND_ROUTES+=("$route")
    else
        # Also check with different case variations
        found=false
        for gateway_route in "${GATEWAY_ROUTES_ARRAY[@]}"; do
            gateway_lower=$(echo "$gateway_route" | tr '[:upper:]' '[:lower:]')
            # Compare method and path separately
            gateway_method=$(echo "$gateway_lower" | awk '{print $1}')
            gateway_path=$(echo "$gateway_lower" | awk '{print $2}')
            
            if [ "$method" = "$gateway_method" ] && [ "$normalized_path" = "$gateway_path" ]; then
                found=true
                break
            fi
        done
        
        if [ "$found" = false ]; then
            MISSING_ROUTES+=("$route")
        else
            FOUND_ROUTES+=("$route")
        fi
    fi
done

# Display results
echo "✅ Found Routes (${#FOUND_ROUTES[@]}):"
if [ ${#FOUND_ROUTES[@]} -eq 0 ]; then
    echo "   None"
else
    for route in "${FOUND_ROUTES[@]}"; do
        echo "   ✓ $route"
    done
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "❌ Missing Routes (${#MISSING_ROUTES[@]}):"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ ${#MISSING_ROUTES[@]} -eq 0 ]; then
    echo ""
    echo "   ✅ All V2 routes are present in API Gateway!"
    echo ""
else
    echo ""
    for i in "${!MISSING_ROUTES[@]}"; do
        echo "   $((i+1)). ${MISSING_ROUTES[$i]}"
    done
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "💡 To add missing routes, you can:"
    echo "   1. Use serverless deploy: npx serverless deploy --config serverless-microservices.yml"
    echo "   2. Or use the add-missing-v2-route.sh script for individual routes"
    echo ""
fi

# Also show all V2 routes in API Gateway for reference
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📋 All V2 Routes Currently in API Gateway:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
V2_IN_GATEWAY=$(echo "$API_GATEWAY_ROUTES" | grep -i "/api/v2/" || echo "")
if [ -z "$V2_IN_GATEWAY" ]; then
    echo "   No V2 routes found in API Gateway"
else
    echo "$V2_IN_GATEWAY" | while read -r route; do
        echo "   • $route"
    done
fi
echo ""

