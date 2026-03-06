#!/usr/bin/env bash
set -e

# Create zone-index GSI on addresses table (zone as HASH key).
#
# Usage:
#   ./scripts/create-address-zone-gsi.sh [region]
# Example:
#   ./scripts/create-address-zone-gsi.sh ap-south-1

REGION="${1:-${AWS_REGION:-ap-south-1}}"
TABLE="addresses"
INDEX="zone-index"

echo "Table: $TABLE"
echo "Index: $INDEX"
echo "Region: $REGION"

EXISTS=$(aws dynamodb describe-table \
  --table-name "$TABLE" \
  --region "$REGION" \
  --query "Table.GlobalSecondaryIndexes[?IndexName=='$INDEX'] | length(@)" \
  --output text 2>/dev/null || echo "0")

if [[ "$EXISTS" != "0" ]]; then
  echo "✅ $INDEX already exists. Current status:"
  aws dynamodb describe-table \
    --table-name "$TABLE" \
    --region "$REGION" \
    --query "Table.GlobalSecondaryIndexes[?IndexName=='$INDEX'].[IndexName,IndexStatus,Backfilling]" \
    --output table
  exit 0
fi

echo "Creating $INDEX ..."
aws dynamodb update-table \
  --table-name "$TABLE" \
  --region "$REGION" \
  --attribute-definitions AttributeName=zone,AttributeType=S \
  --global-secondary-index-updates "[
    {
      \"Create\": {
        \"IndexName\": \"$INDEX\",
        \"KeySchema\": [
          {\"AttributeName\":\"zone\",\"KeyType\":\"HASH\"}
        ],
        \"Projection\": {\"ProjectionType\":\"ALL\"}
      }
    }
  ]"

echo "✅ Create request sent. Status:"
aws dynamodb describe-table \
  --table-name "$TABLE" \
  --region "$REGION" \
  --query "Table.GlobalSecondaryIndexes[?IndexName=='$INDEX'].[IndexName,IndexStatus,Backfilling]" \
  --output table

