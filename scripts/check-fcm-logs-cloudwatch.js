/**
 * Check CloudWatch logs for FCM notification issues related to orders
 */

require('dotenv').config();
const { CloudWatchLogsClient, FilterLogEventsCommand } = require('@aws-sdk/client-cloudwatch-logs');

const ORDER_NUMBER = process.argv[2] || '106881113';
const LOG_GROUP_NAME = process.argv[3] || '/aws/lambda/scrapmate-node-api-dev';
const HOURS_BACK = parseInt(process.argv[4]) || 24; // Default: last 24 hours

async function checkFCMLogs() {
  try {
    console.log('\n🔍 Checking CloudWatch Logs for FCM Notification Issues');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log(`Order Number: ${ORDER_NUMBER}`);
    console.log(`Log Group: ${LOG_GROUP_NAME}`);
    console.log(`Time Range: Last ${HOURS_BACK} hours\n`);

    const client = new CloudWatchLogsClient({
      region: process.env.AWS_REGION || 'ap-south-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
      }
    });

    // Calculate start time (hours back from now)
    const startTime = Date.now() - (HOURS_BACK * 60 * 60 * 1000);

    // Search for order-related logs
    console.log('📋 Searching for order placement logs...\n');
    
    const orderFilter = new FilterLogEventsCommand({
      logGroupName: LOG_GROUP_NAME,
      startTime: startTime,
      filterPattern: `"${ORDER_NUMBER}" OR "placePickupRequest" OR "V2OrderController"`,
      limit: 100
    });

    const orderLogs = await client.send(orderFilter);
    
    if (orderLogs.events && orderLogs.events.length > 0) {
      console.log(`✅ Found ${orderLogs.events.length} order-related log entries:\n`);
      
      orderLogs.events.forEach((event, index) => {
        const timestamp = new Date(event.timestamp).toLocaleString();
        console.log(`[${index + 1}] ${timestamp}`);
        console.log(`   ${event.message}`);
        console.log('');
      });
    } else {
      console.log('⚠️  No order-related logs found');
    }

    // Search for FCM notification logs
    console.log('\n📤 Searching for FCM notification logs...\n');
    
    const fcmFilter = new FilterLogEventsCommand({
      logGroupName: LOG_GROUP_NAME,
      startTime: startTime,
      filterPattern: '"FCM" OR "notification" OR "sendVendorNotification" OR "sendNotification"',
      limit: 100
    });

    const fcmLogs = await client.send(fcmFilter);
    
    if (fcmLogs.events && fcmLogs.events.length > 0) {
      console.log(`✅ Found ${fcmLogs.events.length} FCM-related log entries:\n`);
      
      fcmLogs.events.forEach((event, index) => {
        const timestamp = new Date(event.timestamp).toLocaleString();
        console.log(`[${index + 1}] ${timestamp}`);
        console.log(`   ${event.message}`);
        console.log('');
      });
    } else {
      console.log('⚠️  No FCM-related logs found');
    }

    // Search for errors
    console.log('\n❌ Searching for error logs...\n');
    
    const errorFilter = new FilterLogEventsCommand({
      logGroupName: LOG_GROUP_NAME,
      startTime: startTime,
      filterPattern: '"Error" OR "error" OR "❌" OR "Failed"',
      limit: 100
    });

    const errorLogs = await client.send(errorFilter);
    
    if (errorLogs.events && errorLogs.events.length > 0) {
      console.log(`⚠️  Found ${errorLogs.events.length} error log entries:\n`);
      
      // Filter for FCM or order-related errors
      const relevantErrors = errorLogs.events.filter(event => 
        event.message.includes('FCM') || 
        event.message.includes('notification') || 
        event.message.includes('order') ||
        event.message.includes('Order') ||
        event.message.includes(ORDER_NUMBER)
      );

      if (relevantErrors.length > 0) {
        console.log(`   ${relevantErrors.length} relevant error(s) found:\n`);
        relevantErrors.forEach((event, index) => {
          const timestamp = new Date(event.timestamp).toLocaleString();
          console.log(`[${index + 1}] ${timestamp}`);
          console.log(`   ${event.message}`);
          console.log('');
        });
      } else {
        console.log('   No FCM/order-related errors found');
      }
    } else {
      console.log('✅ No error logs found');
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('💡 Tips:');
    console.log('   - Check if order was created successfully');
    console.log('   - Check if vendor FCM token exists');
    console.log('   - Check if notification was sent');
    console.log('   - Check for any Firebase initialization errors');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

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
checkFCMLogs().catch(console.error);

