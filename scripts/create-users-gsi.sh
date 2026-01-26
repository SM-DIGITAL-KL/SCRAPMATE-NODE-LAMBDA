#!/bin/bash

# Script to create Global Secondary Indexes (GSIs) for the users table
# This script requires AWS credentials with dynamodb:UpdateTable permission
# 
# Usage: ./create-users-gsi.sh
# 
# Note: GSIs can take time to build (minutes to hours depending on table size)
# Monitor progress: aws dynamodb describe-table --table-name users

set -e  # Exit on error

TABLE_NAME="users"
REGION="ap-south-1"

echo "🚀 Starting GSI creation for users table..."
echo ""

# Check if table exists
echo "📋 Checking if table exists..."
if ! aws dynamodb describe-table --table-name $TABLE_NAME --region $REGION > /dev/null 2>&1; then
    echo "❌ Error: Table '$TABLE_NAME' does not exist!"
    exit 1
fi
echo "✅ Table '$TABLE_NAME' exists"
echo ""

# Check existing GSIs
echo "📋 Checking existing GSIs..."
EXISTING_GSIS=$(aws dynamodb describe-table --table-name $TABLE_NAME --region $REGION --query 'Table.GlobalSecondaryIndexes[*].IndexName' --output text)
echo "Existing GSIs: ${EXISTING_GSIS:-none}"
echo ""

# Function to create GSI
create_gsi() {
    local index_name=$1
    local hash_key=$2
    local range_key=$3
    local read_capacity=${4:-10}
    local write_capacity=${5:-5}
    
    # Check if GSI already exists
    if echo "$EXISTING_GSIS" | grep -q "$index_name"; then
        echo "⏭️  GSI '$index_name' already exists, skipping..."
        return 0
    fi
    
    echo "🔨 Creating GSI: $index_name..."
    
    # Build the JSON for GSI creation
    local gsi_json=$(cat <<EOF
{
    "Create": {
        "IndexName": "$index_name",
        "KeySchema": [
            {"AttributeName": "$hash_key", "KeyType": "HASH"},
            {"AttributeName": "$range_key", "KeyType": "RANGE"}
        ],
        "Projection": {"ProjectionType": "ALL"},
        "ProvisionedThroughput": {
            "ReadCapacityUnits": $read_capacity,
            "WriteCapacityUnits": $write_capacity
        }
    }
}
EOF
)
    
    # Create the GSI
    if aws dynamodb update-table \
        --table-name $TABLE_NAME \
        --region $REGION \
        --global-secondary-index-updates "[$gsi_json]" \
        > /dev/null 2>&1; then
        echo "✅ GSI '$index_name' creation initiated successfully"
    else
        echo "❌ Failed to create GSI '$index_name'"
        return 1
    fi
    
    # Wait a bit before creating next GSI (DynamoDB needs time between operations)
    echo "⏳ Waiting 5 seconds before next operation..."
    sleep 5
    echo ""
}

# Create GSIs in priority order
echo "📊 Creating GSIs in priority order..."
echo ""

# 1. user_type-created_at-index (Highest priority)
create_gsi "user_type-created_at-index" "user_type" "created_at" 10 5

# 2. mob_num-index (High priority)
create_gsi "mob_num-index" "mob_num" "created_at" 10 5

# 3. user_type-app_type-index (Medium priority)
create_gsi "user_type-app_type-index" "user_type" "app_type" 10 5

# 4. email-index (Low priority)
create_gsi "email-index" "email" "id" 5 5

# 5. app_version-app_type-index (Optional)
create_gsi "app_version-app_type-index" "app_version" "app_type" 5 5

echo ""
echo "✅ GSI creation process completed!"
echo ""
echo "📊 Monitoring GSI status..."
echo "Run this command to check GSI status:"
echo "  aws dynamodb describe-table --table-name $TABLE_NAME --region $REGION --query 'Table.GlobalSecondaryIndexes[*].{IndexName:IndexName,Status:IndexStatus}' --output table"
echo ""
echo "⏳ Note: GSIs can take several minutes to hours to build depending on table size."
echo "   Monitor the IndexStatus - it will change from 'CREATING' to 'ACTIVE' when ready."
