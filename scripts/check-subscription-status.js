/**
 * Script to check subscription status for a user by transaction ID or user details
 * 
 * Usage: 
 *   node scripts/check-subscription-status.js [transaction_id]
 *   node scripts/check-subscription-status.js --user "sr service center"
 *   node scripts/check-subscription-status.js --phone 8248122283
 *   node scripts/check-subscription-status.js MOJO6111D05Q15595837
 */

require('dotenv').config();
const Invoice = require('../models/Invoice');
const User = require('../models/User');

async function checkSubscriptionStatus() {
  try {
    const transactionId = process.argv[2];
    const userArg = process.argv.find(arg => arg.startsWith('--user='));
    const phoneArg = process.argv.find(arg => arg.startsWith('--phone='));
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔍 Checking Subscription Status');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    let invoices = [];
    let user = null;
    
    if (transactionId && !transactionId.startsWith('--')) {
      // Find by transaction ID
      console.log(`\n📋 Searching for transaction ID: ${transactionId}`);
      invoices = await Invoice.findByTransactionIds([transactionId]);
      
      if (invoices.length > 0) {
        console.log(`✅ Found ${invoices.length} invoice(s) with transaction ID: ${transactionId}`);
        // Get user details from first invoice
        if (invoices[0].user_id) {
          try {
            user = await User.findById(invoices[0].user_id);
          } catch (err) {
            console.log(`⚠️  Could not fetch user details: ${err.message}`);
          }
        }
      } else {
        console.log(`❌ No invoices found with transaction ID: ${transactionId}`);
      }
    } else if (userArg) {
      // Find by user name
      const userName = userArg.split('=')[1];
      console.log(`\n📋 Searching for user: ${userName}`);
      
      // Find user by name (scan users table)
      const { getDynamoDBClient } = require('../config/dynamodb');
      const { ScanCommand } = require('@aws-sdk/lib-dynamodb');
      const client = getDynamoDBClient();
      
      let lastKey = null;
      do {
        const params = {
          TableName: 'users',
          FilterExpression: 'contains(#name, :name)',
          ExpressionAttributeNames: {
            '#name': 'name'
          },
          ExpressionAttributeValues: {
            ':name': userName
          }
        };
        
        if (lastKey) {
          params.ExclusiveStartKey = lastKey;
        }
        
        const command = new ScanCommand(params);
        const response = await client.send(command);
        
        if (response.Items && response.Items.length > 0) {
          user = response.Items[0];
          break;
        }
        
        lastKey = response.LastEvaluatedKey;
      } while (lastKey);
      
      if (user) {
        console.log(`✅ Found user: ${user.name} (ID: ${user.id}, Phone: ${user.mob_num || 'N/A'})`);
        invoices = await Invoice.findByUserId(user.id);
        console.log(`✅ Found ${invoices.length} invoice(s) for this user`);
      } else {
        console.log(`❌ User not found: ${userName}`);
      }
    } else if (phoneArg) {
      // Find by phone number
      const phone = phoneArg.split('=')[1];
      console.log(`\n📋 Searching for phone: ${phone}`);
      
      user = await User.findByMobile(phone);
      
      if (user) {
        console.log(`✅ Found user: ${user.name} (ID: ${user.id})`);
        invoices = await Invoice.findByUserId(user.id);
        console.log(`✅ Found ${invoices.length} invoice(s) for this user`);
      } else {
        console.log(`❌ User not found with phone: ${phone}`);
      }
    } else {
      console.log('❌ Please provide either a transaction ID, --user="name", or --phone="number"');
      console.log('   Examples:');
      console.log('     node scripts/check-subscription-status.js MOJO6111D05Q15595837');
      console.log('     node scripts/check-subscription-status.js --user="sr service center"');
      console.log('     node scripts/check-subscription-status.js --phone=8248122283');
      process.exit(1);
    }
    
    if (invoices.length === 0) {
      console.log('\n❌ No invoices found');
      process.exit(0);
    }
    
    // Sort invoices by to_date descending (most recent first)
    invoices.sort((a, b) => {
      const dateA = new Date(a.to_date || 0);
      const dateB = new Date(b.to_date || 0);
      return dateB - dateA;
    });
    
    const latestInvoice = invoices[0];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const toDate = new Date(latestInvoice.to_date);
    toDate.setHours(0, 0, 0, 0);
    
    const isActive = toDate >= today;
    const diffTime = toDate - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 Subscription Status');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    if (user) {
      console.log(`\n👤 User Information:`);
      console.log(`   Name: ${user.name || 'N/A'}`);
      console.log(`   User ID: ${user.id || 'N/A'}`);
      console.log(`   Phone: ${user.mob_num || 'N/A'}`);
      console.log(`   User Type: ${user.user_type || 'N/A'}`);
      console.log(`   Email: ${user.email || 'N/A'}`);
    }
    
    console.log(`\n📋 Latest Invoice (Invoice ID: ${latestInvoice.id}):`);
    console.log(`   Package Name: ${latestInvoice.name || 'N/A'}`);
    console.log(`   Display Name: ${latestInvoice.displayname || 'N/A'}`);
    console.log(`   Type: ${latestInvoice.type || 'N/A'}`);
    console.log(`   Duration: ${latestInvoice.duration || 'N/A'} days`);
    console.log(`   Price: ₹${latestInvoice.price || '0'}`);
    console.log(`   From Date: ${latestInvoice.from_date || 'N/A'}`);
    console.log(`   To Date: ${latestInvoice.to_date || 'N/A'}`);
    console.log(`   Payment MOJ ID: ${latestInvoice.payment_moj_id || 'N/A'}`);
    console.log(`   Payment Req ID: ${latestInvoice.payment_req_id || 'N/A'}`);
    
    console.log(`\n📅 Subscription Status:`);
    console.log(`   Today: ${today.toISOString().split('T')[0]}`);
    console.log(`   Expiry Date: ${latestInvoice.to_date || 'N/A'}`);
    
    if (isActive) {
      console.log(`   ✅ Status: ACTIVE`);
      console.log(`   📊 Days Remaining: ${diffDays} day(s)`);
    } else {
      console.log(`   ❌ Status: EXPIRED`);
      console.log(`   📊 Days Since Expiry: ${Math.abs(diffDays)} day(s)`);
    }
    
    if (invoices.length > 1) {
      console.log(`\n📋 All Invoices (${invoices.length} total):`);
      invoices.forEach((inv, index) => {
        const invToDate = new Date(inv.to_date);
        invToDate.setHours(0, 0, 0, 0);
        const invIsActive = invToDate >= today;
        console.log(`\n   ${index + 1}. Invoice ID: ${inv.id}`);
        console.log(`      Package: ${inv.name || 'N/A'}`);
        console.log(`      From: ${inv.from_date || 'N/A'} → To: ${inv.to_date || 'N/A'}`);
        console.log(`      Status: ${invIsActive ? '✅ ACTIVE' : '❌ EXPIRED'}`);
        console.log(`      Payment ID: ${inv.payment_moj_id || inv.payment_req_id || 'N/A'}`);
      });
    }
    
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
  } catch (error) {
    console.error('❌ Error:', error);
    console.error('   Message:', error.message);
    if (error.stack) {
      console.error('   Stack:', error.stack.split('\n').slice(0, 5).join('\n'));
    }
    process.exit(1);
  }
}

checkSubscriptionStatus();
