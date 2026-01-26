#!/bin/bash

# Script to monitor GSI creation progress using CloudWatch metrics
# Usage: ./monitor-gsi-progress.sh [index-name]
# If no index name is provided, it will monitor all GSIs

TABLE_NAME="users"
REGION="ap-south-1"
INDEX_NAME="${1:-}"

echo "📊 Monitoring GSI creation progress for table: $TABLE_NAME"
echo ""

# Function to get GSI progress from CloudWatch
get_gsi_progress() {
    local index_name=$1
    
    # Get the metric (may take a minute to appear)
    local progress=$(aws cloudwatch get-metric-statistics \
        --namespace AWS/DynamoDB \
        --metric-name OnlineIndexPercentageProgress \
        --dimensions Name=TableName,Value=$TABLE_NAME Name=GlobalSecondaryIndexName,Value=$index_name \
        --start-time $(date -u -d '5 minutes ago' +%Y-%m-%dT%H:%M:%S) \
        --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
        --period 60 \
        --statistics Average \
        --region $REGION \
        --query 'Datapoints[0].Average' \
        --output text 2>/dev/null)
    
    if [ -z "$progress" ] || [ "$progress" == "None" ]; then
        echo "N/A (metric not available yet - may take 1-2 minutes to appear)"
    else
        printf "%.2f%%" "$progress"
    fi
}

# Function to get GSI status from DynamoDB
get_gsi_status() {
    local index_name=$1
    
    aws dynamodb describe-table \
        --table-name $TABLE_NAME \
        --region $REGION \
        --query "Table.GlobalSecondaryIndexes[?IndexName=='$index_name'].IndexStatus" \
        --output text 2>/dev/null
}

# Get all GSIs
if [ -z "$INDEX_NAME" ]; then
    echo "📋 Getting all GSIs..."
    GSIS=$(aws dynamodb describe-table \
        --table-name $TABLE_NAME \
        --region $REGION \
        --query 'Table.GlobalSecondaryIndexes[*].IndexName' \
        --output text)
    
    if [ -z "$GSIS" ]; then
        echo "❌ No GSIs found"
        exit 1
    fi
    
    echo "Found GSIs: $GSIS"
    echo ""
    
    # Monitor all GSIs
    for index in $GSIS; do
        status=$(get_gsi_status "$index")
        progress=$(get_gsi_progress "$index")
        
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo "📌 Index: $index"
        echo "   Status: $status"
        echo "   Progress: $progress"
        echo ""
    done
else
    # Monitor specific GSI
    status=$(get_gsi_status "$INDEX_NAME")
    progress=$(get_gsi_progress "$INDEX_NAME")
    
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "📌 Index: $INDEX_NAME"
    echo "   Status: $status"
    echo "   Progress: $progress"
    echo ""
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "💡 Tips:"
echo "   - Run this script every 30-60 seconds to see progress"
echo "   - Progress metric may take 1-2 minutes to appear after GSI creation starts"
echo "   - When progress reaches 100%, status will change to ACTIVE"
echo ""
echo "📊 View in CloudWatch Console:"
echo "   https://console.aws.amazon.com/cloudwatch/home?region=$REGION#metricsV2:graph=~();namespace=AWS/DynamoDB;dimensions=TableName,$TABLE_NAME"
