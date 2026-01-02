#!/bin/bash

# Create Production DynamoDB Tables
# This script creates all DynamoDB tables needed for production
# Usage: ./scripts/create-production-tables.sh [region]

REGION=${1:-ap-south-1}

echo "🗄️  Creating Production DynamoDB Tables"
echo "   Region: $REGION"
echo ""

# Load AWS credentials
if [ -f "aws.txt" ]; then
    export $(grep -E '^export ' aws.txt | sed 's/export //' | xargs)
fi

export AWS_REGION=${AWS_REGION:-$REGION}

# List of tables to create
# Format: table_name:key_attribute:key_type:billing_mode
# key_type: N (Number) or S (String)
TABLES=(
    "users:id:N:PAY_PER_REQUEST"
    "shops:id:N:PAY_PER_REQUEST"
    "customer:id:N:PAY_PER_REQUEST"
    "delivery_boy:id:N:PAY_PER_REQUEST"
    "orders:id:N:PAY_PER_REQUEST"
    "products:id:N:PAY_PER_REQUEST"
    "product_category:id:N:PAY_PER_REQUEST"
    "call_logs:id:N:PAY_PER_REQUEST"
    "packages:id:N:PAY_PER_REQUEST"
    "invoice:id:N:PAY_PER_REQUEST"
    "bulk_scrap_requests:id:N:PAY_PER_REQUEST"
    "subcategory:id:N:PAY_PER_REQUEST"
    "order_location_history:id:S:PAY_PER_REQUEST"
    "category_img_keywords:id:N:PAY_PER_REQUEST"
    "addresses:id:N:PAY_PER_REQUEST"
    "user_admins:id:N:PAY_PER_REQUEST"
    "subscription_packages:id:N:PAY_PER_REQUEST"
    "shop_images:id:N:PAY_PER_REQUEST"
    "per_pages:id:N:PAY_PER_REQUEST"
    "order_rating:id:N:PAY_PER_REQUEST"
    "notifications:id:N:PAY_PER_REQUEST"
)

# Function to create a table
create_table() {
    local TABLE_NAME=$1
    local KEY_ATTR=$2
    local KEY_TYPE=$3
    local BILLING_MODE=$4
    
    echo "📋 Checking table: $TABLE_NAME"
    
    # Check if table exists
    TABLE_EXISTS=$(aws dynamodb describe-table --table-name "$TABLE_NAME" --region "$REGION" 2>/dev/null)
    
    if [ $? -eq 0 ]; then
        echo "   ✅ Table '$TABLE_NAME' already exists"
        return 0
    fi
    
    # Create table
    echo "   📝 Creating table '$TABLE_NAME'..."
    
    # Build create-table command
    if [ "$KEY_TYPE" = "N" ]; then
        ATTR_TYPE="N"
    else
        ATTR_TYPE="S"
    fi
    
    # Special handling for order_location_history (has GSI)
    if [ "$TABLE_NAME" = "order_location_history" ]; then
        # Create GSI JSON file
        cat > /tmp/gsi-${TABLE_NAME}.json <<EOF
[
    {
        "IndexName": "order_id-timestamp-index",
        "KeySchema": [
            {
                "AttributeName": "order_id",
                "KeyType": "HASH"
            },
            {
                "AttributeName": "timestamp",
                "KeyType": "RANGE"
            }
        ],
        "Projection": {
            "ProjectionType": "ALL"
        }
    }
]
EOF
        aws dynamodb create-table \
            --table-name "$TABLE_NAME" \
            --attribute-definitions \
                AttributeName=id,AttributeType=S \
                AttributeName=order_id,AttributeType=N \
                AttributeName=timestamp,AttributeType=N \
            --key-schema \
                AttributeName=id,KeyType=HASH \
            --global-secondary-indexes file:///tmp/gsi-${TABLE_NAME}.json \
            --billing-mode "$BILLING_MODE" \
            --region "$REGION" \
            > /tmp/dynamodb-create-${TABLE_NAME}.json 2>&1
        rm -f /tmp/gsi-${TABLE_NAME}.json
    else
        aws dynamodb create-table \
            --table-name "$TABLE_NAME" \
            --attribute-definitions \
                AttributeName="$KEY_ATTR",AttributeType="$ATTR_TYPE" \
            --key-schema \
                AttributeName="$KEY_ATTR",KeyType=HASH \
            --billing-mode "$BILLING_MODE" \
            --region "$REGION" \
            > /tmp/dynamodb-create-${TABLE_NAME}.json 2>&1
    fi
    
    if [ $? -eq 0 ]; then
        echo "   ✅ Table '$TABLE_NAME' created successfully"
        # Wait for table to be active
        echo "   ⏳ Waiting for table to be active..."
        aws dynamodb wait table-exists --table-name "$TABLE_NAME" --region "$REGION" 2>/dev/null || sleep 5
        return 0
    else
        ERROR_MSG=$(cat /tmp/dynamodb-create-${TABLE_NAME}.json 2>/dev/null)
        if echo "$ERROR_MSG" | grep -q "ResourceInUseException"; then
            echo "   ✅ Table '$TABLE_NAME' already exists (created by another process)"
            return 0
        else
            echo "   ❌ Failed to create table '$TABLE_NAME'"
            echo "   Error: $ERROR_MSG"
            return 1
        fi
    fi
}

# Create all tables
SUCCESS_COUNT=0
FAILED_COUNT=0
FAILED_TABLES=()

for TABLE_ENTRY in "${TABLES[@]}"; do
    IFS=':' read -r TABLE_NAME KEY_ATTR KEY_TYPE BILLING_MODE <<< "$TABLE_ENTRY"
    
    if create_table "$TABLE_NAME" "$KEY_ATTR" "$KEY_TYPE" "$BILLING_MODE"; then
        SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
    else
        FAILED_COUNT=$((FAILED_COUNT + 1))
        FAILED_TABLES+=("$TABLE_NAME")
    fi
    echo ""
done

# Summary
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 DynamoDB Tables Creation Summary"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "   ✅ Successful: $SUCCESS_COUNT"
echo "   ❌ Failed: $FAILED_COUNT"

if [ ${#FAILED_TABLES[@]} -gt 0 ]; then
    echo ""
    echo "   Failed tables:"
    for table in "${FAILED_TABLES[@]}"; do
        echo "     - $table"
    done
    echo ""
    echo "   You can retry creating failed tables manually:"
    echo "   aws dynamodb create-table --table-name <table-name> ..."
    exit 1
fi

echo ""
echo "✅ All DynamoDB tables created/verified successfully!"
echo ""

# Cleanup
rm -f /tmp/dynamodb-create-*.json

