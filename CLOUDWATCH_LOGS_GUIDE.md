# CloudWatch Logs Guide for Location Tracking

## How to Check CloudWatch Logs for Location Tracking Errors

### 1. Access CloudWatch Logs

#### Via AWS Console:
1. Go to AWS CloudWatch Console
2. Navigate to **Logs** → **Log groups**
3. Find the log group for your Lambda function:
   - Look for: `/aws/lambda/{function-name}` or `/aws/lambda/location-service`
   - Or check your `serverless-microservices.yml` for the exact function name

#### Via AWS CLI:
```bash
# List log groups
aws logs describe-log-groups --log-group-name-prefix "/aws/lambda/location"

# Get recent log streams
aws logs describe-log-streams \
  --log-group-name "/aws/lambda/location-service" \
  --order-by LastEventTime \
  --descending \
  --max-items 5

# Get recent log events (last 1 hour)
aws logs filter-log-events \
  --log-group-name "/aws/lambda/location-service" \
  --start-time $(($(date +%s) - 3600))000 \
  --filter-pattern "ERROR"
```

### 2. Key Log Patterns to Search For

#### Location Update Errors:
```
Filter: "❌ [LocationController]"
```

#### Location History Save Errors:
```
Filter: "❌ [OrderLocationHistory]"
```

#### Missing Required Fields:
```
Filter: "Missing required fields"
```

#### DynamoDB Errors:
```
Filter: "Error saving order location history"
```

### 3. Common Error Scenarios

#### Error: "Missing required fields"
- **Check**: Request body in logs
- **Look for**: `📍 Request body:` in logs
- **Common causes**:
  - Frontend not sending all required fields
  - Data type mismatches (string vs number)
  - Null/undefined values

#### Error: "Error saving order location history"
- **Check**: DynamoDB table exists and has correct permissions
- **Look for**: Table name `order_location_history`
- **Common causes**:
  - Table doesn't exist
  - Missing GSI: `order_id-timestamp-index`
  - IAM permissions issue

#### Error: "User not found"
- **Check**: User ID is valid
- **Look for**: User lookup in logs

### 4. Log Messages Added

The following log messages have been added to help debug:

#### LocationController:
- `📍 [LocationController] updateLocation called` - Entry point
- `📍 Request body:` - Full request payload
- `❌ [LocationController] Validation failed:` - Validation errors
- `💾 [LocationController] Checking location history` - History check start
- `💾 [LocationController] Last location:` - Last saved location details
- `💾 [LocationController] Saving location history` - Saving attempt
- `💾 [LocationController] Location history saved` - Success
- `❌ [LocationController] Error saving location history:` - Error details

#### OrderLocationHistory:
- `💾 [OrderLocationHistory] Saving location:` - Save attempt with data
- `💾 [OrderLocationHistory] Item to save:` - Final item structure
- `💾 [OrderLocationHistory] Successfully saved` - Success
- `❌ [OrderLocationHistory] Error saving:` - Error with stack trace

### 5. Quick Debug Commands

```bash
# Get all location-related errors from last hour
aws logs filter-log-events \
  --log-group-name "/aws/lambda/location-service" \
  --start-time $(($(date +%s) - 3600))000 \
  --filter-pattern "❌"

# Get location update requests
aws logs filter-log-events \
  --log-group-name "/aws/lambda/location-service" \
  --start-time $(($(date +%s) - 3600))000 \
  --filter-pattern "📍 [LocationController] updateLocation called"

# Get DynamoDB save attempts
aws logs filter-log-events \
  --log-group-name "/aws/lambda/location-service" \
  --start-time $(($(date +%s) - 3600))000 \
  --filter-pattern "💾 [OrderLocationHistory]"
```

### 6. Common Issues and Solutions

#### Issue: Table doesn't exist
**Solution**: Create the DynamoDB table:
```bash
aws dynamodb create-table \
  --table-name order_location_history \
  --attribute-definitions \
    AttributeName=id,AttributeType=S \
    AttributeName=order_id,AttributeType=N \
    AttributeName=timestamp,AttributeType=N \
  --key-schema \
    AttributeName=id,KeyType=HASH \
  --global-secondary-indexes \
    IndexName=order_id-timestamp-index,KeySchema=[{AttributeName=order_id,KeyType=HASH},{AttributeName=timestamp,KeyType=RANGE}],Projection={ProjectionType=ALL},ProvisionedThroughput={ReadCapacityUnits=5,WriteCapacityUnits=5} \
  --billing-mode PROVISIONED \
  --provisioned-throughput ReadCapacityUnits=5,WriteCapacityUnits=5
```

#### Issue: Missing GSI
**Solution**: Add the GSI to existing table (if table exists but GSI is missing)

#### Issue: IAM Permissions
**Solution**: Ensure Lambda execution role has:
- `dynamodb:PutItem` on `order_location_history`
- `dynamodb:Query` on `order_location_history` and GSI
- `dynamodb:Scan` on `order_location_history` (fallback)

### 7. Monitoring Dashboard

Create a CloudWatch Dashboard with:
- Error rate (count of "❌" logs)
- Location update success rate
- DynamoDB save success rate
- Average response time


