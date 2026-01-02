/**
 * Check CloudWatch logs for accept order errors for a specific user (by phone number)
 */

require('dotenv').config();
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const { getDynamoDBClient } = require('../config/dynamodb');
const { ScanCommand } = require('@aws-sdk/lib-dynamodb');

const PHONE_NUMBER = process.argv[2] || '9074135121';
const LOG_GROUP_NAME = process.argv[3] || '/aws/lambda/scrapmate-node-api-dev';
const HOURS_BACK = parseInt(process.argv[4]) || 24; // Default: last 24 hours

async function findUserByPhone(phoneNumber) {
  try {
    const client = getDynamoDBClient();
    const mobileValue = parseInt(phoneNumber);
    
    const command = new ScanCommand({
      TableName: 'users',
      FilterExpression: 'mob_num = :mobile AND app_type = :appType',
      ExpressionAttributeValues: {
        ':mobile': mobileValue,
        ':appType': 'vendor_app' // B2B users use vendor_app
      }
    });
    
    const response = await client.send(command);
    
    if (response.Items && response.Items.length > 0) {
      const user = response.Items[0];
      return {
        id: user.id,
        name: user.name,
        user_type: user.user_type,
        app_type: user.app_type
      };
    }
    
    // If not found with vendor_app, try without app_type filter
    const command2 = new ScanCommand({
      TableName: 'users',
      FilterExpression: 'mob_num = :mobile',
      ExpressionAttributeValues: {
        ':mobile': mobileValue
      }
    });
    
    const response2 = await client.send(command2);
    if (response2.Items && response2.Items.length > 0) {
      // Return the first B2B-type user (R, S, SR) or first user if no B2B
      const b2bUser = response2.Items.find(u => ['R', 'S', 'SR'].includes(u.user_type));
      const user = b2bUser || response2.Items[0];
      return {
        id: user.id,
        name: user.name,
        user_type: user.user_type,
        app_type: user.app_type
      };
    }
    
    return null;
  } catch (error) {
    console.error('❌ Error finding user:', error);
    return null;
  }
}

