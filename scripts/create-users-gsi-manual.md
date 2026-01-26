# Manual Commands to Create Users Table GSIs

## Important Notes
- **Only one GSI can be created at a time** - Wait for each to become ACTIVE before creating the next
- **Table uses PAY_PER_REQUEST** - No ProvisionedThroughput needed
- **GSI Creation Time**: Can take minutes to hours depending on table size (4,338 items currently)

## Check Current Status

```bash
aws dynamodb describe-table \
  --table-name users \
  --region ap-south-1 \
  --query 'Table.GlobalSecondaryIndexes[*].{IndexName:IndexName,Status:IndexStatus}' \
  --output table
```

## Commands (Run One at a Time, Wait for Each to Complete)

### 1. user_type-created_at-index ✅ (Already Creating)

**Status**: Check if this is ACTIVE before proceeding:

```bash
aws dynamodb describe-table \
  --table-name users \
  --region ap-south-1 \
  --query "Table.GlobalSecondaryIndexes[?IndexName=='user_type-created_at-index'].IndexStatus" \
  --output text
```

**Command** (already executed):
```bash
aws dynamodb update-table \
  --table-name users \
  --region ap-south-1 \
  --attribute-definitions \
    AttributeName=user_type,AttributeType=S \
    AttributeName=created_at,AttributeType=S \
  --global-secondary-index-updates '[{
    "Create": {
      "IndexName": "user_type-created_at-index",
      "KeySchema": [
        {"AttributeName": "user_type", "KeyType": "HASH"},
        {"AttributeName": "created_at", "KeyType": "RANGE"}
      ],
      "Projection": {"ProjectionType": "ALL"}
    }
  }]'
```

### 2. mob_num-index

**Wait for GSI #1 to be ACTIVE, then run:**

```bash
aws dynamodb update-table \
  --table-name users \
  --region ap-south-1 \
  --attribute-definitions \
    AttributeName=mob_num,AttributeType=N \
    AttributeName=created_at,AttributeType=S \
  --global-secondary-index-updates '[{
    "Create": {
      "IndexName": "mob_num-index",
      "KeySchema": [
        {"AttributeName": "mob_num", "KeyType": "HASH"},
        {"AttributeName": "created_at", "KeyType": "RANGE"}
      ],
      "Projection": {"ProjectionType": "ALL"}
    }
  }]'
```

### 3. user_type-app_type-index

**Wait for GSI #2 to be ACTIVE, then run:**

```bash
aws dynamodb update-table \
  --table-name users \
  --region ap-south-1 \
  --attribute-definitions \
    AttributeName=user_type,AttributeType=S \
    AttributeName=app_type,AttributeType=S \
  --global-secondary-index-updates '[{
    "Create": {
      "IndexName": "user_type-app_type-index",
      "KeySchema": [
        {"AttributeName": "user_type", "KeyType": "HASH"},
        {"AttributeName": "app_type", "KeyType": "RANGE"}
      ],
      "Projection": {"ProjectionType": "ALL"}
    }
  }]'
```

### 4. email-index

**Wait for GSI #3 to be ACTIVE, then run:**

```bash
aws dynamodb update-table \
  --table-name users \
  --region ap-south-1 \
  --attribute-definitions \
    AttributeName=email,AttributeType=S \
    AttributeName=id,AttributeType=N \
  --global-secondary-index-updates '[{
    "Create": {
      "IndexName": "email-index",
      "KeySchema": [
        {"AttributeName": "email", "KeyType": "HASH"},
        {"AttributeName": "id", "KeyType": "RANGE"}
      ],
      "Projection": {"ProjectionType": "ALL"}
    }
  }]'
```

### 5. app_version-app_type-index (Optional)

**Wait for GSI #4 to be ACTIVE, then run:**

```bash
aws dynamodb update-table \
  --table-name users \
  --region ap-south-1 \
  --attribute-definitions \
    AttributeName=app_version,AttributeType=S \
    AttributeName=app_type,AttributeType=S \
  --global-secondary-index-updates '[{
    "Create": {
      "IndexName": "app_version-app_type-index",
      "KeySchema": [
        {"AttributeName": "app_version", "KeyType": "HASH"},
        {"AttributeName": "app_type", "KeyType": "RANGE"}
      ],
      "Projection": {"ProjectionType": "ALL"}
    }
  }]'
```

## Monitor Progress

Check status of all GSIs:
```bash
aws dynamodb describe-table \
  --table-name users \
  --region ap-south-1 \
  --query 'Table.GlobalSecondaryIndexes[*].{IndexName:IndexName,Status:IndexStatus}' \
  --output table
```

Check status of specific GSI:
```bash
aws dynamodb describe-table \
  --table-name users \
  --region ap-south-1 \
  --query "Table.GlobalSecondaryIndexes[?IndexName=='user_type-created_at-index']" \
  --output json
```

## Quick Status Check Script

Run this to see all GSI statuses at once:

```bash
watch -n 30 'aws dynamodb describe-table --table-name users --region ap-south-1 --query "Table.GlobalSecondaryIndexes[*].{IndexName:IndexName,Status:IndexStatus}" --output table'
```

## Expected Timeline

- **Small tables (< 1,000 items)**: 1-5 minutes per GSI
- **Medium tables (1,000-10,000 items)**: 5-30 minutes per GSI
- **Large tables (> 10,000 items)**: 30 minutes - 2 hours per GSI

**Current table size**: 4,338 items - Expect ~10-20 minutes per GSI
