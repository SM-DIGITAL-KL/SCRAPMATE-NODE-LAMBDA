/**
 * Script to check user category by phone number
 * Usage: node scripts/check-user-by-phone.js <phone_number>
 */

const User = require('../models/User');

async function checkUserByPhone(phoneNumber) {
  try {
    console.log(`\n🔍 Checking phone number: ${phoneNumber}\n`);
    
    // Clean phone number
    const cleanedPhone = phoneNumber.replace(/\D/g, '');
    
    if (cleanedPhone.length !== 10) {
      console.error('❌ Invalid phone number. Please enter a valid 10-digit phone number.');
      return;
    }
    
    // Find all users with this phone number
    const allUsers = await User.findAllByMobile(cleanedPhone);
    
    if (!allUsers || allUsers.length === 0) {
      console.log('❌ No user found with this phone number.');
      return;
    }
    
    console.log(`✅ Found ${allUsers.length} user(s) with this phone number:\n`);
    
    allUsers.forEach((user, index) => {
      console.log(`--- User ${index + 1} ---`);
      console.log(`ID: ${user.id}`);
      console.log(`Name: ${user.name || 'N/A'}`);
      console.log(`Email: ${user.email || 'N/A'}`);
      console.log(`Mobile: ${user.mob_num}`);
      console.log(`User Type: ${user.user_type}`);
      console.log(`App Type: ${user.app_type || 'Not set (backward compatibility)'}`);
      console.log(`Created At: ${user.created_at || 'N/A'}`);
      console.log(`Updated At: ${user.updated_at || 'N/A'}`);
      
      // Map user type to category
      let category = '';
      switch (user.user_type) {
        case 'S':
          category = 'B2B (Shop Owner/Vendor)';
          break;
        case 'R':
          category = 'B2C (Retailer) - Vendor App';
          break;
        case 'C':
          if (user.app_type === 'customer_app' || !user.app_type) {
            category = 'Customer App (Flutter)';
          } else {
            category = 'B2C (Customer) - Legacy';
          }
          break;
        case 'D':
          category = 'Delivery Partner';
          break;
        case 'SR':
          category = 'B2B + B2C (Shop Owner + Retailer)';
          break;
        case 'A':
          category = 'Admin';
          break;
        case 'U':
          category = 'Generic User (Web)';
          break;
        default:
          category = `Unknown (${user.user_type})`;
      }
      
      console.log(`Category: ${category}`);
      
      // Determine dashboard access
      let dashboardAccess = [];
      if (user.user_type === 'S' || user.user_type === 'SR') {
        dashboardAccess.push('B2B');
      }
      if (user.user_type === 'R' || user.user_type === 'SR') {
        dashboardAccess.push('B2C');
      }
      if (user.user_type === 'D') {
        dashboardAccess.push('Delivery');
      }
      if (user.user_type === 'C' && (user.app_type === 'customer_app' || !user.app_type)) {
        dashboardAccess.push('Customer App (Flutter)');
      }
      
      if (dashboardAccess.length > 0) {
        console.log(`Dashboard Access: ${dashboardAccess.join(', ')}`);
      }
      
      console.log('');
    });
    
    // Summary
    console.log('--- Summary ---');
    const vendorAppUsers = allUsers.filter(u => 
      u.app_type === 'vendor_app' || (!u.app_type && u.user_type !== 'C')
    );
    const customerAppUsers = allUsers.filter(u => 
      u.user_type === 'C' && (u.app_type === 'customer_app' || !u.app_type)
    );
    
    if (vendorAppUsers.length > 0) {
      console.log(`Vendor App Users: ${vendorAppUsers.length}`);
      vendorAppUsers.forEach(u => {
        console.log(`  - ${u.user_type} (${u.app_type || 'no app_type'})`);
      });
    }
    
    if (customerAppUsers.length > 0) {
      console.log(`Customer App Users: ${customerAppUsers.length}`);
      customerAppUsers.forEach(u => {
        console.log(`  - ${u.user_type} (${u.app_type || 'no app_type'})`);
      });
    }
    
    console.log('\n');
    
  } catch (error) {
    console.error('❌ Error checking user:', error);
    process.exit(1);
  }
}

// Get phone number from command line arguments
const phoneNumber = process.argv[2];

if (!phoneNumber) {
  console.error('❌ Please provide a phone number as an argument.');
  console.log('Usage: node scripts/check-user-by-phone.js <phone_number>');
  console.log('Example: node scripts/check-user-by-phone.js 9074135121');
  process.exit(1);
}

// Run the check
checkUserByPhone(phoneNumber)
  .then(() => {
    console.log('✅ Check completed.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Error:', error);
    process.exit(1);
  });