async function checkAcceptOrderLogs() {
  try {
    console.log('\n🔍 Checking CloudWatch Logs for Accept Order Errors');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log(`Phone Number: ${PHONE_NUMBER}`);
    console.log(`Log Group: ${LOG_GROUP_NAME}`);
    console.log(`Time Range: Last ${HOURS_BACK} hour(s)\n`);
    
    // Find user by phone number
    console.log('🔍 Finding user by phone number...\n');
    const user = await findUserByPhone(PHONE_NUMBER);
    
    if (!user) {
      console.log('❌ User not found with phone number:', PHONE_NUMBER);
      console.log('   Searching logs anyway using phone number pattern...\n');
    } else {
      console.log('✅ User found:');
      console.log(`   User ID: ${user.id}`);
      console.log(`   Name: ${user.name || 'N/A'}`);
      console.log(`   User Type: ${user.user_type || 'N/A'}`);
      console.log(`   App Type: ${user.app_type || 'N/A'}\n`);
    }
    
    const userId = user ? user.id : null;
    const region = process.env.AWS_REGION || 'ap-south-1';

    // Calculate start time (hours back from now) in milliseconds
    const startTimeMs = Date.now() - (HOURS_BACK * 60 * 60 * 1000);
    const startTimeSeconds = Math.floor(startTimeMs / 1000);

    // Helper function to execute AWS CLI commands
    async function filterLogEvents(filterPattern, limit = 500) {
      try {
        // Escape quotes in filter pattern for shell
        const escapedPattern = filterPattern.replace(/"/g, '\\"');
        const command = `aws logs filter-log-events \
          --log-group-name "${LOG_GROUP_NAME}" \
          --region ${region} \
          --start-time ${startTimeSeconds}000 \
          --filter-pattern "${escapedPattern}" \
          --max-items ${limit}`;
        
        const { stdout, stderr } = await execAsync(command);
        
        // Parse JSON response
        const result = JSON.parse(stdout);
        return result.events || [];
      } catch (error) {
        // If command fails, check for specific error types
        if (error.message.includes('No log streams found') || 
            error.message.includes('does not exist') ||
            error.stderr?.includes('does not exist')) {
          return [];
        }
        // Log error but don't fail completely
        console.error(`⚠️  Error filtering logs with pattern "${filterPattern}":`, error.message);
        return [];
      }
    }

    // Search for accept order related logs for this user
    console.log('📋 Searching for accept order logs for this user...\n');
    
    // Build filter pattern - CloudWatch filter pattern syntax
    let acceptFilterPattern = '[acceptPickupRequest]';
    if (userId) {
      acceptFilterPattern = `"[acceptPickupRequest]" ${userId}`;
    } else {
      acceptFilterPattern = `"[acceptPickupRequest]" ${PHONE_NUMBER}`;
    }
    
    const acceptLogs = await filterLogEvents(acceptFilterPattern, 500);
    
    if (acceptLogs && acceptLogs.length > 0) {
      console.log(`✅ Found ${acceptLogs.length} accept order-related log entries:\n`);
      
      // Group logs by request ID or timestamp proximity
      const groupedLogs = [];
      let currentGroup = [];
      
      acceptLogs.forEach((event, index) => {
        const timestamp = new Date(event.timestamp).toLocaleString();
        const message = event.message;
        
        // Check if this is a new request (contains user ID, phone, or acceptPickupRequest)
        const isUserRelated = userId && message.includes(userId.toString());
        const isPhoneRelated = message.includes(PHONE_NUMBER);
        const isAcceptRequest = message.includes('[acceptPickupRequest]') || message.includes('acceptPickupRequest');
        
        if (isAcceptRequest && (isUserRelated || isPhoneRelated)) {
          if (currentGroup.length > 0) {
            groupedLogs.push(currentGroup);
          }
          currentGroup = [{ timestamp, message, event }];
        } else if (currentGroup.length > 0 && (isUserRelated || isPhoneRelated || isAcceptRequest)) {
          // Continue current group if it's related
          currentGroup.push({ timestamp, message, event });
        } else if (isAcceptRequest) {
          // New accept request but might not be user-specific, start new group
          if (currentGroup.length > 0) {
            groupedLogs.push(currentGroup);
          }
          currentGroup = [{ timestamp, message, event }];
        }
      });
      
      if (currentGroup.length > 0) {
        groupedLogs.push(currentGroup);
      }
      
      // Display grouped logs
      groupedLogs.forEach((group, groupIndex) => {
        console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        console.log(`📦 Request Group ${groupIndex + 1} (${group.length} log entries)`);
        console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
        
        group.forEach((log, logIndex) => {
          console.log(`[${logIndex + 1}] ${log.timestamp}`);
          console.log(`   ${log.message}`);
          console.log('');
        });
      });
    } else {
      console.log('⚠️  No accept order-related logs found');
    }

    // Search for errors specifically related to accept order for this user
    console.log('\n❌ Searching for error logs related to accept order for this user...\n');
    
    // CloudWatch filter pattern
    let errorFilterPattern = '"[acceptPickupRequest]" error';
    if (userId) {
      errorFilterPattern = `"[acceptPickupRequest]" error ${userId}`;
    } else {
      errorFilterPattern = `"[acceptPickupRequest]" error ${PHONE_NUMBER}`;
    }
    
    const errorLogs = await filterLogEvents(errorFilterPattern, 500);
    
    if (errorLogs && errorLogs.length > 0) {
      console.log(`✅ Found ${errorLogs.length} error log entries:\n`);
      
      // Show errors with context (surrounding logs)
      errorLogs.forEach((event, index) => {
        const timestamp = new Date(event.timestamp).toLocaleString();
        console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        console.log(`[ERROR ${index + 1}] ${timestamp}`);
        console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        console.log(`${event.message}`);
        console.log('');
      });
    } else {
      console.log('⚠️  No error logs found');
      
      // Try a broader search for this specific user
      console.log('\n🔍 Trying broader error search for this user...\n');
      
      // Use simpler filter pattern
      let broadFilterPattern = 'error';
      if (userId) {
        broadFilterPattern = `error ${userId}`;
      } else {
        broadFilterPattern = `error ${PHONE_NUMBER}`;
      }
      
      const broadErrors = await filterLogEvents(broadFilterPattern, 100);
      if (broadErrors && broadErrors.length > 0) {
        console.log(`⚠️  Found ${broadErrors.length} error entries for this user:\n`);
        broadErrors.slice(0, 20).forEach((event, index) => {
          const timestamp = new Date(event.timestamp).toLocaleString();
          console.log(`[${index + 1}] ${timestamp}`);
          // Show full message if it's short, otherwise truncate
          const messagePreview = event.message.length > 300 
            ? event.message.substring(0, 300) + '...' 
            : event.message;
          console.log(`   ${messagePreview}`);
          console.log('');
        });
      } else {
        console.log('⚠️  No errors found for this user');
      }
    }

    // Additional search: Look for all acceptPickupRequest logs (not filtered by user)
    // This helps identify if there are general acceptance issues
    console.log('\n📊 Searching for all acceptPickupRequest logs (last 100 entries)...\n');
    
    const allAcceptLogs = await filterLogEvents('[acceptPickupRequest]', 100);
    
    if (allAcceptLogs && allAcceptLogs.length > 0) {
      // Filter for logs related to our user
      const userRelatedLogs = allAcceptLogs.filter(event => {
        if (!userId) return event.message.includes(PHONE_NUMBER);
        return event.message.includes(userId.toString()) || event.message.includes(PHONE_NUMBER);
      });
      
      if (userRelatedLogs.length > 0) {
        console.log(`✅ Found ${userRelatedLogs.length} acceptPickupRequest logs for this user:\n`);
        userRelatedLogs.slice(0, 30).forEach((event, index) => {
          const timestamp = new Date(event.timestamp).toLocaleString();
          console.log(`[${index + 1}] ${timestamp}`);
          console.log(`   ${event.message.substring(0, 400)}${event.message.length > 400 ? '...' : ''}`);
          console.log('');
        });
      } else {
        console.log(`⚠️  Found ${allAcceptLogs.length} total acceptPickupRequest logs, but none for this user in the time range`);
      }
    } else {
      console.log('⚠️  No acceptPickupRequest logs found at all in the time range');
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  } catch (error) {
    console.error('\n❌ Error checking CloudWatch logs:', error);
    
    if (error.name === 'ResourceNotFoundException') {
      console.error(`\n⚠️  Log group "${LOG_GROUP_NAME}" not found.`);
      console.error('   Available log groups might be:');
      console.error('   - /aws/lambda/scrapmate-node-api-dev');
      console.error('   - /aws/lambda/scrapmate-node-api-prod');
      console.error('   - /aws/lambda/scrapmate-orders-service-dev');
      console.error('\n   Please check your AWS Lambda function name and update LOG_GROUP_NAME.');
    } else if (error.name === 'AccessDeniedException') {
      console.error('\n⚠️  Access denied. Please check your AWS credentials and IAM permissions.');
    } else {
      console.error('   Stack:', error.stack);
    }
  }
}

// Run the script
checkAcceptOrderLogs().catch(console.error);

