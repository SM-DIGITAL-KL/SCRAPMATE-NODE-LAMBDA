#!/bin/bash

# Script to diagnose and fix stuck GSI creation issues
# Usage: ./diagnose-gsi-issue.sh [table-name] [index-name]

TABLE_NAME="${1:-orders}"
INDEX_NAME="${2:-status-created_at-index}"
REGION="ap-south-1"

echo "🔍 Diagnosing GSI issue for: $TABLE_NAME / $INDEX_NAME"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Function to get full table description
get_full_table_info() {
    echo "📋 Full Table Information:"
    aws dynamodb describe-table \
        --table-name $TABLE_NAME \
        --region $REGION \
        --output json 2>/dev/null | jq -r '.Table | {
            TableName: .TableName,
            TableStatus: .TableStatus,
            ItemCount: .ItemCount,
            TableSizeBytes: .TableSizeBytes,
            BillingMode: .BillingModeSummary.BillingMode,
            GSICount: (.GlobalSecondaryIndexes | length)
        }'
    echo ""
}

# Function to get detailed GSI information
get_detailed_gsi_info() {
    echo "📊 Detailed GSI Information:"
    local gsi_info=$(aws dynamodb describe-table \
        --table-name $TABLE_NAME \
        --region $REGION \
        --query "Table.GlobalSecondaryIndexes[?IndexName=='$INDEX_NAME']" \
        --output json 2>/dev/null)
    
    if [ -z "$gsi_info" ] || [ "$gsi_info" == "[]" ]; then
        echo "❌ GSI '$INDEX_NAME' not found in table description"
        return 1
    fi
    
    echo "$gsi_info" | jq -r '.[0] | {
        IndexName: .IndexName,
        IndexStatus: .IndexStatus,
        IndexSizeBytes: .IndexSizeBytes,
        ItemCount: .ItemCount,
        KeySchema: .KeySchema,
        Projection: .Projection,
        ProvisionedThroughput: .ProvisionedThroughput,
        Backfilling: .Backfilling
    }'
    echo ""
}

# Function to check CloudWatch metrics
check_cloudwatch_metrics() {
    echo "📈 CloudWatch Metrics (last 1 hour):"
    
    # Get date command that works on both Linux (GNU) and macOS (BSD)
    if date -v-1H >/dev/null 2>&1; then
        # macOS BSD date
        local start_time=$(date -u -v-1H +%Y-%m-%dT%H:%M:%S)
    else
        # Linux GNU date
        local start_time=$(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S)
    fi
    local end_time=$(date -u +%Y-%m-%dT%H:%M:%S)
    
    # Check OnlineIndexPercentageProgress
    local progress=$(aws cloudwatch get-metric-statistics \
        --namespace AWS/DynamoDB \
        --metric-name OnlineIndexPercentageProgress \
        --dimensions Name=TableName,Value=$TABLE_NAME Name=GlobalSecondaryIndexName,Value=$INDEX_NAME \
        --start-time "$start_time" \
        --end-time "$end_time" \
        --period 300 \
        --statistics Average,Maximum \
        --region $REGION \
        --output json 2>/dev/null)
    
    if [ -n "$progress" ] && [ "$progress" != "null" ] && [ "$progress" != "{}" ]; then
        echo "$progress" | jq -r '.Datapoints | sort_by(.Timestamp) | .[] | "   \(.Timestamp): \(.Average)% (Max: \(.Maximum)%)"'
    else
        echo "   ⚠️  No progress metrics found (GSI may not be actively creating or doesn't exist)"
    fi
    echo ""
}

# Function to check for errors in CloudWatch Logs
check_cloudwatch_logs() {
    echo "📝 Checking for DynamoDB errors in CloudWatch Logs..."
    echo "   (This may take a moment)"
    
    # Check for recent DynamoDB API errors
    local log_groups=$(aws logs describe-log-groups \
        --region $REGION \
        --query 'logGroups[?contains(logGroupName, `DynamoDB`) || contains(logGroupName, `dynamodb`)].logGroupName' \
        --output text 2>/dev/null)
    
    if [ -n "$log_groups" ]; then
        echo "   Found DynamoDB-related log groups"
    else
        echo "   ℹ️  No DynamoDB-specific log groups found"
    fi
    echo ""
}

