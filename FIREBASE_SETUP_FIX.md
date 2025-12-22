# Firebase Admin SDK Setup Fix

## Problem
Error: "Unable to detect a Project Id in the current environment"

## Solution

Firebase Admin SDK requires proper credentials to send push notifications. You need to set up one of the following:

### Option 1: Set FIREBASE_SERVICE_ACCOUNT (Recommended for Lambda)

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project: **scrapmate-user**
3. Go to Project Settings → Service Accounts
4. Click "Generate New Private Key"
5. Download the JSON file
6. Set the environment variable in your Lambda function:

```bash
# For local development
export FIREBASE_SERVICE_ACCOUNT='{"type":"service_account","project_id":"scrapmate-user",...}'

# For AWS Lambda, add to environment variables in Lambda configuration
# Key: FIREBASE_SERVICE_ACCOUNT
# Value: (paste the entire JSON content as a string)
```

### Option 2: Set FIREBASE_PROJECT_ID (For GCP/Cloud Run)

If running on Google Cloud Platform with Application Default Credentials:

```bash
export FIREBASE_PROJECT_ID='scrapmate-user'
```

### Option 3: For AWS Lambda Deployment

Add the environment variable in your Lambda function configuration:

1. Go to AWS Lambda Console
2. Select your function
3. Go to Configuration → Environment variables
4. Add:
   - Key: `FIREBASE_SERVICE_ACCOUNT`
   - Value: (the entire service account JSON as a string)

**Important**: The JSON must be a single-line string. You can convert it:

```bash
# Convert JSON file to single-line string
cat service-account-key.json | jq -c
```

## Verification

After setting the environment variable, test the notification:

```bash
node test-fcm.js 9074135121
```

You should see:
- ✅ Firebase Admin SDK initialized successfully
- ✅ Notification sent successfully

## Current Project Info

- **Project ID**: scrapmate-user
- **Project Number**: 290393183902
- **Storage Bucket**: scrapmate-user.firebasestorage.app

## Troubleshooting

### Error: "Unable to detect a Project Id"
- Solution: Set `FIREBASE_SERVICE_ACCOUNT` or `FIREBASE_PROJECT_ID` environment variable

### Error: "Invalid FIREBASE_SERVICE_ACCOUNT JSON format"
- Solution: Make sure the JSON is valid and properly escaped as a string

### Error: "Permission denied"
- Solution: Ensure the service account has "Firebase Cloud Messaging API Admin" role

