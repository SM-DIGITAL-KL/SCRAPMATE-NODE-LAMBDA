/**
 * Script to check user data by phone number
 * Usage: node scripts/check-user-by-phone.js <phone_number>
 * Example: node scripts/check-user-by-phone.js 9074135121
 */

const User = require('../models/User');
const Shop = require('../models/Shop');

const phoneNumber = process.argv[2];

if (!phoneNumber) {
  console.error('❌ Please provide a phone number');
  console.log('Usage: node scripts/check-user-by-phone.js <phone_number>');
  process.exit(1);
}

async function checkUserByPhone() {
  try {
    console.log(`🔍 Checking user data for phone number: ${phoneNumber}`);
    
    // Get user by mobile number (this returns a single user, prioritizing customer_app)
    const user = await User.findByMobile(phoneNumber);
    
    // Also scan for ALL users with this phone number to find vendor_app users
    const { getDynamoDBClient } = require('../config/dynamodb');
    const { ScanCommand } = require('@aws-sdk/lib-dynamodb');
    const client = getDynamoDBClient();
    
    let lastKey = null;
    const allUsers = [];
    
    do {
      const params = {
        TableName: 'users',
        FilterExpression: 'mob_num = :mobile AND (attribute_not_exists(del_status) OR del_status <> :deleted)',
        ExpressionAttributeValues: {
          ':mobile': parseInt(phoneNumber),
          ':deleted': 2
        }
      };
      
      if (lastKey) {
        params.ExclusiveStartKey = lastKey;
      }
      
      const command = new ScanCommand(params);
      const response = await client.send(command);
      
      if (response.Items && response.Items.length > 0) {
        allUsers.push(...response.Items);
      }
      
      lastKey = response.LastEvaluatedKey;
    } while (lastKey);
    
    if (allUsers.length === 0) {
      console.log(`❌ No users found with phone number ${phoneNumber}`);
      return;
    }
    
    console.log(`\n✅ Found ${allUsers.length} user(s) with phone number ${phoneNumber}\n`);
    
    const userList = allUsers.map(u => {
      const { password: _, ...userWithoutPassword } = u;
      return userWithoutPassword;
    });
    
    for (const user of userList) {
      console.log('📋 User Data:');
      console.log('─'.repeat(50));
      console.log(`ID: ${user.id}`);
      console.log(`Name: ${user.name || '(empty)'}`);
      console.log(`Email: ${user.email || '(empty)'}`);
      console.log(`Mobile: ${user.mob_num || '(empty)'}`);
      console.log(`User Type: ${user.user_type || '(empty)'}`);
      console.log(`App Type: ${user.app_type || '(empty)'}`);
      console.log(`App Version: ${user.app_version || '(empty)'}`);
      
      // Check if user has a shop (for R, S, SR users)
      if (user.user_type === 'R' || user.user_type === 'S' || user.user_type === 'SR') {
        console.log('\n🏪 Checking Shop Data:');
        console.log('─'.repeat(50));
        
        // For SR users, find all shops (including deleted ones)
        if (user.user_type === 'SR') {
          const allShops = await Shop.findAllByUserId(parseInt(user.id));
          
          console.log(`🔍 findAllByUserId returned ${allShops ? allShops.length : 0} shop(s)`);
          
          if (allShops && allShops.length > 0) {
            console.log(`✅ Found ${allShops.length} shop(s) for SR user:`);
            console.log('');
            
            allShops.forEach((shop, index) => {
              console.log(`Shop ${index + 1}:`);
              console.log(`  Shop ID: ${shop.id}`);
              console.log(`  Shop Type: ${shop.shop_type} (${shop.shop_type === 1 ? 'Industrial/B2B' : shop.shop_type === 3 ? 'Retailer/B2C' : shop.shop_type === 4 ? 'Wholesaler/B2B' : 'Unknown'})`);
              console.log(`  Shop Name: ${shop.shopname || '(empty)'}`);
              console.log(`  Owner Name: ${shop.ownername || '(empty)'}`);
              console.log(`  Company Name: ${shop.company_name || '(empty)'}`);
              console.log(`  Contact: ${shop.contact || '(empty)'}`);
              console.log(`  Address: ${shop.address || '(empty)'}`);
              console.log(`  Approval Status: ${shop.approval_status || '(empty)'}`);
              console.log(`  Del Status: ${shop.del_status || 1}`);
              console.log('');
            });
            
            // Find B2C and B2B shops
            const b2cShop = allShops.find(s => s.shop_type === 3);
            const b2bShop = allShops.find(s => s.shop_type === 1 || s.shop_type === 4);
            
            if (b2cShop && b2bShop) {
              console.log('✅ User has both B2C and B2B shops');
            } else if (b2cShop) {
              console.log('✅ User has B2C shop only');
            } else if (b2bShop) {
              console.log('✅ User has B2B shop only');
            }
          } else {
            console.log('❌ No shops found for this SR user');
          }
        } else {
          // For R and S users, use findByUserId
          const shop = await Shop.findByUserId(parseInt(user.id));
          
          if (shop) {
            console.log(`Shop ID: ${shop.id}`);
            console.log(`Shop Type: ${shop.shop_type} (${shop.shop_type === 1 ? 'Industrial/B2B' : shop.shop_type === 3 ? 'Retailer/B2C' : shop.shop_type === 4 ? 'Wholesaler/B2B' : 'Unknown'})`);
            console.log(`Shop Name: ${shop.shopname || '(empty)'}`);
            console.log(`Owner Name: ${shop.ownername || '(empty)'}`);
            console.log(`Company Name: ${shop.company_name || '(empty)'}`);
            console.log(`Contact Person Name: ${shop.contact_person_name || '(empty)'}`);
            console.log(`Contact: ${shop.contact || '(empty)'}`);
            console.log(`Address: ${shop.address || '(empty)'}`);
            console.log(`Approval Status: ${shop.approval_status || '(empty)'}`);
            console.log(`Del Status: ${shop.del_status || 1}`);
          } else {
            console.log('❌ No shop found for this user');
          }
        }
      }
      
      console.log('\n' + '='.repeat(50) + '\n');
    }
    
    console.log('✅ Check complete');
    
  } catch (error) {
    console.error('❌ Error checking user:', error);
    process.exit(1);
  }
}

checkUserByPhone();

