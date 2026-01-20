require('dotenv').config();
const { getDynamoDBClient } = require('../config/dynamodb');
const { ScanCommand, GetCommand } = require('@aws-sdk/lib-dynamodb');
const User = require('../models/User');

const client = getDynamoDBClient();

async function checkShop() {
  const shopId = 2499;
  const shopName = 'sri sai sakthi waste paper mart';
  const phone = '9952925440';
  const email = 'sarasaravanan32@gmail.com';
  
  console.log('🔍 Searching for shop ID:', shopId);
  console.log('Shop Name:', shopName);
  console.log('');
  
  // Try GetCommand first (exact match)
  console.log('1. Trying GetCommand (exact match)...');
  try {
    const getCmd = new GetCommand({
      TableName: 'shops',
      Key: { id: shopId }
    });
    const getRes = await client.send(getCmd);
    if (getRes.Item) {
      console.log('✅ Found with GetCommand!');
      console.log('Shop Details:');
      console.log(JSON.stringify(getRes.Item, null, 2));
      
      // Check if user exists
      if (getRes.Item.user_id) {
        console.log('\n🔍 Checking vendor user (user_id:', getRes.Item.user_id + ')...');
        try {
          const user = await User.findById(getRes.Item.user_id);
          if (user) {
            console.log('✅ Vendor user found:');
            console.log('User ID:', user.id);
            console.log('Name:', user.name);
            console.log('Mobile:', user.mob_num || user.mobile);
            console.log('Email:', user.email);
            console.log('User Type:', user.user_type);
            console.log('App Version:', user.app_version);
          } else {
            console.log('❌ Vendor user not found');
          }
        } catch (userErr) {
          console.error('❌ Error fetching user:', userErr.message);
        }
      }
    } else {
      console.log('❌ Not found with GetCommand');
    }
  } catch (err) {
    console.log('❌ GetCommand error:', err.message);
  }
  
  console.log('');
  
  // Search by shop name
  console.log('2. Searching by shop name...');
  try {
    const nameCmd = new ScanCommand({
      TableName: 'shops',
      FilterExpression: 'contains(shopname, :name1) OR contains(shop_name, :name1)',
      ExpressionAttributeValues: {
        ':name1': 'sri sai sakthi'
      }
    });
    const nameRes = await client.send(nameCmd);
    if (nameRes.Items && nameRes.Items.length > 0) {
      console.log(`✅ Found ${nameRes.Items.length} shop(s) with similar name:`);
      nameRes.Items.forEach(s => {
        console.log('Shop ID:', s.id, '| Name:', s.shopname || s.shop_name || 'N/A', '| User ID:', s.user_id || 'N/A');
      });
    } else {
      console.log('❌ No shops found with that name');
    }
  } catch (err) {
    console.log('❌ Name search error:', err.message);
  }
  
  console.log('');
  
  // Search by phone/email to find user
  console.log('3. Searching for user by phone/email...');
  try {
    const userScan = new ScanCommand({
      TableName: 'users',
      FilterExpression: 'mob_num = :phone OR mobile = :phone OR email = :email',
      ExpressionAttributeValues: {
        ':phone': phone,
        ':email': email
      }
    });
    const userRes = await client.send(userScan);
    if (userRes.Items && userRes.Items.length > 0) {
      console.log(`✅ Found ${userRes.Items.length} user(s):`);
      userRes.Items.forEach(u => {
        console.log('User ID:', u.id, '| Name:', u.name, '| Type:', u.user_type, '| Mobile:', u.mob_num || u.mobile, '| Email:', u.email);
      });
    } else {
      console.log('❌ No users found with that phone/email');
    }
  } catch (err) {
    console.log('❌ User search error:', err.message);
  }
}

checkShop().catch(console.error);
