# Category API Debugging Guide

## Potential Issues to Check in CloudWatch

### 1. DynamoDB Connection Issues
**Check CloudWatch Logs for:**
- `Error: Unable to connect to DynamoDB`
- `Error: Credentials not found`
- `Error: Table 'category_img_keywords' not found`
- Timeout errors when scanning DynamoDB table

**Location:** Look for logs from `CategoryImgKeywords.getAll()` method

### 2. Shop Data Fetching Issues
**Check CloudWatch Logs for:**
- Errors in `_getAllShops()` method
- Database connection errors when fetching shops
- Missing Shop model or method

**Location:** Look for logs from `V2CategoryController._getAllShops()`

### 3. API Gateway Issues
**Check CloudWatch Logs for:**
- 502 Bad Gateway errors
- 504 Gateway Timeout errors
- CORS errors
- Authorization errors (IAM permissions)

**Location:** API Gateway logs in CloudWatch

### 4. Lambda Function Issues
**Check CloudWatch Logs for:**
- Lambda timeout (default 30 seconds)
- Memory limit exceeded
- Cold start issues
- Unhandled promise rejections

**Location:** Lambda function logs in CloudWatch

## Code Issues Found

### Issue 1: Missing Error Handling in _getAllShops
The `_getAllShops()` method might be failing silently. Check if:
- Shop model is properly imported
- Database connection is established
- Query is executing correctly

### Issue 2: DynamoDB Scan Operation
The `CategoryImgKeywords.getAll()` uses Scan operation which:
- Can be slow for large tables
- May timeout if table is large
- Consumes read capacity units

### Issue 3: Missing Logging
The controller doesn't log:
- Number of categories found
- Number of shops found
- Filtering results
- Response time

## Recommended Fixes

### Add Better Logging
```javascript
static async getCategories(req, res) {
  try {
    console.log('📋 getCategories called with userType:', req.query.userType);
    const startTime = Date.now();
    
    const { userType } = req.query;
    
    console.log('🔍 Fetching categories from DynamoDB...');
    const categories = await CategoryImgKeywords.getAll();
    console.log(`✅ Found ${categories.length} categories`);
    
    console.log('🔍 Fetching shops...');
    const shops = await V2CategoryController._getAllShops();
    console.log(`✅ Found ${shops.length} shops`);
    
    // ... rest of the code
    
    const duration = Date.now() - startTime;
    console.log(`✅ Categories API completed in ${duration}ms`);
    
    return res.json({...});
  } catch (err) {
    console.error('❌ Error fetching categories:', err);
    console.error('Stack:', err.stack);
    return res.status(500).json({...});
  }
}
```

### Add Timeout Handling
```javascript
// Add timeout wrapper
const withTimeout = (promise, timeoutMs) => {
  return Promise.race([
    promise,
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Operation timed out')), timeoutMs)
    )
  ]);
};

// Use it
const categories = await withTimeout(CategoryImgKeywords.getAll(), 10000);
```

### Check DynamoDB Permissions
Ensure Lambda has these IAM permissions:
- `dynamodb:Scan` on `category_img_keywords` table
- `dynamodb:GetItem` on `category_img_keywords` table

## CloudWatch Query Examples

### Find all errors in last hour
```
fields @timestamp, @message
| filter @message like /Error|error|ERROR/
| filter @message like /category|Category/
| sort @timestamp desc
| limit 100
```

### Find timeout errors
```
fields @timestamp, @message
| filter @message like /timeout|Timeout|TIMEOUT/
| sort @timestamp desc
| limit 50
```

### Find DynamoDB errors
```
fields @timestamp, @message
| filter @message like /DynamoDB|dynamodb|category_img_keywords/
| sort @timestamp desc
| limit 50
```

## Common Error Patterns

1. **"Table not found"** → Check table name and region
2. **"Access denied"** → Check IAM permissions
3. **"Connection timeout"** → Check VPC configuration
4. **"Memory limit exceeded"** → Increase Lambda memory
5. **"Task timed out"** → Increase Lambda timeout



