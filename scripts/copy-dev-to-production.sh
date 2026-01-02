#!/bin/bash

# Copy Data from Dev to Production
# This script copies DynamoDB tables and S3 bucket data from dev to production
# Usage: ./scripts/copy-dev-to-production.sh [region]
# WARNING: This will overwrite production data!

REGION=${1:-ap-south-1}

echo "⚠️  WARNING: This script will copy data from DEV to PRODUCTION"
echo "   This will OVERWRITE existing production data!"
echo ""
read -p "Are you sure you want to continue? (yes/no): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
    echo "❌ Operation cancelled"
    exit 0
fi

echo ""
echo "📋 Copying Data from Dev to Production"
echo "   Region: $REGION"
echo ""

# Load AWS credentials
if [ -f "aws.txt" ]; then
    export $(grep -E '^export ' aws.txt | sed 's/export //' | xargs)
fi

export AWS_REGION=${AWS_REGION:-$REGION}

# List of DynamoDB tables to copy
TABLES=(
    "users"
    "shops"
    "customer"
    "delivery_boy"
    "orders"
    "products"
    "product_category"
    "call_logs"
    "packages"
    "invoice"
    "bulk_scrap_requests"
    "subcategory"
    "order_location_history"
    "category_img_keywords"
    "addresses"
    "user_admins"
    "subscription_packages"
    "shop_images"
    "per_pages"
    "order_rating"
    "notifications"
)

# Function to copy a DynamoDB table
copy_table() {
    local TABLE_NAME=$1
    
    echo "📋 Copying table: $TABLE_NAME"
    
    # Check if source table exists
    SOURCE_EXISTS=$(aws dynamodb describe-table --table-name "$TABLE_NAME" --region "$REGION" 2>/dev/null)
    if [ $? -ne 0 ]; then
        echo "   ⚠️  Source table '$TABLE_NAME' does not exist, skipping..."
        return 0
    fi
    
    # Check if destination table exists
    DEST_EXISTS=$(aws dynamodb describe-table --table-name "$TABLE_NAME" --region "$REGION" 2>/dev/null)
    if [ $? -ne 0 ]; then
        echo "   ⚠️  Destination table '$TABLE_NAME' does not exist, skipping..."
        return 0
    fi
    
    # Export data from source table
    echo "   📤 Exporting data from '$TABLE_NAME'..."
    aws dynamodb scan --table-name "$TABLE_NAME" --region "$REGION" > /tmp/${TABLE_NAME}-export.json 2>/dev/null
    
    if [ $? -ne 0 ]; then
        echo "   ❌ Failed to export data from '$TABLE_NAME'"
        return 1
    fi
    
    # Count items
    ITEM_COUNT=$(cat /tmp/${TABLE_NAME}-export.json | python3 -c "import sys, json; data = json.load(sys.stdin); print(len(data.get('Items', [])))" 2>/dev/null || echo "0")
    
    if [ "$ITEM_COUNT" = "0" ]; then
        echo "   ℹ️  No items to copy in '$TABLE_NAME'"
        rm -f /tmp/${TABLE_NAME}-export.json
        return 0
    fi
    
    echo "   📦 Found $ITEM_COUNT items"
    
    # Import data to destination table (batch write)
    echo "   📥 Importing data to '$TABLE_NAME'..."
    
    # Use AWS Data Pipeline or write items in batches
    # For simplicity, we'll use a Python script to handle batch writes
    python3 <<EOF
import json
import boto3
import sys
from botocore.exceptions import ClientError

dynamodb = boto3.client('dynamodb', region_name='${REGION}')
table_name = '${TABLE_NAME}'

try:
    with open('/tmp/${TABLE_NAME}-export.json', 'r') as f:
        data = json.load(f)
    
    items = data.get('Items', [])
    if not items:
        print("   ℹ️  No items to import")
        sys.exit(0)
    
    # Write items in batches of 25 (DynamoDB limit)
    batch_size = 25
    total_items = len(items)
    imported = 0
    
    for i in range(0, total_items, batch_size):
        batch = items[i:i+batch_size]
        write_requests = [{'PutRequest': {'Item': item}} for item in batch]
        
        try:
            dynamodb.batch_write_item(
                RequestItems={table_name: write_requests}
            )
            imported += len(batch)
            print(f"   ✅ Imported {imported}/{total_items} items...", end='\r')
        except ClientError as e:
            print(f"\n   ❌ Error importing batch: {e}")
            sys.exit(1)
    
    print(f"\n   ✅ Successfully imported {imported} items")
except Exception as e:
    print(f"   ❌ Error: {e}")
    sys.exit(1)
EOF
    
    if [ $? -eq 0 ]; then
        echo "   ✅ Table '$TABLE_NAME' copied successfully"
        rm -f /tmp/${TABLE_NAME}-export.json
        return 0
    else
        echo "   ❌ Failed to copy table '$TABLE_NAME'"
        rm -f /tmp/${TABLE_NAME}-export.json
        return 1
    fi
}

# Copy S3 bucket
copy_s3_bucket() {
    local SOURCE_BUCKET="scrapmate-images"
    local DEST_BUCKET="scrapmate-images-production"
    
    echo ""
    echo "🪣 Copying S3 Bucket"
    echo "   Source: s3://$SOURCE_BUCKET"
    echo "   Destination: s3://$DEST_BUCKET"
    echo ""
    
    # Check if source bucket exists
    SOURCE_EXISTS=$(aws s3api head-bucket --bucket "$SOURCE_BUCKET" --region "$REGION" 2>/dev/null)
    if [ $? -ne 0 ]; then
        echo "   ⚠️  Source bucket '$SOURCE_BUCKET' does not exist, skipping..."
        return 0
    fi
    
    # Check if destination bucket exists
    DEST_EXISTS=$(aws s3api head-bucket --bucket "$DEST_BUCKET" --region "$REGION" 2>/dev/null)
    if [ $? -ne 0 ]; then
        echo "   ⚠️  Destination bucket '$DEST_BUCKET' does not exist, creating..."
        ./scripts/create-production-s3-bucket.sh "$REGION"
    fi
    
    echo "   📤 Syncing S3 buckets..."
    aws s3 sync "s3://$SOURCE_BUCKET" "s3://$DEST_BUCKET" --region "$REGION" --delete
    
    if [ $? -eq 0 ]; then
        echo "   ✅ S3 bucket synced successfully"
        return 0
    else
        echo "   ❌ Failed to sync S3 bucket"
        return 1
    fi
}

# Copy all tables
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🗄️  Copying DynamoDB Tables"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

SUCCESS_COUNT=0
FAILED_COUNT=0
FAILED_TABLES=()

for TABLE_NAME in "${TABLES[@]}"; do
    if copy_table "$TABLE_NAME"; then
        SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
    else
        FAILED_COUNT=$((FAILED_COUNT + 1))
        FAILED_TABLES+=("$TABLE_NAME")
    fi
    echo ""
done

# Copy S3 bucket
copy_s3_bucket

# Summary
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 Data Copy Summary"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "   ✅ Successful tables: $SUCCESS_COUNT"
echo "   ❌ Failed tables: $FAILED_COUNT"

if [ ${#FAILED_TABLES[@]} -gt 0 ]; then
    echo ""
    echo "   Failed tables:"
    for table in "${FAILED_TABLES[@]}"; do
        echo "     - $table"
    done
fi

echo ""
echo "✅ Data copy operation complete!"
echo ""

