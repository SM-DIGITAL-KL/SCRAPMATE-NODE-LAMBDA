# DynamoDB GSI Optimization for Orders Table

## Current Issues
- All queries use Scan operations which read entire table
- No Global Secondary Indexes (GSIs) for common query patterns
- Expensive and slow operations

## Required GSIs

### 1. customer_id-status-index
**Purpose**: Query orders by customer_id and filter by status
- Partition Key: `customer_id` (Number)
- Sort Key: `created_at` (String) - for sorting by date
- Projection: ALL

**Use Cases**:
- `findByCustomerId()` - Get all orders for a customer
- `findPendingByCustomerId()` - Get pending orders for a customer

### 2. shop_id-status-index
**Purpose**: Query orders by shop_id and filter by status
- Partition Key: `shop_id` (Number)
- Sort Key: `created_at` (String) - for sorting by date
- Projection: ALL

**Use Cases**:
- `findByShopId()` - Get all orders for a shop
- Get orders by shop with status filter

### 3. status-created_at-index
**Purpose**: Query orders by status (for available pickup requests)
- Partition Key: `status` (Number)
- Sort Key: `created_at` (String) - for sorting by date
- Projection: ALL

**Use Cases**:
- `getAvailablePickupRequests()` - Get orders with status=1
- Get orders by status

### 4. delv_boy_id-status-index
**Purpose**: Query orders by delivery boy ID
- Partition Key: `delv_boy_id` (Number)
- Sort Key: `created_at` (String)
- Projection: ALL

**Use Cases**:
- `findByDeliveryBoyId()` - Get orders for delivery boy

### 5. order_no-index
**Purpose**: Query orders by order_no (alternative to order_number)
- Partition Key: `order_no` (String)
- Sort Key: `id` (Number)
- Projection: ALL

**Use Cases**:
- `findByOrderNo()` - Find order by order number

## AWS CLI Commands to Create GSIs

```bash
# 1. customer_id-status-index
aws dynamodb update-table \
  --table-name orders \
  --global-secondary-index-updates \
    "[{
      \"Create\": {
        \"IndexName\": \"customer_id-status-index\",
        \"KeySchema\": [
          {\"AttributeName\": \"customer_id\", \"KeyType\": \"HASH\"},
          {\"AttributeName\": \"created_at\", \"KeyType\": \"RANGE\"}
        ],
        \"Projection\": {\"ProjectionType\": \"ALL\"},
        \"ProvisionedThroughput\": {
          \"ReadCapacityUnits\": 5,
          \"WriteCapacityUnits\": 5
        }
      }
    }]"

# 2. shop_id-status-index
aws dynamodb update-table \
  --table-name orders \
  --global-secondary-index-updates \
    "[{
      \"Create\": {
        \"IndexName\": \"shop_id-status-index\",
        \"KeySchema\": [
          {\"AttributeName\": \"shop_id\", \"KeyType\": \"HASH\"},
          {\"AttributeName\": \"created_at\", \"KeyType\": \"RANGE\"}
        ],
        \"Projection\": {\"ProjectionType\": \"ALL\"},
        \"ProvisionedThroughput\": {
          \"ReadCapacityUnits\": 5,
          \"WriteCapacityUnits\": 5
        }
      }
    }]"

# 3. status-created_at-index
aws dynamodb update-table \
  --table-name orders \
  --global-secondary-index-updates \
    "[{
      \"Create\": {
        \"IndexName\": \"status-created_at-index\",
        \"KeySchema\": [
          {\"AttributeName\": \"status\", \"KeyType\": \"HASH\"},
          {\"AttributeName\": \"created_at\", \"KeyType\": \"RANGE\"}
        ],
        \"Projection\": {\"ProjectionType\": \"ALL\"},
        \"ProvisionedThroughput\": {
          \"ReadCapacityUnits\": 10,
          \"WriteCapacityUnits\": 5
        }
      }
    }]"

# 4. delv_boy_id-status-index
aws dynamodb update-table \
  --table-name orders \
  --global-secondary-index-updates \
    "[{
      \"Create\": {
        \"IndexName\": \"delv_boy_id-status-index\",
        \"KeySchema\": [
          {\"AttributeName\": \"delv_boy_id\", \"KeyType\": \"HASH\"},
          {\"AttributeName\": \"created_at\", \"KeyType\": \"RANGE\"}
        ],
        \"Projection\": {\"ProjectionType\": \"ALL\"},
        \"ProvisionedThroughput\": {
          \"ReadCapacityUnits\": 5,
          \"WriteCapacityUnits\": 5
        }
      }
    }]"

# 5. order_no-index
aws dynamodb update-table \
  --table-name orders \
  --global-secondary-index-updates \
    "[{
      \"Create\": {
        \"IndexName\": \"order_no-index\",
        \"KeySchema\": [
          {\"AttributeName\": \"order_no\", \"KeyType\": \"HASH\"},
          {\"AttributeName\": \"id\", \"KeyType\": \"RANGE\"}
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
- Monitor GSI status: `aws dynamodb describe-table --table-name orders`
- Consider using on-demand billing for production
- After GSIs are created, update code to use Query instead of Scan
