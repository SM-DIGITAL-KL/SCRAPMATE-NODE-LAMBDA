# DynamoDB Environment Setup Guide

This guide explains how to set up separate DynamoDB databases for development and production environments.

## Overview

The system now supports environment-based table naming:
- **Production**: Tables use their base names (e.g., `users`, `orders`)
- **Development**: Tables are prefixed with `dev_` (e.g., `dev_users`, `dev_orders`)

This allows you to:
- Keep production data safe from development changes
- Test changes without affecting production
- Clone production data to development for testing

## Environment Configuration

### Setting the Environment

The environment is determined by the `NODE_ENV` or `ENVIRONMENT` environment variable:

```bash
# Development mode
export NODE_ENV=dev
# or
export NODE_ENV=development
# or
export ENVIRONMENT=dev

# Production mode (default)
export NODE_ENV=prod
# or
export NODE_ENV=production
# or
export ENVIRONMENT=prod
```

### Environment Variables

Add to your `.env` file or `aws.txt`:

```bash
# For development
NODE_ENV=dev

# For production (default)
NODE_ENV=prod
```

## Table Name Utility

Use the `dynamodbTableNames` utility to get environment-aware table names:

```javascript
const { getTableName } = require('../utils/dynamodbTableNames');

// Get table name for current environment
const usersTable = getTableName('users'); 
// Returns 'dev_users' in dev, 'users' in prod

// Get all table names
const { getAllTableNames } = require('../utils/dynamodbTableNames');
const tables = getAllTableNames();
```

## Cloning Production to Development

### Prerequisites

1. Ensure you have AWS credentials configured (in `aws.txt` or environment variables)
2. Set `NODE_ENV=prod` to read from production tables
3. Make sure you have permissions to:
   - Read from production tables
   - Create and write to development tables

### Running the Clone Script

```bash
# From SCRAPMATE-NODE-LAMBDA directory
NODE_ENV=prod node scripts/clone-production-to-dev.js

# Or make it executable and run directly
chmod +x scripts/clone-production-to-dev.js
NODE_ENV=prod ./scripts/clone-production-to-dev.js
```

### What the Script Does

1. **Scans** all items from production tables
2. **Creates** development tables if they don't exist (with same schema as production)
3. **Copies** all data to development tables
4. **Reports** summary of items copied

### Tables Cloned

The script clones the following tables:
- `users` → `dev_users`
- `shops` → `dev_shops`
- `orders` → `dev_orders`
- `products` → `dev_products`
- `product_category` → `dev_product_category`
- `customer` → `dev_customer`
- `delivery_boy` → `dev_delivery_boy`
- `admin_profile` → `dev_admin_profile`
- `bulk_scrap_requests` → `dev_bulk_scrap_requests`
- `bulk_sell_requests` → `dev_bulk_sell_requests`
- `pending_bulk_buy_orders` → `dev_pending_bulk_buy_orders`
- `subscription_packages` → `dev_subscription_packages`
- `invoice` → `dev_invoice`
- `order_location_history` → `dev_order_location_history`
- And more...

## Updating Models

### Before (Hardcoded Table Name)

```javascript
const TABLE_NAME = 'users';

class User {
  static async findById(id) {
    const command = new GetCommand({
      TableName: TABLE_NAME,  // Always uses 'users'
      Key: { id }
    });
    // ...
  }
}
```

### After (Environment-Aware)

```javascript
const { getTableName } = require('../utils/dynamodbTableNames');

class User {
  static async findById(id) {
    const command = new GetCommand({
      TableName: getTableName('users'),  // Uses 'dev_users' or 'users' based on NODE_ENV
      Key: { id }
    });
    // ...
  }
}
```

### Migration Strategy

You can migrate models gradually:

1. **Option 1**: Update all models at once (recommended for new projects)
2. **Option 2**: Update models one at a time as you work on them
3. **Option 3**: Use environment variable fallback:

```javascript
const { getTableName } = require('../utils/dynamodbTableNames');
const TABLE_NAME = process.env.USERS_TABLE || getTableName('users');
```

## Creating Development Tables

### Automatic Creation

The clone script automatically creates development tables with the same schema as production tables.

### Manual Creation

If you need to create tables manually:

```bash
# Example: Create dev_users table
aws dynamodb create-table \
  --table-name dev_users \
  --attribute-definitions \
    AttributeName=id,AttributeType=N \
  --key-schema \
    AttributeName=id,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region ap-south-1
```

## Best Practices

1. **Always set NODE_ENV**: Make sure `NODE_ENV` is set correctly before running scripts
2. **Test in Development First**: Always test changes in development before deploying to production
3. **Regular Clones**: Periodically clone production to development to keep test data current
4. **Separate AWS Credentials**: Consider using different AWS credentials for dev/prod if possible
5. **Backup Before Cloning**: The clone script overwrites development data - backup if needed

## Troubleshooting

### Issue: "Table does not exist"

**Solution**: Run the clone script first to create development tables, or create them manually.

### Issue: "Access Denied"

**Solution**: Check your AWS credentials and IAM permissions. You need:
- `dynamodb:DescribeTable`
- `dynamodb:Scan`
- `dynamodb:PutItem`
- `dynamodb:BatchWriteItem`
- `dynamodb:CreateTable` (for first-time setup)

### Issue: "Wrong environment detected"

**Solution**: Check your `NODE_ENV` or `ENVIRONMENT` variable:
```bash
echo $NODE_ENV
```

### Issue: "Table already exists but schema is different"

**Solution**: Delete the development table and let the clone script recreate it:
```bash
aws dynamodb delete-table --table-name dev_users --region ap-south-1
```

## Lambda Deployment

For Lambda functions, set the environment variable in your `serverless.yml`:

```yaml
provider:
  environment:
    NODE_ENV: ${opt:stage, 'prod'}
    # or explicitly
    NODE_ENV: prod  # for production
    NODE_ENV: dev   # for development
```

## Summary

- **Development**: Set `NODE_ENV=dev` → Tables prefixed with `dev_`
- **Production**: Set `NODE_ENV=prod` → Tables use base names
- **Clone**: Run `NODE_ENV=prod node scripts/clone-production-to-dev.js` to copy production data
- **Models**: Use `getTableName('table_name')` instead of hardcoded table names

