#!/bin/bash

# Remove Web Microservice and Monolithic Lambda Routes from API Gateway
# These will be accessed via Lambda Function URL directly
# Usage: ./scripts/remove-web-and-monolithic-routes.sh [api-name] [region] [--yes]
# Example: ./scripts/remove-web-and-monolithic-routes.sh scrapmate-api-dev ap-south-1 --yes

API_NAME=${1:-scrapmate-api-dev}
REGION=${2:-ap-south-1}
AUTO_CONFIRM=false

# Check for --yes flag
if [[ "$1" == "--yes" ]] || [[ "$2" == "--yes" ]] || [[ "$3" == "--yes" ]]; then
    AUTO_CONFIRM=true
fi

echo "🗑️  Removing Web Microservice and Monolithic Routes from API Gateway"
echo "   API: $API_NAME"
echo "   Region: $REGION"
echo ""
echo "   Routes will be accessed via Lambda Function URL directly"
echo "   Monolithic URL: https://uodttljjzj3nh3e4cjqardxip40btqef.lambda-url.ap-south-1.on.aws"
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

# Get integration IDs
WEB_INTEGRATION="3cchzqa"  # Web microservice
MONOLITHIC_INTEGRATION="rs1a29j"  # Monolithic Lambda

echo "✅ API Gateway found: $API_ID"
echo ""

# Get all routes
echo "📋 Fetching routes..."
ALL_ROUTES=$(aws apigatewayv2 get-routes \
    --api-id "$API_ID" \
    --region "$REGION" \
    --query "Items[*].{RouteId:RouteId,RouteKey:RouteKey,Target:Target}" \
    --output json 2>/dev/null)

# Filter routes pointing to web microservice or monolithic
ROUTES_TO_DELETE=$(echo "$ALL_ROUTES" | jq -r --arg web "$WEB_INTEGRATION" --arg mono "$MONOLITHIC_INTEGRATION" \
    '[.[] | select(.Target | contains($web) or contains($mono)) | .RouteId] | .[]' 2>/dev/null)

TOTAL_TO_DELETE=$(echo "$ROUTES_TO_DELETE" | wc -l | tr -d ' ')

if [ "$TOTAL_TO_DELETE" -eq 0 ]; then
    echo "✅ No routes found to delete"
    exit 0
fi

echo "📊 Found $TOTAL_TO_DELETE routes to delete:"
echo "   - Web microservice routes (integration: $WEB_INTEGRATION)"
echo "   - Monolithic Lambda routes (integration: $MONOLITHIC_INTEGRATION)"
echo ""

if [ "$AUTO_CONFIRM" = false ]; then
    read -p "⚠️  Are you sure you want to delete $TOTAL_TO_DELETE routes? (y/N): " confirm
    if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
        echo "Aborted."
        exit 0
    fi
else
    echo "⚠️  Auto-confirming deletion (--yes flag provided)"
fi

echo ""
echo "🗑️  Deleting routes..."
echo ""

DELETED_COUNT=0
FAILED_COUNT=0

while IFS= read -r ROUTE_ID; do
    if [ -z "$ROUTE_ID" ]; then
        continue
    fi
    
    # Get route key for logging
    ROUTE_KEY=$(echo "$ALL_ROUTES" | jq -r --arg id "$ROUTE_ID" '.[] | select(.RouteId == $id) | .RouteKey' 2>/dev/null)
    
    if aws apigatewayv2 delete-route \
        --api-id "$API_ID" \
        --route-id "$ROUTE_ID" \
        --region "$REGION" >/dev/null 2>&1; then
        echo "✅ Deleted: $ROUTE_KEY"
        DELETED_COUNT=$((DELETED_COUNT + 1))
    else
        echo "❌ Failed to delete: $ROUTE_KEY ($ROUTE_ID)"
        FAILED_COUNT=$((FAILED_COUNT + 1))
    fi
    
    # Small delay to avoid rate limiting
    sleep 0.1
done <<< "$ROUTES_TO_DELETE"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Deletion Complete!"
echo ""
echo "📊 Summary:"
echo "   ✅ Deleted: $DELETED_COUNT"
echo "   ❌ Failed: $FAILED_COUNT"
echo ""
echo "💡 Routes are now accessible via Lambda Function URL:"
echo "   https://uodttljjzj3nh3e4cjqardxip40btqef.lambda-url.ap-south-1.on.aws"
echo ""

