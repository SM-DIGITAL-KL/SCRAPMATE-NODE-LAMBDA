/**
 * Check CloudWatch logs for SMS notification issues
 * Usage: node scripts/check-sms-logs-cloudwatch.js [hours_back] [order_number]
 * Example: node scripts/check-sms-logs-cloudwatch.js 24
 * Example: node scripts/check-sms-logs-cloudwatch.js 24 ORD12345
 */

require('dotenv').config();
const { CloudWatchLogsClient, FilterLogEventsCommand } = require('@aws-sdk/client-cloudwatch-logs');

const HOURS_BACK = parseInt(process.argv[2]) || 24; // Default: last 24 hours
const ORDER_NUMBER = process.argv[3] || null; // Optional: filter by order number
const LOG_GROUP_NAME = process.argv[4] || '/aws/lambda/scrapmate-node-api-dev';

async function checkSMSLogs() {
  try {
    console.log('\n🔍 Checking CloudWatch Logs for SMS Notifications');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log(`Time Range: Last ${HOURS_BACK} hours`);
    if (ORDER_NUMBER) {
      console.log(`Order Number Filter: ${ORDER_NUMBER}`);
    }
    console.log(`Log Group: ${LOG_GROUP_NAME}\n`);

    const client = new CloudWatchLogsClient({
      region: process.env.AWS_REGION || 'ap-south-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
      }
    });

    // Calculate start time (hours back from now)
    const startTime = Date.now() - (HOURS_BACK * 60 * 60 * 1000);

    // 1. Search for SMS notification start
    console.log('📱 1. Searching for SMS notification process start...\n');
    const startFilter = ORDER_NUMBER 
      ? `"[SMS] Starting SMS notification process" "${ORDER_NUMBER}"`
      : '"[SMS] Starting SMS notification process"';
    
    const startCommand = new FilterLogEventsCommand({
      logGroupName: LOG_GROUP_NAME,
      startTime: startTime,
      filterPattern: startFilter,
      limit: 50
    });

    const startLogs = await client.send(startCommand);
    if (startLogs.events && startLogs.events.length > 0) {
      console.log(`✅ Found ${startLogs.events.length} SMS notification start log(s):\n`);
      startLogs.events.forEach((event, index) => {
        const timestamp = new Date(event.timestamp).toISOString();
        console.log(`   ${index + 1}. [${timestamp}]`);
        console.log(`      ${event.message.substring(0, 200)}...\n`);
      });
    } else {
      console.log('   ⚠️  No SMS notification start logs found\n');
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // 2. Search for SMS sending attempts
    console.log('📱 2. Searching for SMS sending attempts...\n');
    const sendingFilter = ORDER_NUMBER
      ? `"[SMS] Sending SMS to" "${ORDER_NUMBER}"`
      : '"[SMS] Sending SMS to"';
    
    const sendingCommand = new FilterLogEventsCommand({
      logGroupName: LOG_GROUP_NAME,
      startTime: startTime,
      filterPattern: sendingFilter,
      limit: 100
    });

    const sendingLogs = await client.send(sendingCommand);
    if (sendingLogs.events && sendingLogs.events.length > 0) {
      console.log(`✅ Found ${sendingLogs.events.length} SMS sending attempt(s):\n`);
      sendingLogs.events.forEach((event, index) => {
        const timestamp = new Date(event.timestamp).toISOString();
        console.log(`   ${index + 1}. [${timestamp}]`);
        console.log(`      ${event.message.substring(0, 200)}...\n`);
      });
    } else {
      console.log('   ⚠️  No SMS sending attempt logs found\n');
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // 3. Search for successful SMS sends
    console.log('✅ 3. Searching for successful SMS sends...\n');
    const successFilter = ORDER_NUMBER
      ? `"[SMS] SMS sent successfully" "${ORDER_NUMBER}"`
      : '"[SMS] SMS sent successfully"';
    
    const successCommand = new FilterLogEventsCommand({
      logGroupName: LOG_GROUP_NAME,
      startTime: startTime,
      filterPattern: successFilter,
      limit: 100
    });

    const successLogs = await client.send(successCommand);
    if (successLogs.events && successLogs.events.length > 0) {
      console.log(`✅ Found ${successLogs.events.length} successful SMS send(s):\n`);
      successLogs.events.forEach((event, index) => {
        const timestamp = new Date(event.timestamp).toISOString();
        console.log(`   ${index + 1}. [${timestamp}]`);
        console.log(`      ${event.message.substring(0, 200)}...\n`);
      });
    } else {
      console.log('   ⚠️  No successful SMS send logs found\n');
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // 4. Search for SMS errors
    console.log('❌ 4. Searching for SMS errors...\n');
    const errorFilter = ORDER_NUMBER
      ? `"[SMS ERROR]" "${ORDER_NUMBER}"`
      : '"[SMS ERROR]"';
    
    const errorCommand = new FilterLogEventsCommand({
      logGroupName: LOG_GROUP_NAME,
      startTime: startTime,
      filterPattern: errorFilter,
      limit: 200
    });

    const errorLogs = await client.send(errorCommand);
    if (errorLogs.events && errorLogs.events.length > 0) {
      console.log(`❌ Found ${errorLogs.events.length} SMS error log(s):\n`);
      errorLogs.events.forEach((event, index) => {
        const timestamp = new Date(event.timestamp).toISOString();
        console.log(`   ${index + 1}. [${timestamp}]`);
        console.log(`      ${event.message.substring(0, 300)}...\n`);
      });
    } else {
      console.log('   ✅ No SMS errors found\n');
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // 5. Search for SMS API responses
    console.log('📱 5. Searching for SMS API responses...\n');
    const apiFilter = ORDER_NUMBER
      ? `"[SMS] API response" "${ORDER_NUMBER}"`
      : '"[SMS] API response"';
    
    const apiCommand = new FilterLogEventsCommand({
      logGroupName: LOG_GROUP_NAME,
      startTime: startTime,
      filterPattern: apiFilter,
      limit: 100
    });

    const apiLogs = await client.send(apiCommand);
    if (apiLogs.events && apiLogs.events.length > 0) {
      console.log(`✅ Found ${apiLogs.events.length} SMS API response log(s):\n`);
      apiLogs.events.forEach((event, index) => {
        const timestamp = new Date(event.timestamp).toISOString();
        console.log(`   ${index + 1}. [${timestamp}]`);
        // Try to extract status from response
        const message = event.message;
        if (message.includes('status')) {
          const statusMatch = message.match(/status[":\s]+['"]?(\w+)['"]?/i);
          if (statusMatch) {
            console.log(`      Status: ${statusMatch[1]}`);
          }
        }
        console.log(`      ${message.substring(0, 200)}...\n`);
      });
    } else {
      console.log('   ⚠️  No SMS API response logs found\n');
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // 6. Search for SMS summary
    console.log('📊 6. Searching for SMS summary...\n');
    const summaryFilter = ORDER_NUMBER
      ? `"[SMS] Summary" "${ORDER_NUMBER}"`
      : '"[SMS] Summary"';
    
    const summaryCommand = new FilterLogEventsCommand({
      logGroupName: LOG_GROUP_NAME,
      startTime: startTime,
      filterPattern: summaryFilter,
      limit: 50
    });

    const summaryLogs = await client.send(summaryCommand);
    if (summaryLogs.events && summaryLogs.events.length > 0) {
      console.log(`✅ Found ${summaryLogs.events.length} SMS summary log(s):\n`);
      summaryLogs.events.forEach((event, index) => {
        const timestamp = new Date(event.timestamp).toISOString();
        console.log(`   ${index + 1}. [${timestamp}]`);
        console.log(`      ${event.message}\n`);
      });
    } else {
      console.log('   ⚠️  No SMS summary logs found\n');
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Summary
    console.log('📊 SUMMARY:');
    console.log(`   SMS Start Logs: ${startLogs.events?.length || 0}`);
    console.log(`   SMS Sending Attempts: ${sendingLogs.events?.length || 0}`);
    console.log(`   Successful SMS Sends: ${successLogs.events?.length || 0}`);
    console.log(`   SMS Errors: ${errorLogs.events?.length || 0}`);
    console.log(`   SMS API Responses: ${apiLogs.events?.length || 0}`);
    console.log(`   SMS Summaries: ${summaryLogs.events?.length || 0}`);
    console.log('');

    if (startLogs.events?.length > 0 && sendingLogs.events?.length === 0) {
      console.log('⚠️  WARNING: SMS process started but no sending attempts found!');
      console.log('   This suggests SMS code is being called but not executing properly.\n');
    }

    if (sendingLogs.events?.length > 0 && successLogs.events?.length === 0) {
      console.log('⚠️  WARNING: SMS sending attempts found but no successful sends!');
      console.log('   Check SMS API responses and errors above.\n');
    }

    if (errorLogs.events?.length > 0) {
      console.log('❌ ERRORS FOUND: Check the error logs above for details.\n');
    }

    console.log('✅ SMS log check complete!\n');

  } catch (error) {
    console.error('❌ Error checking SMS logs:', error);
    console.error('   Error message:', error.message);
    if (error.stack) {
      console.error('   Error stack:', error.stack);
    }
    process.exit(1);
  }
}

checkSMSLogs();
