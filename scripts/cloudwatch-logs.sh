#!/bin/bash

# View CloudWatch Logs for Lambda Functions
# Usage: ./scripts/cloudwatch-logs.sh [service-name] [stage] [region]
# Example: ./scripts/cloudwatch-logs.sh utility dev ap-south-1
# Example: ./scripts/cloudwatch-logs.sh (shows menu)

SERVICE_NAME=${1:-""}
STAGE=${2:-dev}
REGION=${3:-ap-south-1}
FUNCTION_PREFIX="scrapmate-ms-${STAGE}"

# Load AWS credentials
if [ -f "aws.txt" ]; then
    source aws.txt 2>/dev/null || {
        export AWS_ACCESS_KEY_ID=$(grep AWS_ACCESS_KEY_ID aws.txt | cut -d'=' -f2 | tr -d '"' | tr -d "'")
        export AWS_SECRET_ACCESS_KEY=$(grep AWS_SECRET_ACCESS_KEY aws.txt | cut -d'=' -f2 | tr -d '"' | tr -d "'")
        export AWS_REGION=$(grep AWS_REGION aws.txt | cut -d'=' -f2 | tr -d '"' | tr -d "'")
    }
fi

export AWS_REGION=${AWS_REGION:-$REGION}

# Services list
SERVICES=(
    "auth"
    "shop"
    "product"
    "order"
    "delivery"
    "user"
    "notification"
    "utility"
    "health"
)

# If service name provided, show logs directly
if [ -n "$SERVICE_NAME" ]; then
    FUNCTION_NAME="${FUNCTION_PREFIX}-${SERVICE_NAME}"
    LOG_GROUP="/aws/lambda/${FUNCTION_NAME}"
    
    # Capitalize first letter (compatible with zsh)
    FIRST_CHAR=$(echo "$SERVICE_NAME" | cut -c1 | tr '[:lower:]' '[:upper:]')
    REST_CHARS=$(echo "$SERVICE_NAME" | cut -c2-)
    SERVICE_DISPLAY="${FIRST_CHAR}${REST_CHARS}"
    echo "📊 Viewing ${SERVICE_DISPLAY} Service logs (live)..."
    echo "   Function: $FUNCTION_NAME"
    echo "   Log Group: $LOG_GROUP"
    echo "   Press Ctrl+C to stop"
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    
    # Check if log group exists
    if ! aws logs describe-log-groups --log-group-name-prefix "$LOG_GROUP" --region "$REGION" --query 'logGroups[0]' --output text 2>/dev/null | grep -q .; then
        echo "❌ Log group not found: $LOG_GROUP"
        echo "   The function may not have been invoked yet."
        exit 1
    fi
    
    # Tail logs live
    aws logs tail "$LOG_GROUP" --region "$REGION" --follow --format short 2>&1
    exit 0
fi

# Interactive menu
echo "=========================================="
echo "CloudWatch Logs Viewer"
echo "=========================================="
echo ""
echo "Select a service to view logs:"
echo ""

for i in "${!SERVICES[@]}"; do
    SERVICE="${SERVICES[$i]}"
    FIRST_CHAR=$(echo "$SERVICE" | cut -c1 | tr '[:lower:]' '[:upper:]')
    REST_CHARS=$(echo "$SERVICE" | cut -c2-)
    SERVICE_DISPLAY="${FIRST_CHAR}${REST_CHARS}"
    echo "$((i+1)). ${SERVICE_DISPLAY} Service"
done
echo "$((${#SERVICES[@]}+1)). All Services (live)"
echo "$((${#SERVICES[@]}+2)). Exit"
echo ""

read -p "Enter choice [1-$((${#SERVICES[@]}+2))]: " choice

if [ "$choice" -ge 1 ] && [ "$choice" -le "${#SERVICES[@]}" ]; then
    SELECTED_SERVICE="${SERVICES[$((choice-1))]}"
    FUNCTION_NAME="${FUNCTION_PREFIX}-${SELECTED_SERVICE}"
    LOG_GROUP="/aws/lambda/${FUNCTION_NAME}"
    
    FIRST_CHAR=$(echo "$SELECTED_SERVICE" | cut -c1 | tr '[:lower:]' '[:upper:]')
    REST_CHARS=$(echo "$SELECTED_SERVICE" | cut -c2-)
    SELECTED_DISPLAY="${FIRST_CHAR}${REST_CHARS}"
    echo ""
    echo "📊 Viewing ${SELECTED_DISPLAY} Service logs (live)..."
    echo "   Function: $FUNCTION_NAME"
    echo "   Log Group: $LOG_GROUP"
    echo "   Press Ctrl+C to stop"
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    
    # Check if log group exists
    if ! aws logs describe-log-groups --log-group-name-prefix "$LOG_GROUP" --region "$REGION" --query 'logGroups[0]' --output text 2>/dev/null | grep -q .; then
        echo "❌ Log group not found: $LOG_GROUP"
        echo "   The function may not have been invoked yet."
        exit 1
    fi
    
    # Tail logs live
    aws logs tail "$LOG_GROUP" --region "$REGION" --follow --format short 2>&1
    
elif [ "$choice" -eq "$((${#SERVICES[@]}+1))" ]; then
    echo ""
    echo "📊 Viewing all services logs (live)..."
    echo "   Press Ctrl+C to stop"
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    
    # Tail all log groups
    for SERVICE in "${SERVICES[@]}"; do
        FUNCTION_NAME="${FUNCTION_PREFIX}-${SERVICE}"
        LOG_GROUP="/aws/lambda/${FUNCTION_NAME}"
        
        if aws logs describe-log-groups --log-group-name-prefix "$LOG_GROUP" --region "$REGION" --query 'logGroups[0]' --output text 2>/dev/null | grep -q .; then
            FIRST_CHAR=$(echo "$SERVICE" | cut -c1 | tr '[:lower:]' '[:upper:]')
            REST_CHARS=$(echo "$SERVICE" | cut -c2-)
            SERVICE_DISPLAY="${FIRST_CHAR}${REST_CHARS}"
            echo "📋 ${SERVICE_DISPLAY} Service:"
            aws logs tail "$LOG_GROUP" --region "$REGION" --follow --format short 2>&1 &
        fi
    done
    
    # Wait for all background processes
    wait
    
elif [ "$choice" -eq "$((${#SERVICES[@]}+2))" ]; then
    echo "Exiting..."
    exit 0
else
    echo "❌ Invalid choice"
    exit 1
fi

