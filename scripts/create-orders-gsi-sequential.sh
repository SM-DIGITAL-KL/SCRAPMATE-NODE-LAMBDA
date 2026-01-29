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
    local max_wait_hours=${2:-24}  # Default 24 hours max wait
    local check_interval=30  # Check every 30 seconds
    local start_time=$(date +%s)
    local max_wait_seconds=$((max_wait_hours * 3600))
    local last_status=""
    local status_count=0
    
    echo "⏳ Waiting for GSI '$index_name' to become ACTIVE..."
    echo "   Maximum wait time: $max_wait_hours hours"
    echo ""
    
    while true; do
        local status=$(aws dynamodb describe-table \
            --table-name $TABLE_NAME \
            --region $REGION \
            --query "Table.GlobalSecondaryIndexes[?IndexName=='$index_name'].IndexStatus" \
            --output text 2>/dev/null || echo "NOT_FOUND")
        
        if [ -z "$status" ]; then
            status="NOT_FOUND"
        fi
        
        # Check if status has changed
        if [ "$status" != "$last_status" ]; then
            last_status="$status"
            status_count=0
        else
            status_count=$((status_count + 1))
        fi
        
        # Calculate elapsed time
        local current_time=$(date +%s)
        local elapsed=$((current_time - start_time))
        local elapsed_hours=$((elapsed / 3600))
        local elapsed_minutes=$(((elapsed % 3600) / 60))
        
        if [ "$status" == "ACTIVE" ]; then
            echo "✅ GSI '$index_name' is now ACTIVE (took ${elapsed_hours}h ${elapsed_minutes}m)"
            return 0
        elif [ "$status" == "NOT_FOUND" ]; then
            echo "❌ GSI '$index_name' not found"
            return 1
        elif [ "$status" == "None" ] || [ -z "$status" ]; then
            echo "⚠️  GSI '$index_name' has status: None (stuck for ${elapsed_hours}h ${elapsed_minutes}m)"
            echo "   This indicates a stuck GSI. Consider deleting and recreating."
            echo "   Run: ./diagnose-gsi-issue.sh $TABLE_NAME $index_name"
            if [ $elapsed -gt 7200 ]; then  # 2 hours
                echo "   ⚠️  GSI has been stuck for over 2 hours. Recommend deletion."
                return 1
            fi
        elif [ $elapsed -gt $max_wait_seconds ]; then
            echo "⏰ Maximum wait time ($max_wait_hours hours) exceeded"
            echo "   Current status: $status"
            echo "   GSI may still be creating. Check manually or extend timeout."
            return 1
        elif [ "$status_count" -gt 120 ]; then  # Same status for 1 hour (120 * 30s)
            echo "⚠️  GSI has been in '$status' status for over 1 hour without change"
            echo "   This may indicate a stuck operation."
            echo "   Run: ./diagnose-gsi-issue.sh $TABLE_NAME $index_name"
            status_count=0  # Reset counter
        else
            echo "   Status: $status | Elapsed: ${elapsed_hours}h ${elapsed_minutes}m (checking again in 30 seconds...)"
        fi
        
        sleep $check_interval
    done
}

# Function to create GSI
create_gsi() {
    local index_name=$1
    local hash_key=$2
    local hash_type=$3
    local range_key=$4
    local range_type=$5
    
    # Check if GSI exists by checking if it's in the GlobalSecondaryIndexes array
    local gsi_exists=$(aws dynamodb describe-table \
        --table-name $TABLE_NAME \
        --region $REGION \
        --query "Table.GlobalSecondaryIndexes[?IndexName=='$index_name'].IndexName" \
        --output text 2>/dev/null)
    
    # If GSI doesn't exist, proceed directly to creation
    if [ -z "$gsi_exists" ] || [ "$gsi_exists" == "None" ]; then
        echo "ℹ️  GSI '$index_name' does not exist, will create it..."
        # Continue to creation below
    else
        # GSI exists, check its status
        local existing_status=$(aws dynamodb describe-table \
            --table-name $TABLE_NAME \
            --region $REGION \
            --query "Table.GlobalSecondaryIndexes[?IndexName=='$index_name'].IndexStatus" \
            --output text 2>/dev/null)
        
        if [ "$existing_status" == "ACTIVE" ]; then
            echo "⏭️  GSI '$index_name' already exists and is ACTIVE, skipping..."
            return 0
        elif [ "$existing_status" == "CREATING" ] || [ "$existing_status" == "UPDATING" ]; then
            echo "⏳ GSI '$index_name' exists with status: $existing_status, waiting for it to become ACTIVE..."
            wait_for_gsi "$index_name"
            return 0
        elif [ "$existing_status" == "DELETING" ]; then
            echo "⏳ GSI '$index_name' is being deleted, waiting for deletion to complete..."
            while true; do
                local del_status=$(aws dynamodb describe-table \
                    --table-name $TABLE_NAME \
                    --region $REGION \
                    --query "Table.GlobalSecondaryIndexes[?IndexName=='$index_name'].IndexName" \
                    --output text 2>/dev/null)
                if [ -z "$del_status" ] || [ "$del_status" == "None" ]; then
                    echo "   ✅ GSI deleted, proceeding with creation..."
                    break
                fi
                echo "   Waiting for deletion... (checking again in 10 seconds...)"
                sleep 10
            done
            # Continue to creation below
        elif [ "$existing_status" == "None" ] || [ -z "$existing_status" ]; then
            echo "⚠️  GSI '$index_name' exists with status: None or empty"
            echo "   This usually indicates a stuck or failed GSI creation."
            echo "   Recommendation: Delete and recreate the GSI"
            echo ""
            read -p "   Do you want to delete and recreate it? (yes/no): " confirm
            if [ "$confirm" == "yes" ]; then
                echo "   🗑️  Deleting stuck GSI..."
                if aws dynamodb update-table \
                    --table-name $TABLE_NAME \
                    --region $REGION \
                    --global-secondary-index-updates "[{\"Delete\":{\"IndexName\":\"$index_name\"}}]" \
                    >/dev/null 2>&1; then
                    echo "   ✅ Deletion initiated, waiting for completion..."
                    # Wait for deletion
                    while true; do
                        local del_status=$(aws dynamodb describe-table \
                            --table-name $TABLE_NAME \
                            --region $REGION \
                            --query "Table.GlobalSecondaryIndexes[?IndexName=='$index_name'].IndexName" \
                            --output text 2>/dev/null)
                        if [ -z "$del_status" ] || [ "$del_status" == "None" ]; then
                            echo "   ✅ GSI deleted, proceeding with creation..."
                            break
                        fi
                        echo "   Waiting for deletion... (checking again in 10 seconds...)"
                        sleep 10
                    done
                    # Continue to creation below
                else
                    echo "   ❌ Failed to delete GSI. The GSI may not actually exist."
                    echo "   Proceeding to create it anyway..."
                    # Continue to creation below
                fi
            else
                echo "   ⏭️  Skipping this GSI. Run ./diagnose-gsi-issue.sh $TABLE_NAME $index_name for details"
                return 1
            fi
        else
            echo "⚠️  GSI '$index_name' exists with status: $existing_status"
            echo "   Waiting for it to become ACTIVE..."
            wait_for_gsi "$index_name"
            return 0
        fi
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
