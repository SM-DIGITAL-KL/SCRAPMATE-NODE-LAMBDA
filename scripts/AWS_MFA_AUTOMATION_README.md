# AWS Console MFA Automation

This script automates the process of logging into the AWS Console and deactivating MFA devices for IAM users.

## Prerequisites

1. **Node.js** installed (v14 or higher)
2. **Playwright** browser binaries installed
3. **AWS Console credentials** (username and password)
4. **MFA device** (TOTP app, SMS, or hardware token)

## Installation

The script automatically installs Playwright when you run it. However, if you need to install manually:

```bash
cd SCRAPMATE-NODE-LAMBDA
npm install playwright --save-dev
npx playwright install chromium
```

## Usage

### Option 1: Using npm script (Recommended)

```bash
cd SCRAPMATE-NODE-LAMBDA
npm run aws:mfa:deactivate
```

### Option 2: Direct execution

```bash
cd SCRAPMATE-NODE-LAMBDA
node scripts/aws-console-mfa-automation.js
```

### Option 3: As executable

```bash
cd SCRAPMATE-NODE-LAMBDA
./scripts/aws-console-mfa-automation.js
```

## How It Works

1. **Loads AWS credentials** from `aws.txt` (for account identification)
2. **Prompts for AWS Console credentials**:
   - Username (or root account)
   - Password
   - MFA type (TOTP/SMS/Hardware token)
3. **Launches browser** (Chromium via Playwright)
4. **Automates login**:
   - Navigates to AWS Console
   - Enters username and password
   - Handles MFA code input
5. **Navigates to IAM**:
   - Goes to IAM Console
   - Finds the user (default: `scrapmate`)
   - Opens Security credentials tab
6. **Deactivates MFA**:
   - Finds MFA device section
   - Clicks Remove/Deactivate button
   - Confirms deletion

## Interactive Prompts

The script will ask you for:

1. **AWS Console Username**: 
   - Enter your IAM username or press Enter for root account
   - Default: root account

2. **AWS Console Password**: 
   - Enter your password (input is hidden)

3. **MFA Type**: 
   - `1` for TOTP (Authenticator app like Google Authenticator, Authy)
   - `2` for SMS (Text message)
   - `3` for Hardware token

4. **MFA Code**: 
   - Enter the 6-digit code from your MFA device
   - For TOTP: Code from authenticator app
   - For SMS: Code received via text message
   - For Hardware token: Code from physical device

## Features

- ✅ **Automated browser control** - Uses Playwright for reliable automation
- ✅ **Smart element detection** - Multiple selector strategies for AWS Console elements
- ✅ **Error handling** - Takes screenshots on errors for debugging
- ✅ **Visual feedback** - Browser runs in non-headless mode so you can see what's happening
- ✅ **Screenshot capture** - Saves screenshots at key steps for troubleshooting

## Screenshots

The script automatically saves screenshots:
- `aws-login-error.png` - If login fails
- `aws-iam-security-credentials.png` - Security credentials page
- `aws-automation-error.png` - If any error occurs

## Troubleshooting

### Browser doesn't launch
- Make sure Playwright is installed: `npx playwright install chromium`
- Check Node.js version: `node --version` (should be v14+)

### Can't find username/password fields
- AWS Console UI may have changed
- Check the screenshot files for current page state
- You may need to update selectors in the script

### MFA code not accepted
- Make sure you're entering the code quickly (TOTP codes expire in 30 seconds)
- Check that you selected the correct MFA type
- Verify your MFA device is synced correctly

### Can't find MFA device section
- The script will save a screenshot showing the current page
- You may need to manually remove MFA from the AWS Console
- Check: `aws-iam-security-credentials.png`

### Permission errors
- The IAM user may not have permission to manage MFA
- You may need to use root account or admin user
- Check IAM policies for `iam:DeactivateMFADevice` permission

## Security Notes

⚠️ **Important Security Considerations:**

1. **Credentials**: The script prompts for credentials interactively (not stored)
2. **Browser**: Runs in visible mode so you can monitor the process
3. **Screenshots**: May contain sensitive information - delete after use
4. **MFA**: Deactivating MFA reduces account security - only do this if necessary

## Manual Alternative

If automation fails, you can manually deactivate MFA:

1. Go to: https://console.aws.amazon.com/iam/
2. Navigate to: **Users** → **scrapmate** → **Security credentials**
3. Find **Assigned MFA device** section
4. Click **Remove** or **Deactivate**
5. Confirm the action

## Support

If you encounter issues:
1. Check the screenshot files for visual debugging
2. Review browser console for JavaScript errors
3. Verify AWS Console UI hasn't changed significantly
4. Ensure you have the correct permissions

## Example Output

```
🚀 Starting AWS Console MFA Automation...

✅ Loaded AWS credentials from aws.txt
Enter AWS Console username (or press Enter for root account): scrapmate
Enter AWS Console password: ********
📋 MFA Options:
1. TOTP (Authenticator app - Google Authenticator, Authy, etc.)
2. SMS (Text message)
3. Hardware token
Select MFA type (1/2/3): 1

🌐 Launching browser...
📍 Navigating to AWS Console...
✍️  Entering username...
➡️  Clicking next...
✍️  Entering password...
➡️  Clicking sign in...
⏳ Waiting for MFA prompt...
🔐 MFA code required...
Enter 6-digit MFA code from your authenticator app: 123456
✅ Successfully logged in to AWS Console!

📍 Navigating to IAM Console...
👥 Navigating to Users...
🔍 Searching for user: scrapmate...
👆 Clicking on user...
🔐 Navigating to Security credentials tab...
🔍 Looking for MFA device section...
📸 Screenshot saved as aws-iam-security-credentials.png
🗑️  Found MFA remove button, clicking...
✅ MFA device successfully removed!

✅ Automation completed! Browser will close in 10 seconds...
👋 Browser closed.
```

