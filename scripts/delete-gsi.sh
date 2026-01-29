#!/bin/bash

# Script to delete a stuck or problematic GSI
# Usage: ./delete-gsi.sh [table-name] [index-name]

TABLE_NAME="${1:-orders}"
INDEX_NAME="${2:-status-created_at-index}"
REGION="ap-south-1"

echo "🗑️  Deleting GSI: $INDEX_NAME from table: $TABLE_NAME"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Function to check GSI status
get_gsi_status() {
    aws dynamodb describe-table \
        --table-name $TABLE_NAME \
        --region $REGION \
        --query "Table.GlobalSecondaryIndexes[?IndexName=='$INDEX_NAME'].IndexStatus" \
        --output text 2>/dev/null
}

# Check if table exists
if ! aws dynamodb describe-table --table-name $TABLE_NAME --region $REGION >/dev/null 2>&1; then
    echo "❌ Table '$TABLE_NAME' does not exist!"
    exit 1
fi

# Check if GSI exists
STATUS=$(get_gsi_status)

if [ -z "$STATUS" ]; then
    echo "ℹ️  GSI '$INDEX_NAME' does not exist (may have already been deleted)"
    exit 0
fi

echo "Current GSI status: $STATUS"
echo ""

# Confirm deletion
if [ "$STATUS" == "ACTIVE" ]; then
    echo "⚠️  WARNING: This GSI is ACTIVE. Deleting it will:"
    echo "   - Remove the index permanently"
    echo "   - Break any queries that depend on this index"
    echo "   - Require recreating the index if needed"
    echo ""
    read -p "Are you sure you want to delete this GSI? (yes/no): " confirm
    if [ "$confirm" != "yes" ]; then
        echo "❌ Deletion cancelled"
        exit 0
    fi
fi

# Delete the GSI
echo "🔨 Deleting GSI '$INDEX_NAME'..."
if aws dynamodb update-table \
    --table-name $TABLE_NAME \
    --region $REGION \
    --global-secondary-index-updates "[{\"Delete\":{\"IndexName\":\"$INDEX_NAME\"}}]" \
    >/dev/null 2>&1; then
    echo "✅ GSI deletion initiated successfully"
    echo ""
    echo "⏳ Waiting for deletion to complete..."
    
    # Wait for deletion to complete
    while true; do
        STATUS=$(get_gsi_status)
        
        if [ -z "$STATUS" ]; then
            echo "✅ GSI '$INDEX_NAME' has been deleted successfully"
            break
        elif [ "$STATUS" == "DELETING" ]; then
            echo "   Status: DELETING (checking again in 30 seconds...)"
            sleep 30
        else
            echo "   Current status: $STATUS (checking again in 30 seconds...)"
            sleep 30
        fi
    done
else
    echo "❌ Failed to delete GSI '$INDEX_NAME'"
    echo ""
    echo "Possible reasons:"
    echo "   - GSI is in CREATING state (wait for it to complete or fail)"
    echo "   - Insufficient permissions"
    echo "   - Table is being modified by another operation"
    echo ""
    echo "Check the status with:"
    echo "   aws dynamodb describe-table --table-name $TABLE_NAME --region $REGION"
    exit 1
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ GSI deletion completed!"
echo ""
echo "💡 Next steps:"
echo "   - If you want to recreate the GSI, run:"
echo "     ./create-orders-gsi-sequential.sh"
echo "   - Or use the create script for your specific table"
