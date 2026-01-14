/**
 * Script to find all users who have received bulk messages
 * Usage: node scripts/find-bulk-message-users.js [--with-user-details]
 * 
 * Options:
 *   --with-user-details: Also fetch and display user details from users table
 */

const BulkMessageNotification = require('../models/BulkMessageNotification');
const User = require('../models/User');
const { getDynamoDBClient } = require('../config/dynamodb');
const { ScanCommand } = require('@aws-sdk/lib-dynamodb');

const TABLE_NAME = 'users';

async function findBulkMessageUsers() {
  try {
    console.log('🔍 Finding all users who have received bulk messages...\n');
    
    const withUserDetails = process.argv.includes('--with-user-details');
    
    // Get all bulk message notifications
    let allNotifications = [];
    let lastKey = null;
    let totalScanned = 0;
    
    console.log('📊 Scanning bulk_message_notifications table...');
    
    do {
      const result = await BulkMessageNotification.findAll(100, lastKey);
      allNotifications.push(...result.items);
      lastKey = result.lastKey;
      totalScanned += result.items.length;
      
      if (lastKey) {
        console.log(`   Scanned ${totalScanned} notifications so far...`);
      }
    } while (lastKey);
    
    console.log(`✅ Found ${allNotifications.length} total bulk message notifications\n`);
    
    // Extract unique phone numbers
    const phoneNumberSet = new Set();
    const phoneNumberMap = new Map(); // phone -> { count, statuses, latest_date }
    
    allNotifications.forEach(notification => {
      const phone = notification.phone_number;
      phoneNumberSet.add(phone);
      
      if (!phoneNumberMap.has(phone)) {
        phoneNumberMap.set(phone, {
          count: 0,
          statuses: new Set(),
          latest_date: null,
          business_names: new Set()
        });
      }
      
      const phoneData = phoneNumberMap.get(phone);
      phoneData.count++;
      
      if (notification.status) {
        phoneData.statuses.add(notification.status);
      }
      
      const notifyDate = new Date(notification.notified_at || notification.created_at);
      if (!phoneData.latest_date || notifyDate > phoneData.latest_date) {
        phoneData.latest_date = notifyDate;
      }
      
      // Extract business name if available
      if (notification.business_data && notification.business_data.name) {
        phoneData.business_names.add(notification.business_data.name);
      }
    });
    
    const uniquePhones = Array.from(phoneNumberSet);
    console.log(`📱 Found ${uniquePhones.length} unique phone numbers that received bulk messages\n`);
    
    // Statistics
    console.log('📊 Statistics:');
    console.log(`   Total notifications: ${allNotifications.length}`);
    console.log(`   Unique phone numbers: ${uniquePhones.length}`);
    console.log(`   Average messages per phone: ${(allNotifications.length / uniquePhones.length).toFixed(2)}`);
    
    // Status breakdown
    const statusCounts = {};
    allNotifications.forEach(n => {
      const status = n.status || 'unknown';
      statusCounts[status] = (statusCounts[status] || 0) + 1;
    });
    console.log('\n   Status breakdown:');
    Object.entries(statusCounts).forEach(([status, count]) => {
      console.log(`     ${status}: ${count} (${((count / allNotifications.length) * 100).toFixed(1)}%)`);
    });
    
    // Prepare results
    const results = [];
    
    if (withUserDetails) {
      console.log('\n🔍 Fetching user details from users table...');
      const client = getDynamoDBClient();
      
      for (let i = 0; i < uniquePhones.length; i++) {
        const phone = uniquePhones[i];
        const phoneData = phoneNumberMap.get(phone);
        
        if ((i + 1) % 50 === 0) {
          console.log(`   Processed ${i + 1}/${uniquePhones.length} phone numbers...`);
        }
        
        try {
          // Normalize phone number (remove spaces, etc.)
          const normalizedPhone = phone.replace(/[\s+\-()]/g, '');
          const phoneNum = parseInt(normalizedPhone);
          
          // Find user by mobile number
          let user = null;
          try {
            user = await User.findByMobile(phoneNum);
          } catch (err) {
            // If not found, try scanning
            let lastKey = null;
            do {
              const params = {
                TableName: TABLE_NAME,
                FilterExpression: 'mob_num = :mobile AND (attribute_not_exists(del_status) OR del_status <> :deleted)',
                ExpressionAttributeValues: {
                  ':mobile': phoneNum,
                  ':deleted': 2
                }
              };
              
              if (lastKey) {
                params.ExclusiveStartKey = lastKey;
              }
              
              const command = new ScanCommand(params);
              const response = await client.send(command);
              
              if (response.Items && response.Items.length > 0) {
                user = response.Items[0]; // Take first match
                break;
              }
              
              lastKey = response.LastEvaluatedKey;
            } while (lastKey);
          }
          
          results.push({
            phone_number: phone,
            message_count: phoneData.count,
            statuses: Array.from(phoneData.statuses),
            latest_message_date: phoneData.latest_date ? phoneData.latest_date.toISOString() : null,
            business_names: Array.from(phoneData.business_names),
            user: user ? {
              id: user.id,
              name: user.name,
              email: user.email,
              user_type: user.user_type,
              app_type: user.app_type,
              app_version: user.app_version || 'v1',
              created_at: user.created_at
            } : null
          });
        } catch (err) {
          console.error(`   Error fetching user for phone ${phone}:`, err.message);
          results.push({
            phone_number: phone,
            message_count: phoneData.count,
            statuses: Array.from(phoneData.statuses),
            latest_message_date: phoneData.latest_date ? phoneData.latest_date.toISOString() : null,
            business_names: Array.from(phoneData.business_names),
            user: null,
            error: err.message
          });
        }
      }
      
      console.log(`\n✅ Fetched user details for ${results.length} phone numbers\n`);
      
      // User statistics
      const usersFound = results.filter(r => r.user !== null).length;
      const usersNotFound = results.filter(r => r.user === null).length;
      console.log('👥 User Details Statistics:');
      console.log(`   Users found in database: ${usersFound} (${((usersFound / results.length) * 100).toFixed(1)}%)`);
      console.log(`   Users not found: ${usersNotFound} (${((usersNotFound / results.length) * 100).toFixed(1)}%)`);
      
      // User type breakdown
      const userTypeCounts = {};
      results.forEach(r => {
        if (r.user && r.user.user_type) {
          const type = r.user.user_type;
          userTypeCounts[type] = (userTypeCounts[type] || 0) + 1;
        }
      });
      
      if (Object.keys(userTypeCounts).length > 0) {
        console.log('\n   User type breakdown:');
        Object.entries(userTypeCounts).forEach(([type, count]) => {
          console.log(`     ${type}: ${count}`);
        });
      }
      
      // App type breakdown
      const appTypeCounts = {};
      results.forEach(r => {
        if (r.user && r.user.app_type) {
          const type = r.user.app_type;
          appTypeCounts[type] = (appTypeCounts[type] || 0) + 1;
        }
      });
      
      if (Object.keys(appTypeCounts).length > 0) {
        console.log('\n   App type breakdown:');
        Object.entries(appTypeCounts).forEach(([type, count]) => {
          console.log(`     ${type}: ${count}`);
        });
      }
      
      // App version breakdown
      const appVersionCounts = {};
      results.forEach(r => {
        if (r.user && r.user.app_version) {
          const version = r.user.app_version;
          appVersionCounts[version] = (appVersionCounts[version] || 0) + 1;
        }
      });
      
      if (Object.keys(appVersionCounts).length > 0) {
        console.log('\n   App version breakdown:');
        Object.entries(appVersionCounts).forEach(([version, count]) => {
          console.log(`     ${version}: ${count}`);
        });
      }
      
      // Store for return value
      const statistics = {
        status_breakdown: statusCounts,
        user_type_breakdown: Object.keys(userTypeCounts).length > 0 ? userTypeCounts : null,
        app_type_breakdown: Object.keys(appTypeCounts).length > 0 ? appTypeCounts : null,
        app_version_breakdown: Object.keys(appVersionCounts).length > 0 ? appVersionCounts : null
      };
    } else {
      // Without user details, just show phone numbers
      uniquePhones.forEach(phone => {
        const phoneData = phoneNumberMap.get(phone);
        results.push({
          phone_number: phone,
          message_count: phoneData.count,
          statuses: Array.from(phoneData.statuses),
          latest_message_date: phoneData.latest_date ? phoneData.latest_date.toISOString() : null,
          business_names: Array.from(phoneData.business_names)
        });
      });
    }
    
    // Sort by latest message date (most recent first)
    results.sort((a, b) => {
      const dateA = a.latest_message_date ? new Date(a.latest_message_date) : new Date(0);
      const dateB = b.latest_message_date ? new Date(b.latest_message_date) : new Date(0);
      return dateB - dateA;
    });
    
    // Display results
    console.log('\n📋 Results (showing first 20):');
    console.log('═══════════════════════════════════════════════════════════\n');
    
    results.slice(0, 20).forEach((result, index) => {
      console.log(`${index + 1}. Phone: ${result.phone_number}`);
      console.log(`   Messages sent: ${result.message_count}`);
      console.log(`   Statuses: ${result.statuses.join(', ')}`);
      console.log(`   Latest message: ${result.latest_message_date || 'N/A'}`);
      if (result.business_names.size > 0) {
        console.log(`   Business names: ${Array.from(result.business_names).join(', ')}`);
      }
      if (withUserDetails && result.user) {
        console.log(`   User ID: ${result.user.id}`);
        console.log(`   User Name: ${result.user.name || 'N/A'}`);
        console.log(`   User Type: ${result.user.user_type || 'N/A'}`);
        console.log(`   App Type: ${result.user.app_type || 'N/A'}`);
        console.log(`   App Version: ${result.user.app_version || 'v1'}`);
      } else if (withUserDetails && !result.user) {
        console.log(`   User: Not found in database`);
      }
      console.log('');
    });
    
    if (results.length > 20) {
      console.log(`... and ${results.length - 20} more results\n`);
    }
    
    // Save to file option
    console.log('💾 Full results available in memory');
    console.log(`   Total unique phone numbers: ${results.length}`);
    console.log(`   Total notifications: ${allNotifications.length}`);
    
    // Return results for potential export
    const returnStats = {
      status_breakdown: statusCounts
    };
    
    if (withUserDetails) {
      returnStats.user_type_breakdown = Object.keys(userTypeCounts).length > 0 ? userTypeCounts : null;
      returnStats.app_type_breakdown = Object.keys(appTypeCounts).length > 0 ? appTypeCounts : null;
      returnStats.app_version_breakdown = Object.keys(appVersionCounts).length > 0 ? appVersionCounts : null;
    }
    
    return {
      total_notifications: allNotifications.length,
      unique_phone_numbers: results.length,
      results: results,
      statistics: returnStats
    };
    
  } catch (error) {
    console.error('❌ Error finding bulk message users:', error);
    console.error('   Stack:', error.stack);
    process.exit(1);
  }
}

// Run the script
if (require.main === module) {
  findBulkMessageUsers()
    .then((data) => {
      console.log('\n✅ Script completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Script failed:', error);
      process.exit(1);
    });
}

module.exports = { findBulkMessageUsers };

