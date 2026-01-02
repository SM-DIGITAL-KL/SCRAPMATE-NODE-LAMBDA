# Production Environment Setup Guide

This guide explains how to set up the production environment for ScrapMate Node.js API.

## Overview

The production environment consists of:
1. **Lambda Function**: `scrapmate-node-api-production`
2. **DynamoDB Tables**: All production tables (same names as dev)
3. **S3 Bucket**: `scrapmate-images-production`

## Quick Start

### Option 1: Automated Setup (Recommended)

Run the all-in-one setup script:

```bash
./scripts/setup-production.sh [region]
```

Example:
```bash
./scripts/setup-production.sh ap-south-1
```

This script will:
- Deploy the Lambda function
- Create all DynamoDB tables
- Create the S3 bucket with proper configuration

### Option 2: Manual Setup

#### 1. Deploy Lambda Function

```bash
./scripts/deploy-lambda-direct.sh production [region]
```

Or using npm:
```bash
npm run deploy:prod
```

#### 2. Create DynamoDB Tables

```bash
./scripts/create-production-tables.sh [region]
```

#### 3. Create S3 Bucket

```bash
./scripts/create-production-s3-bucket.sh [region]
```

## Copying Data from Dev to Production

⚠️ **WARNING**: This will overwrite production data!

To copy all data from dev to production:

```bash
./scripts/copy-dev-to-production.sh [region]
```

Or using npm:
```bash
npm run copy:dev-to-prod
```

This script will:
- Copy all DynamoDB tables from dev to production
- Sync S3 bucket data from dev to production

## DynamoDB Tables

The following tables will be created in production:

- `users`
- `shops`
- `customer`
- `delivery_boy`
- `orders`
- `products`
- `product_category`
- `call_logs`
- `packages`
- `invoice`
- `bulk_scrap_requests`
- `subcategory`
- `order_location_history` (with GSI: `order_id-timestamp-index`)
- `category_img_keywords`
- `addresses`
- `user_admins`
- `subscription_packages`
- `shop_images`
- `per_pages`
- `order_rating`
- `notifications`

All tables use **PAY_PER_REQUEST** billing mode (on-demand pricing).

## S3 Bucket Configuration

**⚠️ Current Status**: The production Lambda is currently using the dev bucket (`scrapmate-images`) because the production bucket creation requires additional IAM permissions.

**To create the production bucket** (`scrapmate-images-production`):

1. **Option 1: Manual Creation (Recommended)**
   - Go to AWS S3 Console: https://s3.console.aws.amazon.com/s3/buckets?region=ap-south-1
   - Click "Create bucket"
   - Bucket name: `scrapmate-images-production`
   - Region: `ap-south-1`
   - Configure settings:
     - Block all public access: Enabled (recommended)
     - Versioning: Enabled
     - Default encryption: Enabled
   - Create bucket

2. **Option 2: Using Script (if you have permissions)**
   ```bash
   ./scripts/create-production-s3-bucket-manual.sh ap-south-1
   ```

3. **After creating the bucket, update Lambda**:
   ```bash
   ./scripts/update-lambda-s3-bucket.sh production scrapmate-images-production
   ```

The production S3 bucket (`scrapmate-images-production`) should be configured with:
- **Public Access**: Blocked (security best practice)
- **Versioning**: Enabled (for data safety)
- **CORS**: Configured for web uploads

## Environment Variables

Production Lambda function uses the following environment variables:

- `NODE_ENV`: `production`
- `API_KEY`: Your API key
- `SESSION_SECRET`: Session secret (change in production!)
- `JWT_SECRET`: JWT secret (change in production!)
- `S3_BUCKET_NAME`: Currently `scrapmate-images` (dev bucket) - Update to `scrapmate-images-production` after creating the bucket
- `REDIS_URL`: Redis URL (if using)
- `REDIS_TOKEN`: Redis token (if using)
- `FIREBASE_SERVICE_ACCOUNT`: Firebase service account JSON

## Lambda Function URL

After deployment, the Lambda function will have a Function URL that you can use as your API endpoint.

To get the Function URL:
```bash
aws lambda get-function-url-config \
  --function-name scrapmate-node-api-production \
  --region ap-south-1 \
  --query 'FunctionUrl' \
  --output text
```

## IAM Role

The Lambda function requires an IAM role with permissions for:
- DynamoDB (all operations)
- S3 (all operations)
- CloudWatch Logs (for logging)

Role name: `scrapmate-lambda-execution-role-production`

If the role doesn't exist, create it first:
```bash
./scripts/create-lambda-role.sh production
```

## Verification

### Check Lambda Function
```bash
aws lambda get-function \
  --function-name scrapmate-node-api-production \
  --region ap-south-1
```

### Check DynamoDB Tables
```bash
aws dynamodb list-tables --region ap-south-1
```

### Check S3 Bucket
```bash
aws s3 ls s3://scrapmate-images-production --region ap-south-1
```

## Troubleshooting

### Lambda Deployment Fails

1. Check AWS credentials in `aws.txt`
2. Verify IAM role exists: `scrapmate-lambda-execution-role-production`
3. Check CloudWatch logs for errors

### DynamoDB Table Creation Fails

1. Check IAM permissions for DynamoDB
2. Verify table doesn't already exist
3. Check region is correct

### S3 Bucket Creation Fails

1. Bucket name must be globally unique
2. Check IAM permissions for S3 (may need `s3:CreateBucket` permission)
3. Verify region is correct
4. **Workaround**: Production Lambda is currently using dev bucket (`scrapmate-images`) which works for now

### Document Upload Fails (500 Error)

**Symptom**: Getting 500 error when uploading documents (Aadhar, driving license, etc.)

**Cause**: S3 bucket doesn't exist or Lambda doesn't have permissions

**Solution**:
1. Check if bucket exists: `aws s3api head-bucket --bucket scrapmate-images-production`
2. If bucket doesn't exist, create it (see S3 Bucket Configuration above)
3. Verify Lambda has S3 write permissions in IAM role
4. Check CloudWatch logs for detailed error: `/aws/lambda/scrapmate-node-api-production`
5. **Temporary fix**: Production Lambda is configured to use `scrapmate-images` (dev bucket) which should work

## Security Best Practices

1. **Change Secrets**: Update `SESSION_SECRET` and `JWT_SECRET` for production
2. **Use SSM Parameter Store**: Store sensitive values in AWS Systems Manager Parameter Store
3. **Enable CloudWatch Logs**: Monitor function execution
4. **Set Up Alarms**: Configure CloudWatch alarms for errors
5. **Regular Backups**: Consider enabling DynamoDB point-in-time recovery
6. **S3 Versioning**: Already enabled for data safety

## Next Steps

1. Update frontend/client to use production Lambda URL
2. Test all API endpoints
3. Set up monitoring and alerts
4. Configure backup strategy
5. Document production URLs and credentials securely

## Support

For issues or questions, check:
- CloudWatch Logs: `/aws/lambda/scrapmate-node-api-production`
- AWS Console: Lambda, DynamoDB, S3 sections

