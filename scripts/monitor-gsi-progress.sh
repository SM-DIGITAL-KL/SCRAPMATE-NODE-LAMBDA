#!/bin/bash

# Script to monitor GSI creation progress using CloudWatch metrics
# Usage: ./monitor-gsi-progress.sh [table-name] [index-name]
# If no table name is provided, it will monitor all tables
# If table name is provided but no index name, it will monitor all GSIs for that table
# If both are provided, it will monitor the specific index for that table

REGION="ap-south-1"
TABLE_NAME="${1:-}"
INDEX_NAME="${2:-}"

# Function to get GSI progress from CloudWatch
get_gsi_progress() {
    local table_name=$1
    local index_name=$2
    
    # Get date command that works on both Linux (GNU) and macOS (BSD)
    if date -v-5M >/dev/null 2>&1; then
        # macOS BSD date
        local start_time=$(date -u -v-5M +%Y-%m-%dT%H:%M:%S)
    else
        # Linux GNU date
        local start_time=$(date -u -d '5 minutes ago' +%Y-%m-%dT%H:%M:%S)
    fi
    local end_time=$(date -u +%Y-%m-%dT%H:%M:%S)
    
    # Get the metric (may take a minute to appear)
    local progress=$(aws cloudwatch get-metric-statistics \
        --namespace AWS/DynamoDB \
        --metric-name OnlineIndexPercentageProgress \
        --dimensions Name=TableName,Value=$table_name Name=GlobalSecondaryIndexName,Value=$index_name \
        --start-time "$start_time" \
        --end-time "$end_time" \
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
    local table_name=$1
    local index_name=$2
    
    aws dynamodb describe-table \
        --table-name $table_name \
        --region $REGION \
        --query "Table.GlobalSecondaryIndexes[?IndexName=='$index_name'].IndexStatus" \
        --output text 2>/dev/null
}

# Function to get all GSIs for a table
get_table_gsis() {
    local table_name=$1
    
    aws dynamodb describe-table \
        --table-name $table_name \
        --region $REGION \
        --query 'Table.GlobalSecondaryIndexes[*].IndexName' \
        --output text 2>/dev/null
}

# Function to check if table exists
table_exists() {
    local table_name=$1
    
    aws dynamodb describe-table \
        --table-name $table_name \
        --region $REGION \
        >/dev/null 2>&1
}

# Function to get all tables
get_all_tables() {
    aws dynamodb list-tables \
        --region $REGION \
        --query 'TableNames[]' \
        --output text 2>/dev/null
}

# Function to monitor a single table
monitor_table() {
    local table_name=$1
    local specific_index="${2:-}"
    
    if ! table_exists "$table_name"; then
        echo "⚠️  Table '$table_name' does not exist (skipping)"
        return
    fi
    
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "📊 Table: $table_name"
    echo ""
    
    if [ -n "$specific_index" ]; then
        # Monitor specific index
        status=$(get_gsi_status "$table_name" "$specific_index")
        progress=$(get_gsi_progress "$table_name" "$specific_index")
        
        echo "   📌 Index: $specific_index"
        echo "      Status: $status"
        echo "      Progress: $progress"
        echo ""
    else
        # Get all GSIs for this table
        GSIS=$(get_table_gsis "$table_name")
        
        if [ -z "$GSIS" ]; then
            echo "   ℹ️  No GSIs found for this table"
            echo ""
            return
        fi
        
        # Monitor all GSIs
        for index in $GSIS; do
            status=$(get_gsi_status "$table_name" "$index")
            progress=$(get_gsi_progress "$table_name" "$index")
            
            echo "   📌 Index: $index"
            echo "      Status: $status"
            echo "      Progress: $progress"
            echo ""
        done
    fi
}

# Main execution
if [ -z "$TABLE_NAME" ]; then
    # Monitor all tables
    echo "📊 Monitoring GSI creation progress for ALL tables"
    echo "Region: $REGION"
    echo ""
    
    ALL_TABLES=$(get_all_tables)
    
    if [ -z "$ALL_TABLES" ]; then
        echo "❌ No tables found in DynamoDB"
        exit 1
    fi
    
    echo "Found $(echo $ALL_TABLES | wc -w | tr -d ' ') table(s)"
    echo ""
    
    # Monitor each table
    for table in $ALL_TABLES; do
        monitor_table "$table"
    done
    
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "💡 Tips:"
    echo "   - Run this script every 30-60 seconds to see progress"
    echo "   - Progress metric may take 1-2 minutes to appear after GSI creation starts"
    echo "   - When progress reaches 100%, status will change to ACTIVE"
    echo ""
    echo "📊 View in CloudWatch Console:"
    echo "   https://console.aws.amazon.com/cloudwatch/home?region=$REGION#metricsV2:graph=~();namespace=AWS/DynamoDB"
    
elif [ -n "$INDEX_NAME" ]; then
    # Monitor specific table and index
    echo "📊 Monitoring GSI creation progress"
    echo "Table: $TABLE_NAME | Index: $INDEX_NAME | Region: $REGION"
    echo ""
    
    monitor_table "$TABLE_NAME" "$INDEX_NAME"
    
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "💡 Tips:"
    echo "   - Run this script every 30-60 seconds to see progress"
    echo "   - Progress metric may take 1-2 minutes to appear after GSI creation starts"
    echo "   - When progress reaches 100%, status will change to ACTIVE"
    echo ""
    echo "📊 View in CloudWatch Console:"
    echo "   https://console.aws.amazon.com/cloudwatch/home?region=$REGION#metricsV2:graph=~();namespace=AWS/DynamoDB;dimensions=TableName,$TABLE_NAME"
    
else
    # Monitor all GSIs for specific table
    echo "📊 Monitoring GSI creation progress for table: $TABLE_NAME"
    echo "Region: $REGION"
    echo ""
    
    monitor_table "$TABLE_NAME"
    
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "💡 Tips:"
    echo "   - Run this script every 30-60 seconds to see progress"
    echo "   - Progress metric may take 1-2 minutes to appear after GSI creation starts"
    echo "   - When progress reaches 100%, status will change to ACTIVE"
    echo ""
    echo "📊 View in CloudWatch Console:"
    echo "   https://console.aws.amazon.com/cloudwatch/home?region=$REGION#metricsV2:graph=~();namespace=AWS/DynamoDB;dimensions=TableName,$TABLE_NAME"
fi
