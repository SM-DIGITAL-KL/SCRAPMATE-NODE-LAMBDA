#!/usr/bin/env node

/**
 * AWS Console MFA Automation Script
 * Automates login to AWS Console and handles MFA to deactivate MFA devices
 * 
 * Requirements:
 * - npm install playwright
 * - npx playwright install chromium
 */

const { chromium } = require('playwright');
const readline = require('readline');
const fs = require('fs');
const path = require('path');

// Load AWS credentials from aws.txt
function loadAwsCredentials() {
  const possiblePaths = [
    path.join(__dirname, '..', 'aws.txt'),
    path.join(process.cwd(), 'aws.txt'),
    path.join(process.cwd(), '..', 'aws.txt'),
  ];

  let awsTxtPath = null;
  for (const possiblePath of possiblePaths) {
    if (fs.existsSync(possiblePath)) {
      awsTxtPath = possiblePath;
      break;
    }
  }

  if (!awsTxtPath) {
    throw new Error('aws.txt file not found');
  }

  const content = fs.readFileSync(awsTxtPath, 'utf-8');
  const lines = content.split('\n');
  const credentials = {};

  lines.forEach((line) => {
    line = line.trim();
    if (!line || line.startsWith('#')) {
      return;
    }
    
    if (line.startsWith('export ')) {
      const parts = line.substring(7).split('=', 2);
      if (parts.length === 2) {
        let key = parts[0].trim();
        let value = parts[1].trim();
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        credentials[key] = value;
      }
    }
  });

  return credentials;
}

