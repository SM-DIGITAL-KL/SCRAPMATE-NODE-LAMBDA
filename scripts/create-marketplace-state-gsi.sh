#!/bin/bash
set -euo pipefail

# Creates state-based GSI for marketplace post tables:
# - bulk_sell_requests
# - bulk_scrap_requests
#
# Index:
#   state_key-status_created_at-index
# Keys:
#   HASH  state_key (S)
#   RANGE status_created_at (S)
#
# Usage:
#   ./scripts/create-marketplace-state-gsi.sh [region]
# Example:
#   ./scripts/create-marketplace-state-gsi.sh ap-south-1

REGION="${1:-ap-south-1}"
INDEX_NAME="state_key-status_created_at-index"

TABLES=(
  "bulk_sell_requests"
  "bulk_scrap_requests"
)

index_exists() {
  local table="$1"
  aws dynamodb describe-table \
    --table-name "$table" \
    --region "$REGION" \
    --query "Table.GlobalSecondaryIndexes[?IndexName=='${INDEX_NAME}'] | length(@)" \
    --output text 2>/dev/null
}

wait_table_active() {
  local table="$1"
  echo "⏳ Waiting for table $table to become ACTIVE..."
  aws dynamodb wait table-exists --table-name "$table" --region "$REGION"
}

for table in "${TABLES[@]}"; do
  echo ""
  echo "🔎 Processing table: $table"
  wait_table_active "$table"

  exists="$(index_exists "$table" || echo "0")"
  if [ "$exists" != "0" ]; then
    echo "✅ $INDEX_NAME already exists on $table. Skipping."
    continue
  fi

  echo "➕ Creating GSI $INDEX_NAME on $table ..."
  aws dynamodb update-table \
    --table-name "$table" \
    --region "$REGION" \
    --attribute-definitions \
      AttributeName=state_key,AttributeType=S \
      AttributeName=status_created_at,AttributeType=S \
    --global-secondary-index-updates \
      "[{\"Create\":{\"IndexName\":\"${INDEX_NAME}\",\"KeySchema\":[{\"AttributeName\":\"state_key\",\"KeyType\":\"HASH\"},{\"AttributeName\":\"status_created_at\",\"KeyType\":\"RANGE\"}],\"Projection\":{\"ProjectionType\":\"ALL\"}}}]"

  echo "⏳ Waiting for GSI to become ACTIVE on $table ..."
  while true; do
    status="$(aws dynamodb describe-table \
      --table-name "$table" \
      --region "$REGION" \
      --query "Table.GlobalSecondaryIndexes[?IndexName=='${INDEX_NAME}']|[0].IndexStatus" \
      --output text)"
    echo "   Current status: $status"
    if [ "$status" = "ACTIVE" ]; then
      break
    fi
    sleep 10
  done

  echo "✅ Created $INDEX_NAME on $table"
done

echo ""
echo "🎉 Marketplace state GSI setup complete."
