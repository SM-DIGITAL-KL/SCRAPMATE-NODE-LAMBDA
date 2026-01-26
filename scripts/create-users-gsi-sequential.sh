#!/bin/bash

# Script to create Global Secondary Indexes (GSIs) for the users table
# IMPORTANT: Only one GSI can be created at a time. This script creates them sequentially.
# 
# Usage: ./create-users-gsi-sequential.sh
# 
# Note: GSIs can take time to build (minutes to hours depending on table size)
# Monitor progress: aws dynamodb describe-table --table-name users

set -e  # Exit on error

TABLE_NAME="users"
REGION="ap-south-1"

echo "🚀 Starting sequential GSI creation for users table..."
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
    
    # Create the GSI
    if aws dynamodb update-table \
        --table-name $TABLE_NAME \
        --region $REGION \
        --attribute-definitions \
            AttributeName=$hash_key,AttributeType=$hash_type \
            AttributeName=$range_key,AttributeType=$range_type \
        --global-secondary-index-updates "[{\"Create\":{\"IndexName\":\"$index_name\",\"KeySchema\":[{\"AttributeName\":\"$hash_key\",\"KeyType\":\"HASH\"},{\"AttributeName\":\"$range_key\",\"KeyType\":\"RANGE\"}],\"Projection\":{\"ProjectionType\":\"ALL\"}}}]" \
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

# 1. user_type-created_at-index (Highest priority)
create_gsi "user_type-created_at-index" "user_type" "S" "created_at" "S"

# 2. mob_num-index (High priority)
create_gsi "mob_num-index" "mob_num" "N" "created_at" "S"

# 3. user_type-app_type-index (Medium priority)
create_gsi "user_type-app_type-index" "user_type" "S" "app_type" "S"

# 4. email-index (Low priority)
create_gsi "email-index" "email" "S" "id" "N"

# 5. app_version-app_type-index (Optional)
create_gsi "app_version-app_type-index" "app_version" "S" "app_type" "S"

echo ""
echo "✅ All GSIs created successfully!"
echo ""
echo "📊 Final GSI status:"
aws dynamodb describe-table \
    --table-name $TABLE_NAME \
    --region $REGION \
    --query 'Table.GlobalSecondaryIndexes[*].{IndexName:IndexName,Status:IndexStatus}' \
    --output table
