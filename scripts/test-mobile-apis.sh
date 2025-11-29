#!/bin/bash

# Test all mobile APIs with both monolithic and microservice URLs
# Compare responses and report differences
# Usage: ./scripts/test-mobile-apis.sh [api-key]

API_KEY=${1:-'zyubkfzeumeoviaqzcsrvfwdzbiwnlnn'}
STAGE=${2:-dev}
REGION=${3:-ap-south-1}

echo "🧪 Testing Mobile APIs - Monolithic vs Microservices"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
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

# Get URLs
MONOLITHIC_URL=$(aws lambda get-function-url-config --function-name scrapmate-node-api-${STAGE} --region "$REGION" --query 'FunctionUrl' --output text 2>/dev/null | sed 's|/$||')
API_ID=$(aws apigatewayv2 get-apis --region "$REGION" --query "Items[?Name=='scrapmate-api-${STAGE}'].ApiId" --output text 2>/dev/null)
MICROSERVICE_URL=$(aws apigatewayv2 get-api --api-id "$API_ID" --region "$REGION" --query 'ApiEndpoint' --output text 2>/dev/null | sed 's|/$||')

if [ -z "$MONOLITHIC_URL" ] || [ -z "$MICROSERVICE_URL" ]; then
    echo "❌ Failed to get URLs"
    echo "   Monolithic: $MONOLITHIC_URL"
    echo "   Microservice: $MICROSERVICE_URL"
    exit 1
fi

echo "📋 URLs:"
echo "   Monolithic: $MONOLITHIC_URL"
echo "   Microservice: $MICROSERVICE_URL"
echo ""

# Test routes with sample data
declare -a TEST_ROUTES=(
    # GET routes (no body needed)
    "GET|/api/thirdPartyCredentials"
    "GET|/api/get_all_tables"
    "GET|/api/stateAllow"
    "GET|/api/packagesSub"
    "GET|/api/count_row/users"
    "GET|/api/all_pro_category"
    "GET|/api/category_img_list"
    "GET|/api/versionCheck/1.0.0"
    
    # POST routes (with sample body)
    "POST|/api/get_table_condition|{\"table\":\"users\",\"condition\":\"id=1\"}"
    "POST|/api/login_app|{\"mob\":\"9605056015\"}"
    "POST|/api/users_register|{\"name\":\"Test User\",\"email\":\"test@test.com\",\"mob_number\":\"1234567890\",\"usertype\":\"C\",\"address\":\"Test Address\",\"language\":\"en\"}"
    "POST|/api/get_table|{\"table\":\"users\"}"
    "POST|/api/savecallLog|{\"user_id\":\"1\",\"call_type\":\"incoming\"}"
    "POST|/api/savecallLogCust|{\"user_id\":\"1\",\"call_type\":\"incoming\"}"
    "POST|/api/failedJobs|{\"job_id\":\"1\"}"
    "POST|/api/PermanentDelete|{\"table\":\"test\",\"id\":\"1\"}"
)

TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0
DIFF_COUNT=0

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🧪 Running Tests..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

for route_entry in "${TEST_ROUTES[@]}"; do
    IFS='|' read -r method path body <<< "$route_entry"
    
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    
    echo "Test $TOTAL_TESTS: $method $path"
    
    # Prepare curl command
    if [ "$method" = "GET" ]; then
        MONO_CMD="curl -s -X GET \"${MONOLITHIC_URL}${path}\" -H \"api-key: ${API_KEY}\""
        MICRO_CMD="curl -s -X GET \"${MICROSERVICE_URL}${path}\" -H \"api-key: ${API_KEY}\""
    else
        MONO_CMD="curl -s -X POST \"${MONOLITHIC_URL}${path}\" -H \"api-key: ${API_KEY}\" -H \"Content-Type: application/json\" -d '${body}'"
        MICRO_CMD="curl -s -X POST \"${MICROSERVICE_URL}${path}\" -H \"api-key: ${API_KEY}\" -H \"Content-Type: application/json\" -d '${body}'"
    fi
    
    # Get responses
    MONO_RESPONSE=$(eval "$MONO_CMD" 2>/dev/null)
    MICRO_RESPONSE=$(eval "$MICRO_CMD" 2>/dev/null)
    
    # Normalize responses (remove whitespace, sort keys)
    MONO_NORM=$(echo "$MONO_RESPONSE" | jq -S . 2>/dev/null || echo "$MONO_RESPONSE")
    MICRO_NORM=$(echo "$MICRO_RESPONSE" | jq -S . 2>/dev/null || echo "$MICRO_RESPONSE")
    
    # Compare
    if [ "$MONO_NORM" = "$MICRO_NORM" ]; then
        echo "   ✅ PASS - Responses match"
        PASSED_TESTS=$((PASSED_TESTS + 1))
    else
        echo "   ❌ FAIL - Responses differ"
        FAILED_TESTS=$((FAILED_TESTS + 1))
        DIFF_COUNT=$((DIFF_COUNT + 1))
        
        echo "   📋 Monolithic response:"
        echo "$MONO_RESPONSE" | jq . 2>/dev/null | head -5 | sed 's/^/      /'
        echo "   📋 Microservice response:"
        echo "$MICRO_RESPONSE" | jq . 2>/dev/null | head -5 | sed 's/^/      /'
        
        # Save diff to file
        echo "$method $path" >> /tmp/api-diffs.txt
        echo "Monolithic:" >> /tmp/api-diffs.txt
        echo "$MONO_RESPONSE" >> /tmp/api-diffs.txt
        echo "---" >> /tmp/api-diffs.txt
        echo "Microservice:" >> /tmp/api-diffs.txt
        echo "$MICRO_RESPONSE" >> /tmp/api-diffs.txt
        echo "==========" >> /tmp/api-diffs.txt
    fi
    
    echo ""
done

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 Test Summary"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "   Total Tests: $TOTAL_TESTS"
echo "   ✅ Passed: $PASSED_TESTS"
echo "   ❌ Failed: $FAILED_TESTS"
echo ""

if [ $FAILED_TESTS -gt 0 ]; then
    echo "⚠️  Differences found! Check /tmp/api-diffs.txt for details"
    echo ""
    echo "📋 Failed routes:"
    cat /tmp/api-diffs.txt | grep -E "^GET|^POST" | sed 's/^/   - /'
    exit 1
else
    echo "✅ All tests passed! Responses match."
    exit 0
fi

