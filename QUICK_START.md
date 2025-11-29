# Quick Start Guide - Serverless Deployment

## ⚠️ Important: IAM Permissions Required

Your AWS IAM user needs several permissions to deploy Serverless applications. **This is the most common blocker.**

### Required Permissions

Your IAM user `scrapmate` needs these AWS managed policies:
- `CloudFormationFullAccess` (required for deployment)
- `AWSLambda_FullAccess` (required for Lambda functions)
- `AmazonAPIGatewayAdministrator` (required for API Gateway)
- `IAMFullAccess` (required to create Lambda execution roles)
- `AmazonSSMFullAccess` (optional, for SSM Parameter Store)
- `AmazonS3FullAccess` (for S3 access)
- `AmazonDynamoDBFullAccess` (for DynamoDB access)

### Quick Fix: Add Permissions via AWS Console

1. Go to: https://console.aws.amazon.com/iam/
2. Click: **Users** → `scrapmate` → **Add permissions**
3. Select: **Attach policies directly**
4. Search and check these policies:
   - `CloudFormationFullAccess`
   - `AWSLambda_FullAccess`
   - `AmazonAPIGatewayAdministrator`
   - `IAMFullAccess`
5. Click **Next** → **Add permissions**

See `scripts/setup-iam-permissions.md` for detailed instructions.

## Solution 1: Add IAM Permissions (Recommended)

### Via AWS Console:
1. Go to: https://console.aws.amazon.com/iam/
2. Click: Users → `scrapmate` → "Add permissions"
3. Select: "Attach policies directly"
4. Search: `AmazonSSMFullAccess`
5. Check box → "Next" → "Add permissions"

### Via AWS CLI (if you have admin access):
```bash
aws iam attach-user-policy \
  --user-name scrapmate \
  --policy-arn arn:aws:iam::aws:policy/AmazonSSMFullAccess \
  --region ap-south-1
```

Then run:
```bash
./scripts/setup-ssm-parameters-manual.sh dev ap-south-1
```

## Solution 2: Use Environment Variables (Quick Test)

If you just want to test deployment without SSM, you can temporarily set environment variables directly:

1. **Set environment variables in your terminal:**
```bash
export API_KEY=zyubkfzeumeoviaqzcsrvfwdzbiwnlnn
export SESSION_SECRET=your-session-secret
export JWT_SECRET=your-jwt-secret
export AWS_ACCESS_KEY_ID=AKIASY6OQMSMLTUQAOTS
export AWS_SECRET_ACCESS_KEY=YGAuzNnlkayiZj/QdJpHnzhaK2W53VwuwFGC/jn8
export AWS_REGION=ap-south-1
```

2. **Update serverless.yml** to use environment variables:
   - Comment out the SSM lines (starting with `${ssm:`)
   - Uncomment the direct value lines

3. **Deploy:**
```bash
npm run deploy:dev
```

⚠️ **Warning:** This stores secrets in the Lambda environment. For production, use SSM Parameter Store.

## Solution 3: Manual Parameter Setup via AWS Console

1. Go to: https://console.aws.amazon.com/systems-manager/
2. Click: "Parameter Store" → "Create parameter"
3. For each parameter:
   - **Name:** `/scrapmate/dev/API_KEY`
   - **Type:** `SecureString`
   - **Value:** `zyubkfzeumeoviaqzcsrvfwdzbiwnlnn`
   - Click "Create parameter"

Repeat for:
- `/scrapmate/dev/SESSION_SECRET`
- `/scrapmate/dev/JWT_SECRET`
- `/scrapmate/dev/AWS_ACCESS_KEY_ID`
- `/scrapmate/dev/AWS_SECRET_ACCESS_KEY`

## Verify Setup

After setting up parameters, verify:

```bash
aws ssm get-parameters \
  --names /scrapmate/dev/API_KEY /scrapmate/dev/SESSION_SECRET \
  --region ap-south-1 \
  --with-decryption
```

## Deploy

Once parameters are set:

```bash
# Install dependencies
npm install

# Deploy to dev
npm run deploy:dev

# Or test locally first
npm run offline
```

## Next Steps

1. ✅ Add IAM permissions for SSM
2. ✅ Set up SSM parameters
3. ✅ Deploy to Lambda
4. ✅ Test the API endpoint
5. ✅ Update your frontend to use the new Lambda URL

For detailed instructions, see `DEPLOYMENT.md`.

