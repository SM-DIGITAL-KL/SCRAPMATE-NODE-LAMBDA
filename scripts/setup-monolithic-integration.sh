#!/bin/bash

# Setup Monolithic Lambda Integration in API Gateway
# Usage: ./scripts/setup-monolithic-integration.sh [api-name] [stage] [region]
# Example: ./scripts/setup-monolithic-integration.sh scrapmate-api-dev dev ap-south-1

API_NAME=${1:-scrapmate-api-dev}
STAGE=${2:-dev}
REGION=${3:-ap-south-1}
MONOLITHIC_FUNCTION="scrapmate-node-api-${STAGE}"

echo "🚀 Setting up Monolithic Lambda Integration"
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

# Get monolithic Lambda function ARN
FUNCTION_ARN=$(aws lambda get-function --function-name "$MONOLITHIC_FUNCTION" --region "$REGION" --query 'Configuration.FunctionArn' --output text 2>/dev/null)
if [ -z "$FUNCTION_ARN" ] || [ "$FUNCTION_ARN" == "None" ]; then
    echo "❌ Monolithic Lambda function '$MONOLITHIC_FUNCTION' not found."
    echo "   Please deploy it first: ./scripts/deploy-lambda-direct.sh $STAGE $REGION"
    exit 1
fi

echo "✅ API Gateway found: $API_ID"
echo "✅ Monolithic Lambda found: $FUNCTION_ARN"
echo ""

# Create integration for monolithic Lambda
INTEGRATION_URI="arn:aws:apigateway:${REGION}:lambda:path/2015-03-31/functions/${FUNCTION_ARN}/invocations"
EXISTING_INTEGRATION=$(aws apigatewayv2 get-integrations \
    --api-id "$API_ID" \
    --region "$REGION" \
    --query "Items[?IntegrationUri=='$INTEGRATION_URI'].IntegrationId" \
    --output text 2>/dev/null | awk '{print $1}')

if [ -z "$EXISTING_INTEGRATION" ] || [ "$EXISTING_INTEGRATION" == "None" ]; then
    echo "🔗 Creating integration for monolithic Lambda..."
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
        --function-name "$MONOLITHIC_FUNCTION" \
        --statement-id "api-gateway-monolithic-$(date +%s)" \
        --action lambda:InvokeFunction \
        --principal apigateway.amazonaws.com \
        --source-arn "$SOURCE_ARN" \
        --region "$REGION" >/dev/null 2>&1 && echo "✅ Permission granted" || echo "⚠️  Permission may already exist"
else
    INTEGRATION_ID="$EXISTING_INTEGRATION"
    echo "✅ Integration already exists: $INTEGRATION_ID"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Monolithic Integration Setup Complete!"
echo "   Integration ID: $INTEGRATION_ID"
echo "   Function: $MONOLITHIC_FUNCTION"
echo ""
echo "💡 Next steps:"
echo "   1. Delete admin panel routes from API Gateway (pointing to web microservice)"
echo "   2. Create admin panel routes pointing to monolithic Lambda"
echo "   3. Run unified deployment script to update both"
echo ""

