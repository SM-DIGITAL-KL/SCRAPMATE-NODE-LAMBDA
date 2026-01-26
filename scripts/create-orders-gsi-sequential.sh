#!/bin/bash

# Script to create Global Secondary Indexes (GSIs) for the orders table
# IMPORTANT: Only one GSI can be created at a time. This script creates them sequentially.
# 
# Usage: ./create-orders-gsi-sequential.sh
# 
# Note: GSIs can take time to build (minutes to hours depending on table size)
# Monitor progress: aws dynamodb describe-table --table-name orders

set -e  # Exit on error

TABLE_NAME="orders"
REGION="ap-south-1"

echo "🚀 Starting sequential GSI creation for orders table..."
echo "⚠️  Note: Only one GSI can be created at a time. This script will wait for each to complete."
echo ""

# Function to wait for GSI to be active
wait_for_gsi() {
    local index_name=$1
    echo "⏳ Waiting for GSI '$index_name' to become ACTIVE..."
    
    while true; do
        local status=$(aws dynamodb describe-table \
            --table-name $TABLE_NAME \
            --region $REGION \
            --query "Table.GlobalSecondaryIndexes[?IndexName=='$index_name'].IndexStatus" \
            --output text 2>/dev/null || echo "NOT_FOUND")
        
        if [ -z "$status" ]; then
            status="NOT_FOUND"
        fi
        
        if [ "$status" == "ACTIVE" ]; then
            echo "✅ GSI '$index_name' is now ACTIVE"
            return 0
        elif [ "$status" == "NOT_FOUND" ]; then
            echo "❌ GSI '$index_name' not found"
            return 1
        else
            echo "   Current status: $status (checking again in 30 seconds...)"
            sleep 30
        fi
    done
}

# Function to create GSI
create_gsi() {
    local index_name=$1
    local hash_key=$2
    local hash_type=$3
    local range_key=$4
    local range_type=$5
    
    # Check if GSI already exists and is active
    local existing_status=$(aws dynamodb describe-table \
        --table-name $TABLE_NAME \
        --region $REGION \
        --query "Table.GlobalSecondaryIndexes[?IndexName=='$index_name'].IndexStatus" \
        --output text 2>/dev/null)
    
    # If query returns empty, GSI doesn't exist
    if [ -z "$existing_status" ]; then
        existing_status="NOT_FOUND"
    fi
    
    if [ "$existing_status" == "ACTIVE" ]; then
        echo "⏭️  GSI '$index_name' already exists and is ACTIVE, skipping..."
        return 0
    elif [ "$existing_status" == "CREATING" ] || [ "$existing_status" == "UPDATING" ]; then
        echo "⏳ GSI '$index_name' exists with status: $existing_status, waiting for it to become ACTIVE..."
        wait_for_gsi "$index_name"
        return 0
    elif [ "$existing_status" != "NOT_FOUND" ]; then
        echo "⚠️  GSI '$index_name' exists with status: $existing_status"
        echo "   Waiting for it to become ACTIVE..."
        wait_for_gsi "$index_name"
        return 0
    fi
    
    echo "🔨 Creating GSI: $index_name..."
    
    # Create the GSI (check if table uses on-demand billing)
    local billing_mode=$(aws dynamodb describe-table \
        --table-name $TABLE_NAME \
        --region $REGION \
        --query 'Table.BillingModeSummary.BillingMode' \
        --output text 2>/dev/null || echo "PROVISIONED")
    
    # Build GSI JSON
    if [ "$billing_mode" == "PAY_PER_REQUEST" ]; then
        # On-demand billing - no ProvisionedThroughput
        local gsi_json="{\"Create\":{\"IndexName\":\"$index_name\",\"KeySchema\":[{\"AttributeName\":\"$hash_key\",\"KeyType\":\"HASH\"},{\"AttributeName\":\"$range_key\",\"KeyType\":\"RANGE\"}],\"Projection\":{\"ProjectionType\":\"ALL\"}}}"
    else
        # Provisioned billing - include ProvisionedThroughput
        local read_capacity=10
        local write_capacity=5
        if [ "$index_name" == "status-created_at-index" ]; then
            read_capacity=10
        fi
        local gsi_json="{\"Create\":{\"IndexName\":\"$index_name\",\"KeySchema\":[{\"AttributeName\":\"$hash_key\",\"KeyType\":\"HASH\"},{\"AttributeName\":\"$range_key\",\"KeyType\":\"RANGE\"}],\"Projection\":{\"ProjectionType\":\"ALL\"},\"ProvisionedThroughput\":{\"ReadCapacityUnits\":$read_capacity,\"WriteCapacityUnits\":$write_capacity}}}"
    fi
    
    # Create the GSI
    if aws dynamodb update-table \
        --table-name $TABLE_NAME \
        --region $REGION \
        --attribute-definitions \
            AttributeName=$hash_key,AttributeType=$hash_type \
            AttributeName=$range_key,AttributeType=$range_type \
        --global-secondary-index-updates "[$gsi_json]" \
        > /dev/null 2>&1; then
        echo "✅ GSI '$index_name' creation initiated successfully"
        wait_for_gsi "$index_name"
        return 0
    else
        echo "❌ Failed to create GSI '$index_name'"
        return 1
    fi
}

# Create GSIs in priority order (waiting for each to complete)
echo "📊 Creating GSIs in priority order..."
echo ""

# 1. status-created_at-index (Highest priority - for available pickup requests)
create_gsi "status-created_at-index" "status" "N" "created_at" "S"

# 2. customer_id-status-index (High priority)
create_gsi "customer_id-status-index" "customer_id" "N" "created_at" "S"

# 3. shop_id-status-index (High priority)
create_gsi "shop_id-status-index" "shop_id" "N" "created_at" "S"

# 4. delv_boy_id-status-index (Medium priority)
create_gsi "delv_boy_id-status-index" "delv_boy_id" "N" "created_at" "S"

# 5. order_no-index (Medium priority)
create_gsi "order_no-index" "order_no" "S" "id" "N"

echo ""
echo "✅ All GSIs created successfully!"
echo ""
echo "📊 Final GSI status:"
aws dynamodb describe-table \
    --table-name $TABLE_NAME \
    --region $REGION \
    --query 'Table.GlobalSecondaryIndexes[*].{IndexName:IndexName,Status:IndexStatus}' \
    --output table