# Function to check table limits
check_table_limits() {
    echo "⚠️  Table Limits Check:"
    local gsi_count=$(aws dynamodb describe-table \
        --table-name $TABLE_NAME \
        --region $REGION \
        --query 'length(Table.GlobalSecondaryIndexes)' \
        --output text 2>/dev/null)
    
    # Handle empty result
    if [ -z "$gsi_count" ]; then
        gsi_count=0
    fi
    
    echo "   Current GSIs: $gsi_count / 20 (DynamoDB limit)"
    
    if [ "$gsi_count" -ge 20 ] 2>/dev/null; then
        echo "   ❌ Table has reached the maximum number of GSIs (20)"
        return 1
    fi
    echo ""
}

# Function to get recommendations
get_recommendations() {
    echo "💡 Recommendations:"
    echo ""
    
    # Check if GSI exists
    local gsi_exists=$(aws dynamodb describe-table \
        --table-name $TABLE_NAME \
        --region $REGION \
        --query "Table.GlobalSecondaryIndexes[?IndexName=='$INDEX_NAME'].IndexName" \
        --output text 2>/dev/null)
    
    local status=$(aws dynamodb describe-table \
        --table-name $TABLE_NAME \
        --region $REGION \
        --query "Table.GlobalSecondaryIndexes[?IndexName=='$INDEX_NAME'].IndexStatus" \
        --output text 2>/dev/null)
    
    if [ -z "$gsi_exists" ] || [ -z "$status" ]; then
        echo "   🔴 GSI '$INDEX_NAME' does NOT exist on table '$TABLE_NAME'"
        echo ""
        echo "   This explains why the creation appeared stuck - the GSI was never created!"
        echo ""
        echo "   ✅ Solution: Create the GSI now"
        echo "   Run: ./create-orders-gsi-sequential.sh"
        echo ""
        echo "   The script will create all required GSIs for the orders table."
        echo "   Monitor progress with: ./monitor-gsi-progress.sh $TABLE_NAME"
    elif [ "$status" == "None" ]; then
        echo "   🔴 Status is 'None' - GSI may be in a bad state"
        echo ""
        echo "   Option 1: Delete and recreate the GSI"
        echo "   Run: ./delete-gsi.sh $TABLE_NAME $INDEX_NAME"
        echo "   Then: ./create-orders-gsi-sequential.sh"
        echo ""
        echo "   Option 2: Check AWS Console for more details"
        echo "   https://console.aws.amazon.com/dynamodbv2/home?region=$REGION#table?name=$TABLE_NAME"
        echo ""
        echo "   Option 3: Contact AWS Support if issue persists"
    elif [ "$status" == "CREATING" ]; then
        echo "   🟡 GSI is still CREATING"
        echo "   - This is normal for large tables"
        echo "   - Check CloudWatch metrics for progress"
        echo "   - Large tables can take hours to index"
        echo "   - Monitor with: ./monitor-gsi-progress.sh $TABLE_NAME $INDEX_NAME"
    elif [ "$status" == "UPDATING" ]; then
        echo "   🟡 GSI is UPDATING"
        echo "   - This usually happens when changing throughput"
        echo "   - Wait for it to complete"
    elif [ "$status" == "DELETING" ]; then
        echo "   🟠 GSI is DELETING"
        echo "   - Wait for deletion to complete before recreating"
    elif [ "$status" == "ACTIVE" ]; then
        echo "   🟢 GSI is ACTIVE - No action needed!"
    else
        echo "   ⚠️  Unknown status: $status"
        echo "   - Check AWS Console for details"
    fi
    echo ""
}

# Main execution
echo "Step 1: Checking table information..."
get_full_table_info

echo "Step 2: Checking GSI details..."
if ! get_detailed_gsi_info; then
    echo "⚠️  GSI not found. It may have been deleted or never created."
    echo ""
fi

echo "Step 3: Checking CloudWatch metrics..."
check_cloudwatch_metrics

echo "Step 4: Checking table limits..."
check_table_limits

echo "Step 5: Getting recommendations..."
get_recommendations

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📊 Quick Status Check:"
aws dynamodb describe-table \
    --table-name $TABLE_NAME \
    --region $REGION \
    --query "Table.GlobalSecondaryIndexes[?IndexName=='$INDEX_NAME'].{IndexName:IndexName,Status:IndexStatus,Backfilling:Backfilling}" \
    --output table 2>/dev/null || echo "❌ Could not retrieve GSI status"
