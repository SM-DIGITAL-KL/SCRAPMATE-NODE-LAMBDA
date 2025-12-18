/**
 * Script to check which admin panel categories a phone number appears in
 * Usage: node scripts/check-user-categories.js <phoneNumber>
 * Example: node scripts/check-user-categories.js 9074135121
 */

const User = require('../models/User');
const Shop = require('../models/Shop');
const Customer = require('../models/Customer');

async function checkUserCategories(phoneNumber) {
  try {
    console.log(`\n🔍 Checking categories for phone number: ${phoneNumber}\n`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Clean phone number
    const cleanedPhone = phoneNumber.replace(/\D/g, '');
    
    if (cleanedPhone.length !== 10) {
      console.error('❌ Invalid phone number. Please provide a 10-digit phone number.');
      process.exit(1);
    }

    // Find all users with this phone number
    const allUsers = await User.findAllByMobile(cleanedPhone);
    
    if (!allUsers || allUsers.length === 0) {
      console.log('❌ No users found with this phone number.');
      process.exit(0);
    }

    console.log(`✅ Found ${allUsers.length} user(s) with phone number ${cleanedPhone}:\n`);

    const categories = {
      customers: false,
      b2bUsers: false,
      b2cUsers: false,
      deliveryUsers: false
    };

    for (const user of allUsers) {
      console.log(`📱 User ID: ${user.id}`);
      console.log(`   Name: ${user.name || 'N/A'}`);
      console.log(`   Email: ${user.email || 'N/A'}`);
      console.log(`   User Type: ${user.user_type || 'N/A'}`);
      console.log(`   App Type: ${user.app_type || 'N/A (old user)'}`);
      console.log(`   App Version: ${user.app_version || 'v1'}`);
      console.log(`   Deleted Status: ${user.del_status || 1} (1=active, 2=deleted)`);
      console.log(`   Created At: ${user.created_at || 'N/A'}`);
      console.log(`   Updated At: ${user.updated_at || 'N/A'}`);

      // Check shop data
      try {
        const shop = await Shop.findByUserId(user.id);
        if (shop) {
          console.log(`   Shop ID: ${shop.id}`);
          console.log(`   Shop Type: ${shop.shop_type || 'N/A'} (1=Industrial, 2=Retailer/Door Step, 3=Retailer B2C, 4=Wholesaler)`);
          console.log(`   Shop Name: ${shop.shop_name || 'N/A'}`);
        } else {
          console.log(`   Shop: No shop found`);
        }
      } catch (err) {
        console.log(`   Shop: Error fetching - ${err.message}`);
      }

      // Check customer data
      try {
        const customer = await Customer.findByUserId(user.id);
        if (customer) {
          console.log(`   Customer ID: ${customer.id}`);
          console.log(`   Customer Contact: ${customer.contact || 'N/A'}`);
          console.log(`   Customer Address: ${customer.address || 'N/A'}`);
        } else {
          console.log(`   Customer: No customer record found`);
        }
      } catch (err) {
        console.log(`   Customer: Error fetching - ${err.message}`);
      }

      // Determine which categories this user appears in
      console.log(`\n   📋 Appears in Admin Panel Categories:`);
      
      // Check Customers category
      if (user.user_type === 'C') {
        const isCustomerApp = !user.app_type || 
                             user.app_type === 'customer_app' || 
                             user.app_type === '' ||
                             user.app_type === null;
        
        if (isCustomerApp && user.del_status !== 2) {
          categories.customers = true;
          console.log(`   ✅ Customers page (/admin/customers)`);
        } else {
          console.log(`   ⚠️  Customers page: NO (user_type='C' but app_type='${user.app_type}' or deleted)`);
        }
      } else {
        console.log(`   ❌ Customers page: NO (user_type='${user.user_type}', not 'C')`);
      }

      // Check B2B Users category
      if (user.user_type === 'S' || user.user_type === 'SR') {
        if (user.del_status !== 2) {
          categories.b2bUsers = true;
          console.log(`   ✅ B2B Users page (/admin/b2b-users) - user_type='${user.user_type}'`);
        } else {
          console.log(`   ⚠️  B2B Users page: NO (deleted)`);
        }
      } else {
        // Check if user has B2B shop (v1 users)
        try {
          const shop = await Shop.findByUserId(user.id);
          if (shop && (shop.shop_type === 1 || shop.shop_type === 4) && shop.del_status === 1) {
            categories.b2bUsers = true;
            console.log(`   ✅ B2B Users page (/admin/b2b-users) - has B2B shop (shop_type=${shop.shop_type})`);
          } else {
            console.log(`   ❌ B2B Users page: NO`);
          }
        } catch (err) {
          console.log(`   ❌ B2B Users page: NO (error checking shop)`);
        }
      }

      // Check B2C Users category
      if (user.user_type === 'R' || user.user_type === 'SR') {
        if (user.del_status !== 2) {
          categories.b2cUsers = true;
          console.log(`   ✅ B2C Users page (/admin/b2c-users) - user_type='${user.user_type}'`);
        } else {
          console.log(`   ⚠️  B2C Users page: NO (deleted)`);
        }
      } else {
        // Check if user has B2C shop (v1 users)
        try {
          const shop = await Shop.findByUserId(user.id);
          if (shop && (shop.shop_type === 2 || shop.shop_type === 3) && shop.del_status === 1) {
            categories.b2cUsers = true;
            console.log(`   ✅ B2C Users page (/admin/b2c-users) - has B2C shop (shop_type=${shop.shop_type})`);
          } else {
            console.log(`   ❌ B2C Users page: NO`);
          }
        } catch (err) {
          console.log(`   ❌ B2C Users page: NO (error checking shop)`);
        }
      }

      // Check Delivery Users category
      if (user.user_type === 'D') {
        if (user.del_status !== 2) {
          categories.deliveryUsers = true;
          console.log(`   ✅ Delivery Users page (/admin/delivery-users)`);
        } else {
          console.log(`   ⚠️  Delivery Users page: NO (deleted)`);
        }
      } else {
        console.log(`   ❌ Delivery Users page: NO (user_type='${user.user_type}', not 'D')`);
      }

      console.log('\n   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    }

    // Summary
    console.log('📊 SUMMARY:\n');
    console.log(`   Phone Number: ${cleanedPhone}`);
    console.log(`   Total Users Found: ${allUsers.length}`);
    console.log(`\n   Categories this phone number appears in:`);
    console.log(`   ${categories.customers ? '✅' : '❌'} Customers page (/admin/customers)`);
    console.log(`   ${categories.b2bUsers ? '✅' : '❌'} B2B Users page (/admin/b2b-users)`);
    console.log(`   ${categories.b2cUsers ? '✅' : '❌'} B2C Users page (/admin/b2c-users)`);
    console.log(`   ${categories.deliveryUsers ? '✅' : '❌'} Delivery Users page (/admin/delivery-users)`);
    console.log('\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error checking user categories:', error);
    console.error('Error stack:', error.stack);
    process.exit(1);
  }
}

// Get phone number from command line arguments
const phoneNumber = process.argv[2];

if (!phoneNumber) {
  console.error('❌ Please provide a phone number as an argument.');
  console.error('Usage: node scripts/check-user-categories.js <phoneNumber>');
  console.error('Example: node scripts/check-user-categories.js 9074135121');
  process.exit(1);
}

checkUserCategories(phoneNumber);


 * Script to check which admin panel categories a phone number appears in
 * Usage: node scripts/check-user-categories.js <phoneNumber>
 * Example: node scripts/check-user-categories.js 9074135121
 */

const User = require('../models/User');
const Shop = require('../models/Shop');
const Customer = require('../models/Customer');

async function checkUserCategories(phoneNumber) {
  try {
    console.log(`\n🔍 Checking categories for phone number: ${phoneNumber}\n`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Clean phone number
    const cleanedPhone = phoneNumber.replace(/\D/g, '');
    
    if (cleanedPhone.length !== 10) {
      console.error('❌ Invalid phone number. Please provide a 10-digit phone number.');
      process.exit(1);
    }

    // Find all users with this phone number
    const allUsers = await User.findAllByMobile(cleanedPhone);
    
    if (!allUsers || allUsers.length === 0) {
      console.log('❌ No users found with this phone number.');
      process.exit(0);
    }

    console.log(`✅ Found ${allUsers.length} user(s) with phone number ${cleanedPhone}:\n`);

    const categories = {
      customers: false,
      b2bUsers: false,
      b2cUsers: false,
      deliveryUsers: false
    };

    for (const user of allUsers) {
      console.log(`📱 User ID: ${user.id}`);
      console.log(`   Name: ${user.name || 'N/A'}`);
      console.log(`   Email: ${user.email || 'N/A'}`);
      console.log(`   User Type: ${user.user_type || 'N/A'}`);
      console.log(`   App Type: ${user.app_type || 'N/A (old user)'}`);
      console.log(`   App Version: ${user.app_version || 'v1'}`);
      console.log(`   Deleted Status: ${user.del_status || 1} (1=active, 2=deleted)`);
      console.log(`   Created At: ${user.created_at || 'N/A'}`);
      console.log(`   Updated At: ${user.updated_at || 'N/A'}`);

      // Check shop data
      try {
        const shop = await Shop.findByUserId(user.id);
        if (shop) {
          console.log(`   Shop ID: ${shop.id}`);
          console.log(`   Shop Type: ${shop.shop_type || 'N/A'} (1=Industrial, 2=Retailer/Door Step, 3=Retailer B2C, 4=Wholesaler)`);
          console.log(`   Shop Name: ${shop.shop_name || 'N/A'}`);
        } else {
          console.log(`   Shop: No shop found`);
        }
      } catch (err) {
        console.log(`   Shop: Error fetching - ${err.message}`);
      }

      // Check customer data
      try {
        const customer = await Customer.findByUserId(user.id);
        if (customer) {
          console.log(`   Customer ID: ${customer.id}`);
          console.log(`   Customer Contact: ${customer.contact || 'N/A'}`);
          console.log(`   Customer Address: ${customer.address || 'N/A'}`);
        } else {
          console.log(`   Customer: No customer record found`);
        }
      } catch (err) {
        console.log(`   Customer: Error fetching - ${err.message}`);
      }

      // Determine which categories this user appears in
      console.log(`\n   📋 Appears in Admin Panel Categories:`);
      
      // Check Customers category
      if (user.user_type === 'C') {
        const isCustomerApp = !user.app_type || 
                             user.app_type === 'customer_app' || 
                             user.app_type === '' ||
                             user.app_type === null;
        
        if (isCustomerApp && user.del_status !== 2) {
          categories.customers = true;
          console.log(`   ✅ Customers page (/admin/customers)`);
        } else {
          console.log(`   ⚠️  Customers page: NO (user_type='C' but app_type='${user.app_type}' or deleted)`);
        }
      } else {
        console.log(`   ❌ Customers page: NO (user_type='${user.user_type}', not 'C')`);
      }

      // Check B2B Users category
      if (user.user_type === 'S' || user.user_type === 'SR') {
        if (user.del_status !== 2) {
          categories.b2bUsers = true;
          console.log(`   ✅ B2B Users page (/admin/b2b-users) - user_type='${user.user_type}'`);
        } else {
          console.log(`   ⚠️  B2B Users page: NO (deleted)`);
        }
      } else {
        // Check if user has B2B shop (v1 users)
        try {
          const shop = await Shop.findByUserId(user.id);
          if (shop && (shop.shop_type === 1 || shop.shop_type === 4) && shop.del_status === 1) {
            categories.b2bUsers = true;
            console.log(`   ✅ B2B Users page (/admin/b2b-users) - has B2B shop (shop_type=${shop.shop_type})`);
          } else {
            console.log(`   ❌ B2B Users page: NO`);
          }
        } catch (err) {
          console.log(`   ❌ B2B Users page: NO (error checking shop)`);
        }
      }

      // Check B2C Users category
      if (user.user_type === 'R' || user.user_type === 'SR') {
        if (user.del_status !== 2) {
          categories.b2cUsers = true;
          console.log(`   ✅ B2C Users page (/admin/b2c-users) - user_type='${user.user_type}'`);
        } else {
          console.log(`   ⚠️  B2C Users page: NO (deleted)`);
        }
      } else {
        // Check if user has B2C shop (v1 users)
        try {
          const shop = await Shop.findByUserId(user.id);
          if (shop && (shop.shop_type === 2 || shop.shop_type === 3) && shop.del_status === 1) {
            categories.b2cUsers = true;
            console.log(`   ✅ B2C Users page (/admin/b2c-users) - has B2C shop (shop_type=${shop.shop_type})`);
          } else {
            console.log(`   ❌ B2C Users page: NO`);
          }
        } catch (err) {
          console.log(`   ❌ B2C Users page: NO (error checking shop)`);
        }
      }

      // Check Delivery Users category
      if (user.user_type === 'D') {
        if (user.del_status !== 2) {
          categories.deliveryUsers = true;
          console.log(`   ✅ Delivery Users page (/admin/delivery-users)`);
        } else {
          console.log(`   ⚠️  Delivery Users page: NO (deleted)`);
        }
      } else {
        console.log(`   ❌ Delivery Users page: NO (user_type='${user.user_type}', not 'D')`);
      }

      console.log('\n   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    }

    // Summary
    console.log('📊 SUMMARY:\n');
    console.log(`   Phone Number: ${cleanedPhone}`);
    console.log(`   Total Users Found: ${allUsers.length}`);
    console.log(`\n   Categories this phone number appears in:`);
    console.log(`   ${categories.customers ? '✅' : '❌'} Customers page (/admin/customers)`);
    console.log(`   ${categories.b2bUsers ? '✅' : '❌'} B2B Users page (/admin/b2b-users)`);
    console.log(`   ${categories.b2cUsers ? '✅' : '❌'} B2C Users page (/admin/b2c-users)`);
    console.log(`   ${categories.deliveryUsers ? '✅' : '❌'} Delivery Users page (/admin/delivery-users)`);
    console.log('\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error checking user categories:', error);
    console.error('Error stack:', error.stack);
    process.exit(1);
  }
}

// Get phone number from command line arguments
const phoneNumber = process.argv[2];

if (!phoneNumber) {
  console.error('❌ Please provide a phone number as an argument.');
  console.error('Usage: node scripts/check-user-categories.js <phoneNumber>');
  console.error('Example: node scripts/check-user-categories.js 9074135121');
  process.exit(1);
}

checkUserCategories(phoneNumber);

