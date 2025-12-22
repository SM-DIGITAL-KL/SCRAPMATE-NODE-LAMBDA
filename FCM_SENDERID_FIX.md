# FCM SenderId Mismatch Fix

## Issue
CloudWatch logs showed `SenderId mismatch` error when trying to send FCM notifications to vendors:
```
❌ Error sending FCM notification to vendor: FirebaseMessagingError: SenderId mismatch
```

## Root Cause
The Lambda deployment was only including the customer app Firebase service account (`firebase-service-account.json`), but vendor notifications require the vendor app Firebase service account (`scrapmate-partner-android-firebase-adminsdk-fbsvc-709bbce0d4.json`).

When the code tried to send notifications to vendors, Firebase rejected them because:
- Vendor FCM tokens are registered with `scrapmate-partner-android` project
- Lambda was using `scrapmate-user` (customer app) service account
- This caused a SenderId mismatch

## Fix Applied

### 1. Updated Deployment Script (`scripts/deploy-lambda-direct.sh`)
- **Priority**: Now loads vendor app service account first
- **Files included**: Added vendor app service account files to Lambda package:
  - `scrapmate-partner-android-firebase-adminsdk-fbsvc-709bbce0d4.json`
  - `scrapmate-partner-android-firebase-adminsdk-fbsvc-94a2c243ee.json`

### 2. Updated Serverless Config (`serverless.yml`)
- Added vendor app service account files to package patterns
- Ensures files are included when deploying via Serverless Framework

### 3. Updated Environment Builder (`scripts/build-env-json.sh`)
- Prioritizes vendor app service account when building Lambda environment variables
- Falls back to customer app service account if vendor app not found

## Next Steps

### 1. Redeploy Lambda Function
```bash
cd SCRAPMATE-NODE-LAMBDA
./scripts/deploy-lambda-direct.sh dev
```

This will:
- Include vendor app service account files in the deployment package
- Set `FIREBASE_SERVICE_ACCOUNT` environment variable with vendor app credentials
- Fix the SenderId mismatch issue

### 2. Verify Fix
After deployment, test by:
1. Creating a new order from customer app
2. Check CloudWatch logs for successful FCM notification
3. Verify vendor receives notification

### 3. Check CloudWatch Logs
```bash
# Check for successful notifications
aws logs filter-log-events \
  --log-group-name /aws/lambda/scrapmate-node-api-dev \
  --region ap-south-1 \
  --start-time $(($(date +%s) - 3600))000 \
  --filter-pattern "FCM notification sent successfully" \
  --max-items 20
```

## Expected Behavior After Fix

1. **Order Placement**: When customer places order, it gets assigned to vendor
2. **Notification**: Lambda sends FCM notification using vendor app service account
3. **Success**: Notification is delivered successfully (no SenderId mismatch)
4. **Vendor App**: Vendor receives notification and dashboard auto-refreshes

## Files Changed
- ✅ `scripts/deploy-lambda-direct.sh` - Updated to include vendor app service account
- ✅ `scripts/build-env-json.sh` - Updated to prioritize vendor app service account
- ✅ `serverless.yml` - Updated package patterns to include vendor app service account files

## Verification
After redeployment, check CloudWatch logs for:
- ✅ `✅ FCM notification sent successfully to vendor`
- ❌ No more `SenderId mismatch` errors

