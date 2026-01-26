# DynamoDB GSI Optimization for Users Table

## Current Issues
- Most queries use Scan operations which read entire table
- No Global Secondary Indexes (GSIs) for common query patterns
- Expensive and slow operations, especially for user_type queries

## Required GSIs

### 1. mob_num-index (Already exists or attempted)
**Purpose**: Query users by mobile number
- Partition Key: `mob_num` (Number)
- Sort Key: `created_at` (String) - for sorting by date
- Projection: ALL

**Use Cases**:
- `findByMobile()` - Get user by mobile number
- `findByMobileAndAppType()` - Get user by mobile and app type
- `findAllByMobile()` - Get all users with mobile number

### 2. user_type-created_at-index
**Purpose**: Query users by user_type (most common query pattern)
- Partition Key: `user_type` (String)
- Sort Key: `created_at` (String) - for sorting by date
- Projection: ALL

**Use Cases**:
- `countByUserType()` - Count users by type
- `getB2BUsers()`, `getB2CUsers()`, `getSRUsers()`, etc. - Get users by type with pagination
- `findWithFcmTokenByUserType()` - Get users with FCM token by type
- `getMonthlyCountByUserType()` - Monthly counts by type

### 3. user_type-app_version-app_type-index
**Purpose**: Query v2 users by user_type, app_version, and app_type
- Partition Key: `user_type` (String)
- Sort Key: `app_version` (String) - for filtering v2 users
- Projection: ALL
- **Note**: This is a composite GSI. FilterExpression will be used for app_type

**Alternative**: Use `user_type-app_type-index` with app_version in FilterExpression

**Use Cases**:
- `countByUserTypeV2()` - Count v2 users by type and app_type
- `countV2B2BUsers()`, `countV2B2CUsers()` - Count v2 users
- `countV2CustomerAppUsers()`, `countV2VendorAppUsers()` - Count by app_type

### 4. email-index
**Purpose**: Query users by email
- Partition Key: `email` (String)
- Sort Key: `id` (Number)
- Projection: ALL

**Use Cases**:
- `findByEmail()` - Get user by email
- `emailExists()` - Check if email exists

### 5. app_version-app_type-index (Optional, for v2-specific queries)
**Purpose**: Query all v2 users by app_type
- Partition Key: `app_version` (String)
- Sort Key: `app_type` (String)
- Projection: ALL

**Use Cases**:
- `countV2Users()` - Count all v2 users
- `countV2CustomerAppUsers()` - Count customer_app users
- `countV2VendorAppUsers()` - Count vendor_app users

## AWS CLI Commands to Create GSIs

```bash
# 1. mob_num-index (if not already exists)
aws dynamodb update-table \
  --table-name users \
  --global-secondary-index-updates \
    "[{
      \"Create\": {
        \"IndexName\": \"mob_num-index\",
        \"KeySchema\": [
          {\"AttributeName\": \"mob_num\", \"KeyType\": \"HASH\"},
          {\"AttributeName\": \"created_at\", \"KeyType\": \"RANGE\"}
        ],
        \"Projection\": {\"ProjectionType\": \"ALL\"},
        \"ProvisionedThroughput\": {
          \"ReadCapacityUnits\": 10,
          \"WriteCapacityUnits\": 5
        }
      }
    }]"

# 2. user_type-created_at-index
aws dynamodb update-table \
  --table-name users \
  --global-secondary-index-updates \
    "[{
      \"Create\": {
        \"IndexName\": \"user_type-created_at-index\",
        \"KeySchema\": [
          {\"AttributeName\": \"user_type\", \"KeyType\": \"HASH\"},
          {\"AttributeName\": \"created_at\", \"KeyType\": \"RANGE\"}
        ],
        \"Projection\": {\"ProjectionType\": \"ALL\"},
        \"ProvisionedThroughput\": {
          \"ReadCapacityUnits\": 10,
          \"WriteCapacityUnits\": 5
        }
      }
    }]"

# 3. user_type-app_type-index (for v2 queries with app_type filter)
aws dynamodb update-table \
  --table-name users \
  --global-secondary-index-updates \
    "[{
      \"Create\": {
        \"IndexName\": \"user_type-app_type-index\",
        \"KeySchema\": [
          {\"AttributeName\": \"user_type\", \"KeyType\": \"HASH\"},
          {\"AttributeName\": \"app_type\", \"KeyType\": \"RANGE\"}
        ],
        \"Projection\": {\"ProjectionType\": \"ALL\"},
        \"ProvisionedThroughput\": {
          \"ReadCapacityUnits\": 10,
          \"WriteCapacityUnits\": 5
        }
      }
    }]"

# 4. email-index
aws dynamodb update-table \
  --table-name users \
  --global-secondary-index-updates \
    "[{
      \"Create\": {
        \"IndexName\": \"email-index\",
        \"KeySchema\": [
          {\"AttributeName\": \"email\", \"KeyType\": \"HASH\"},
          {\"AttributeName\": \"id\", \"KeyType\": \"RANGE\"}
        ],
        \"Projection\": {\"ProjectionType\": \"ALL\"},
        \"ProvisionedThroughput\": {
          \"ReadCapacityUnits\": 5,
          \"WriteCapacityUnits\": 5
        }
      }
    }]"

# 5. app_version-app_type-index (Optional, for v2-specific queries)
aws dynamodb update-table \
  --table-name users \
  --global-secondary-index-updates \
    "[{
      \"Create\": {
        \"IndexName\": \"app_version-app_type-index\",
        \"KeySchema\": [
          {\"AttributeName\": \"app_version\", \"KeyType\": \"HASH\"},
          {\"AttributeName\": \"app_type\", \"KeyType\": \"RANGE\"}
        ],
        \"Projection\": {\"ProjectionType\": \"ALL\"},
        \"ProvisionedThroughput\": {
          \"ReadCapacityUnits\": 5,
          \"WriteCapacityUnits\": 5
        }
      }
    }]"
```

## Notes
- GSIs can take time to build (minutes to hours depending on table size)
- Monitor GSI status: `aws dynamodb describe-table --table-name users`
- Consider using on-demand billing for production
- After GSIs are created, update code to use Query instead of Scan
- `mob_num-index` may already exist (check first before creating)

## Priority Order
1. **user_type-created_at-index** - Highest priority (most common query pattern)
2. **mob_num-index** - High priority (authentication queries)
3. **user_type-app_type-index** - Medium priority (v2-specific queries)
4. **email-index** - Low priority (less frequent)
5. **app_version-app_type-index** - Optional (can use FilterExpression on other GSIs)
