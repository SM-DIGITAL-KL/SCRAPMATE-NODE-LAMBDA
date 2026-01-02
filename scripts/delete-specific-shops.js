const Shop = require('../models/Shop');

async function deleteSpecificShops() {
  try {
    const shopIds = [
      1766742265002,  // Tddc
      1766745884943,  // Test
      1766747482572,  // Gggh
      1766691518020   // Trwsdf
    ];
    
    console.log(`🗑️  Deleting ${shopIds.length} shop(s)...\n`);
    
    let deletedCount = 0;
    let errorCount = 0;
    
    for (const shopId of shopIds) {
      try {
        // First, get shop details to confirm it exists
        const shop = await Shop.findById(shopId);
        
        if (!shop) {
          console.log(`  ⚠️  Shop ${shopId} not found - skipping`);
          errorCount++;
          continue;
        }
        
        console.log(`  🔍 Found shop ${shopId}: ${shop.shopname || 'N/A'}`);
        
        // Set del_status to 2 (deleted) instead of actually deleting
        await Shop.update(shopId, { del_status: 2 });
        console.log(`  ✅ Deleted shop ${shopId} (${shop.shopname || 'N/A'})`);
        deletedCount++;
      } catch (err) {
        console.error(`  ❌ Error deleting shop ${shopId}:`, err.message);
        errorCount++;
      }
    }
    
    console.log(`\n✅ Deletion complete!`);
    console.log(`   - Deleted: ${deletedCount}`);
    console.log(`   - Errors: ${errorCount}`);
    console.log(`   - Total: ${shopIds.length}`);
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

deleteSpecificShops();