// Prompt user for input
function promptUser(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

// Generate TOTP code if secret is available (optional)
function generateTOTP(secret) {
  // This would require a TOTP library like 'otplib'
  // For now, we'll prompt the user for the code
  return null;
}

async function automateAwsConsoleLogin() {
  console.log('🚀 Starting AWS Console MFA Automation...\n');

  // Load credentials
  let credentials;
  try {
    credentials = loadAwsCredentials();
    console.log('✅ Loaded AWS credentials from aws.txt');
  } catch (error) {
    console.error('❌ Error loading credentials:', error.message);
    process.exit(1);
  }

  // Try to detect username from ARN if available
  let defaultUsername = 'scrapmate'; // Default based on IAM user from credentials
  try {
    const { execSync } = require('child_process');
    const arnOutput = execSync('aws sts get-caller-identity --query Arn --output text 2>/dev/null || echo ""', { 
      encoding: 'utf-8',
      env: { ...process.env, AWS_ACCESS_KEY_ID: credentials.AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY: credentials.AWS_SECRET_ACCESS_KEY, AWS_DEFAULT_REGION: credentials.AWS_REGION || 'ap-south-1' }
    }).trim();
    if (arnOutput && arnOutput.includes('/')) {
      const extractedUser = arnOutput.split('/').pop();
      if (extractedUser && extractedUser !== 'root') {
        defaultUsername = extractedUser;
      }
    }
  } catch (e) {
    // Use default
  }

  // Get user input
  const rootEmail = 'Scrapmate48@gmail.com';
  const defaultPassword = 'Sakthiesakki@2026';
  
  console.log(`\n💡 Tip: Your IAM user appears to be: ${defaultUsername}`);
  console.log('   You can use:');
  console.log('   - Root account email: Scrapmate48@gmail.com');
  console.log('   - IAM username (e.g., scrapmate)');
  console.log('   - Account alias (if configured)');
  const usernameInput = await promptUser(`\nEnter AWS Console username/email (press Enter for "${rootEmail}"): `);
  const username = usernameInput || rootEmail;
  
  const passwordInput = await promptUser('Enter AWS Console password (press Enter to use default): ');
  const password = passwordInput || defaultPassword;
  
  console.log('\n📋 MFA Options:');
  console.log('1. TOTP (Authenticator app - Google Authenticator, Authy, etc.)');
  console.log('2. SMS (Text message)');
  console.log('3. Hardware token');
  const mfaType = await promptUser('Select MFA type (1/2/3): ');

  // Launch browser
  console.log('\n🌐 Launching browser...');
  const browser = await chromium.launch({
    headless: false, // Set to true for headless mode
    slowMo: 500, // Slow down operations for visibility
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });

  const page = await context.newPage();

  try {
    // Navigate to AWS Console sign-in
    console.log('📍 Navigating to AWS Console...');
    await page.goto('https://console.aws.amazon.com/', { waitUntil: 'networkidle' });

    // Wait for sign-in page
    await page.waitForSelector('input[name="username"], input[type="email"], #resolving_input', { timeout: 10000 });

    // Fill username
    console.log('✍️  Entering username...');
    const usernameSelectors = [
      'input[name="username"]',
      'input[type="email"]',
      '#resolving_input',
      'input[id*="username"]',
      'input[placeholder*="username" i]',
      'input[placeholder*="email" i]'
    ];

    let usernameFilled = false;
    for (const selector of usernameSelectors) {
      try {
        const input = await page.$(selector);
        if (input) {
          await input.fill(username);
          usernameFilled = true;
          break;
        }
      } catch (e) {
        continue;
      }
    }

    if (!usernameFilled) {
      throw new Error('Could not find username input field');
    }

    // Click next/continue button
    console.log('➡️  Clicking next...');
    const nextButtonSelectors = [
      'button[type="submit"]',
      'input[type="submit"]',
      'button:has-text("Next")',
      'button:has-text("Continue")',
      'button:has-text("Sign in")',
      '#next_button',
      '.aws-signin-button'
    ];

    let nextClicked = false;
    for (const selector of nextButtonSelectors) {
      try {
        const button = await page.$(selector);
        if (button && await button.isVisible()) {
          await button.click();
          nextClicked = true;
          await page.waitForTimeout(1000);
          break;
        }
      } catch (e) {
        continue;
      }
    }

    // Wait for password page
    await page.waitForTimeout(2000);
    await page.waitForSelector('input[type="password"], input[name="password"]', { timeout: 10000 });

    // Fill password
    console.log('✍️  Entering password...');
    const passwordInput = await page.$('input[type="password"], input[name="password"]');
    if (!passwordInput) {
      throw new Error('Could not find password input field');
    }
    await passwordInput.fill(password);

    // Click sign in
    console.log('➡️  Clicking sign in...');
    const signInButton = await page.$('button[type="submit"], input[type="submit"], button:has-text("Sign in")');
    if (signInButton) {
      await signInButton.click();
    }

    // Wait for MFA prompt
    console.log('⏳ Waiting for MFA prompt...');
    await page.waitForTimeout(3000);

    // Check if MFA is required
    const mfaSelectors = [
      'input[name="mfaCode"]',
      'input[type="text"][placeholder*="code" i]',
      'input[id*="mfa"]',
      'input[id*="code"]',
      '#mfa_code',
      'input[autocomplete="one-time-code"]'
    ];

    let mfaInput = null;
    for (const selector of mfaSelectors) {
      try {
        mfaInput = await page.$(selector);
        if (mfaInput && await mfaInput.isVisible()) {
          break;
        }
      } catch (e) {
        continue;
      }
    }

    if (mfaInput) {
      console.log('🔐 MFA code required...');
      
      let mfaCode;
      if (mfaType === '1') {
        // TOTP - prompt user for code from authenticator app
        mfaCode = await promptUser('Enter 6-digit MFA code from your authenticator app: ');
      } else if (mfaType === '2') {
        // SMS - prompt user for code from SMS
        mfaCode = await promptUser('Enter MFA code from SMS: ');
      } else {
        // Hardware token
        mfaCode = await promptUser('Enter MFA code from hardware token: ');
      }

      await mfaInput.fill(mfaCode);

      // Submit MFA code
      const submitButton = await page.$('button[type="submit"], input[type="submit"], button:has-text("Submit")');
      if (submitButton) {
        await submitButton.click();
      }
    }

    // Wait for successful login
    console.log('⏳ Waiting for login to complete...');
    await page.waitForTimeout(5000);

    // Check if we're logged in (look for AWS console elements)
    const isLoggedIn = await page.$('nav[aria-label="Services"], #awsc-nav-header, [data-testid="awsc-nav-header"]');
    
    if (isLoggedIn) {
      console.log('✅ Successfully logged in to AWS Console!');
    } else {
      // Check for error messages
      const errorText = await page.textContent('body');
      if (errorText.includes('incorrect') || errorText.includes('error') || errorText.includes('Invalid')) {
        console.error('❌ Login failed. Please check your credentials.');
        await page.screenshot({ path: 'aws-login-error.png' });
        console.log('📸 Screenshot saved as aws-login-error.png');
        await browser.close();
        process.exit(1);
      }
    }

    // Navigate to IAM Console
    console.log('\n📍 Navigating to IAM Console...');
    await page.goto('https://console.aws.amazon.com/iam/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);

    // Navigate to Users
    console.log('👥 Navigating to Users...');
    await page.goto('https://console.aws.amazon.com/iam/home#/users', { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);

    // Search for the user (use the username that was logged in with)
    const searchUser = username === 'root' ? 'scrapmate' : username;
    console.log(`🔍 Searching for user: ${searchUser}...`);
    
    // Try to find search input
    const searchSelectors = [
      'input[type="search"]',
      'input[placeholder*="search" i]',
      'input[id*="search"]',
      '#search-input',
      'input[aria-label*="search" i]'
    ];

    let searchInput = null;
    for (const selector of searchSelectors) {
      try {
        searchInput = await page.$(selector);
        if (searchInput && await searchInput.isVisible()) {
          await searchInput.fill(searchUser);
          await page.waitForTimeout(1000);
          break;
        }
      } catch (e) {
        continue;
      }
    }

    // Click on the user
    console.log('👆 Clicking on user...');
    await page.waitForTimeout(2000);
    
    const userLinkSelectors = [
      `a:has-text("${searchUser}")`,
      `[role="link"]:has-text("${searchUser}")`,
      `td:has-text("${searchUser}")`,
      `span:has-text("${searchUser}")`
    ];

    let userClicked = false;
    for (const selector of userLinkSelectors) {
      try {
        const userLink = await page.$(selector);
        if (userLink && await userLink.isVisible()) {
          await userLink.click();
          userClicked = true;
          await page.waitForTimeout(2000);
          break;
        }
      } catch (e) {
        continue;
      }
    }

    if (!userClicked) {
      console.log('⚠️  Could not find user link. Trying to navigate directly...');
      await page.goto(`https://console.aws.amazon.com/iam/home#/users/${searchUser}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(3000);
    }

    // Navigate to Security credentials tab
    console.log('🔐 Navigating to Security credentials tab...');
    await page.waitForTimeout(2000);
    
    const securityTabSelectors = [
      'button:has-text("Security credentials")',
      'a:has-text("Security credentials")',
      '[role="tab"]:has-text("Security credentials")',
      'button[aria-label*="Security credentials" i]'
    ];

    let tabClicked = false;
    for (const selector of securityTabSelectors) {
      try {
        const tab = await page.$(selector);
        if (tab && await tab.isVisible()) {
          await tab.click();
          tabClicked = true;
          await page.waitForTimeout(2000);
          break;
        }
      } catch (e) {
        continue;
      }
    }

    if (!tabClicked) {
      // Try direct URL
      await page.goto(`https://console.aws.amazon.com/iam/home#/users/${searchUser}?section=security_credentials`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(3000);
    }

    // Look for MFA device section
    console.log('🔍 Looking for MFA device section...');
    await page.waitForTimeout(2000);

    // Take screenshot for debugging
    await page.screenshot({ path: 'aws-iam-security-credentials.png', fullPage: true });
    console.log('📸 Screenshot saved as aws-iam-security-credentials.png');

    // Look for MFA device remove/deactivate button
    const mfaRemoveSelectors = [
      'button:has-text("Remove")',
      'button:has-text("Deactivate")',
      'button:has-text("Delete")',
      '[aria-label*="Remove MFA" i]',
      '[aria-label*="Deactivate MFA" i]',
      'button[data-testid*="remove"]',
      'button[data-testid*="deactivate"]'
    ];

    let mfaRemoved = false;
    for (const selector of mfaRemoveSelectors) {
      try {
        const buttons = await page.$$(selector);
        for (const button of buttons) {
          const text = await button.textContent();
          if (text && (text.includes('Remove') || text.includes('Deactivate') || text.includes('Delete'))) {
            const parentText = await button.evaluate(el => el.closest('div, section, tr')?.textContent || '');
            if (parentText.includes('MFA') || parentText.includes('Multi')) {
              console.log('🗑️  Found MFA remove button, clicking...');
              await button.click();
              await page.waitForTimeout(2000);
              
              // Confirm deletion if prompted
              const confirmSelectors = [
                'button:has-text("Confirm")',
                'button:has-text("Delete")',
                'button:has-text("Remove")',
                'button[data-testid*="confirm"]',
                'button[aria-label*="confirm" i]'
              ];

              for (const confirmSelector of confirmSelectors) {
                try {
                  const confirmButton = await page.$(confirmSelector);
                  if (confirmButton && await confirmButton.isVisible()) {
                    await confirmButton.click();
                    mfaRemoved = true;
                    await page.waitForTimeout(2000);
                    break;
                  }
                } catch (e) {
                  continue;
                }
              }
              
              if (mfaRemoved) break;
            }
          }
        }
        if (mfaRemoved) break;
      } catch (e) {
        continue;
      }
    }

    if (mfaRemoved) {
      console.log('✅ MFA device successfully removed!');
    } else {
      console.log('⚠️  Could not automatically remove MFA device.');
      console.log('📸 Please check the screenshot: aws-iam-security-credentials.png');
      console.log('💡 You may need to manually remove the MFA device from the AWS Console.');
    }

    // Keep browser open for a few seconds to see the result
    console.log('\n✅ Automation completed! Browser will close in 10 seconds...');
    await page.waitForTimeout(10000);

  } catch (error) {
    console.error('\n❌ Error during automation:', error.message);
    await page.screenshot({ path: 'aws-automation-error.png', fullPage: true });
    console.log('📸 Error screenshot saved as aws-automation-error.png');
  } finally {
    await browser.close();
    console.log('👋 Browser closed.');
  }
}

// Run the automation
if (require.main === module) {
  automateAwsConsoleLogin().catch(console.error);
}

module.exports = { automateAwsConsoleLogin };

