/**
 * Script to find all invoices for a user (including checking by phone/email)
 * Usage: node scripts/findUserInvoices.js <userId>
 */

const Invoice = require('../models/Invoice');
const User = require('../models/User');

async function findUserInvoices(userId) {
  try {
    console.log(`\n🔍 Finding all invoices for User ID: ${userId}\n`);
    console.log('━'.repeat(60));

    // Get user info
    const user = await User.findById(userId);
    if (!user) {
      console.log(`❌ User ${userId} not found`);
      return;
    }

    console.log(`👤 User Information:`);
    console.log(`   Name: ${user.name || 'N/A'}`);
    console.log(`   Phone: ${user.phone || user.mob_num || 'N/A'}`);
    console.log(`   Email: ${user.email || 'N/A'}`);

    // Method 1: Direct findByUserId
    console.log(`\n📋 Method 1: Direct findByUserId(${userId})`);
    const invoices1 = await Invoice.findByUserId(userId);
    console.log(`   Found: ${invoices1.length} invoices`);

    // Method 2: Get all invoices and filter
    console.log(`\n📋 Method 2: Scan all invoices and filter by user_id`);
    const allInvoices = await Invoice.getAll();
    const invoices2 = allInvoices.filter(inv => {
      const invUserId = inv.user_id;
      return invUserId === userId || 
             invUserId === parseInt(userId) || 
             String(invUserId) === String(userId);
    });
    console.log(`   Total invoices in DB: ${allInvoices.length}`);
    console.log(`   Found: ${invoices2.length} invoices for user ${userId}`);

    // Show all invoices found
    if (invoices2.length > 0) {
      console.log(`\n📋 All Invoices for User ${userId}:`);
      console.log('━'.repeat(60));
      invoices2.forEach((inv, index) => {
        console.log(`\n   Invoice #${index + 1}:`);
        console.log(`   ├─ ID: ${inv.id}`);
        console.log(`   ├─ User ID: ${inv.user_id} (type: ${typeof inv.user_id})`);
        console.log(`   ├─ Package: ${inv.name || inv.displayname || 'N/A'}`);
        console.log(`   ├─ Type: ${inv.type || 'N/A'}`);
        console.log(`   ├─ Price: ₹${inv.price || '0'}`);
        console.log(`   ├─ Approval Status: ${inv.approval_status || 'N/A'}`);
        console.log(`   ├─ Approval Notes: ${inv.approval_notes || '(none)'}`);
        console.log(`   ├─ From Date: ${inv.from_date || 'N/A'}`);
        console.log(`   ├─ To Date: ${inv.to_date || 'N/A'}`);
        console.log(`   └─ Created At: ${inv.created_at || 'N/A'}`);
      });
    } else {
      console.log(`\n❌ No invoices found for user ${userId}`);
      
      // Check if there are any invoices with similar user IDs (in case of type mismatch)
      console.log(`\n🔍 Checking for invoices with similar user IDs...`);
      const similarInvoices = allInvoices.filter(inv => {
        const invUserId = String(inv.user_id || '');
        const searchUserId = String(userId);
        return invUserId.includes(searchUserId) || searchUserId.includes(invUserId);
      });
      
      if (similarInvoices.length > 0) {
        console.log(`   Found ${similarInvoices.length} invoices with similar user IDs:`);
        similarInvoices.slice(0, 5).forEach(inv => {
          console.log(`   - Invoice ID: ${inv.id}, User ID: ${inv.user_id} (${typeof inv.user_id})`);
        });
      }
    }

    console.log('\n' + '━'.repeat(60) + '\n');

  } catch (error) {
    console.error('❌ Error finding invoices:', error);
    throw error;
  }
}

// Get userId from command line arguments
const userId = process.argv[2];

if (!userId) {
  console.error('❌ Please provide a user ID');
  console.log('Usage: node scripts/findUserInvoices.js <userId>');
  process.exit(1);
}

findUserInvoices(parseInt(userId))
  .then(() => {
    console.log('✅ Check completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });



