#!/bin/bash

# Count and Analyze API Gateway Routes
# Usage: ./scripts/count-api-gateway-routes.sh [api-name] [region]
# Example: ./scripts/count-api-gateway-routes.sh scrapmate-api-dev ap-south-1

API_NAME=${1:-scrapmate-api-dev}
REGION=${2:-ap-south-1}

echo "📊 API Gateway Routes Analysis"
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

# Get all routes
echo "📋 Fetching all routes..."
ALL_ROUTES=$(aws apigatewayv2 get-routes \
    --api-id "$API_ID" \
    --region "$REGION" \
    --query 'Items[*].{RouteKey:RouteKey,Target:Target}' \
    --output json 2>/dev/null)

TOTAL_ROUTES=$(echo "$ALL_ROUTES" | jq '. | length' 2>/dev/null || echo "0")

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 Route Statistics"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "   Total Routes: $TOTAL_ROUTES"
echo "   AWS Limit: 600 routes per API Gateway"
echo "   Available: $((600 - TOTAL_ROUTES))"
echo ""

# Count by method
echo "📋 Routes by HTTP Method:"
GET_COUNT=$(echo "$ALL_ROUTES" | jq '[.[] | select(.RouteKey | startswith("GET"))] | length' 2>/dev/null || echo "0")
POST_COUNT=$(echo "$ALL_ROUTES" | jq '[.[] | select(.RouteKey | startswith("POST"))] | length' 2>/dev/null || echo "0")
PUT_COUNT=$(echo "$ALL_ROUTES" | jq '[.[] | select(.RouteKey | startswith("PUT"))] | length' 2>/dev/null || echo "0")
DELETE_COUNT=$(echo "$ALL_ROUTES" | jq '[.[] | select(.RouteKey | startswith("DELETE"))] | length' 2>/dev/null || echo "0")
ANY_COUNT=$(echo "$ALL_ROUTES" | jq '[.[] | select(.RouteKey | startswith("ANY"))] | length' 2>/dev/null || echo "0")

echo "   GET:    $GET_COUNT"
echo "   POST:   $POST_COUNT"
echo "   PUT:    $PUT_COUNT"
echo "   DELETE: $DELETE_COUNT"
echo "   ANY:    $ANY_COUNT"
echo ""

# Count by service/integration
echo "📋 Routes by Service/Integration:"
echo "$ALL_ROUTES" | jq -r '.[].Target' 2>/dev/null | sed 's|integrations/||' | sort | uniq -c | sort -rn | while read count integration; do
    # Get integration details
    INTEGRATION_NAME=$(aws apigatewayv2 get-integration \
        --api-id "$API_ID" \
        --integration-id "$integration" \
        --region "$REGION" \
        --query 'IntegrationUri' \
        --output text 2>/dev/null | grep -o 'scrapmate-[^/]*' | head -1 || echo "Unknown")
    echo "   $count routes → $INTEGRATION_NAME ($integration)"
done

echo ""

# Count admin routes
ADMIN_ROUTES=$(echo "$ALL_ROUTES" | jq '[.[] | select(.RouteKey | contains("admin"))] | length' 2>/dev/null || echo "0")
echo "📋 Admin Panel Routes: $ADMIN_ROUTES"

# Count by path prefix
echo ""
echo "📋 Routes by Path Prefix:"
echo "$ALL_ROUTES" | jq -r '.[].RouteKey' 2>/dev/null | awk '{print $2}' | cut -d'/' -f1-2 | sort | uniq -c | sort -rn | head -20 | while read count prefix; do
    echo "   $count routes → $prefix"
done

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "💡 To see all routes, run:"
echo "   aws apigatewayv2 get-routes --api-id $API_ID --region $REGION --query 'Items[*].RouteKey' --output table"
echo ""

