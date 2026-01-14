/**
 * Script to add missing metal subcategories with rates 20% less than market rates
 * Converts MT prices to kg (1 MT = 1000 kg)
 */

const Subcategory = require('../models/Subcategory');
const CategoryImgKeywords = require('../models/CategoryImgKeywords');

// Metal category ID (typically 1 for Metal)
const METAL_CATEGORY_ID = 1;

// Market rates from the provided data (latest rates from 07.01.2026)
const MARKET_RATES = {
  // Brass
  'Brass Local': { price: 649, unit: 'kg' },
  'Brass Purja': { price: 649, unit: 'kg' },
  'Brass GB': { price: 649, unit: 'kg' },
  'Brass Chadri': { price: 676, unit: 'kg' },
  'Brass Honey': { price: 683, unit: 'kg' },
  'Brass Vilaity Local': { price: 688, unit: 'kg' },
  'Brass Vilaity Imported': { price: 698, unit: 'kg' },
  'Brass Honey Gulf': { price: 713, unit: 'kg' },
  'Brass Honey Europe': { price: 717, unit: 'kg' },
  'Brass Honey U.K': { price: 717, unit: 'kg' },
  
  // Copper
  'Copper Scrap Armature': { price: 1130, unit: 'kg' },
  
  // Gun Metal
  'Gun Metal Local': { price: 784, unit: 'kg' },
  'Gun Metal Mix': { price: 794, unit: 'kg' },
  'Gun Metal Jalandhar': { price: 814, unit: 'kg' },
  
  // Aluminium
  'Aluminium Company': { price: 323, unit: 'kg' },
  'Aluminium Local Rod': { price: 288, unit: 'kg' },
  'Aluminium Ingot': { price: 319, unit: 'kg' },
  'Aluminium Wire Scrap': { price: 273, unit: 'kg' },
  'Aluminium Chadri': { price: 0, unit: 'kg' }, // *+/- means price not available
  'Aluminium Bartan': { price: 230, unit: 'kg' },
  'Aluminium Purja': { price: 205, unit: 'kg' },
  'Aluminium Imported': { price: 209, unit: 'kg' },
  
  // Lead
  'PB-Soft': { price: 181, unit: 'kg' },
  'PB-Hard': { price: 191, unit: 'kg' },
  'PP/BT': { price: 106.50, unit: 'kg' },
  
  // Zinc
  'Zinc Ingot HZ': { price: 321, unit: 'kg' },
  'Zinc Dross': { price: 269, unit: 'kg' },
  'Zinc Tukda': { price: 263, unit: 'kg' },
  'Zinc PMI': { price: 291, unit: 'kg' },
  'Zinc Plant Pass': { price: 303, unit: 'kg' },
  'Zinc 99.95': { price: 327, unit: 'kg' },
  
  // Tin
  'Tin I': { price: 0, unit: 'kg' }, // *+/* means price not available
  
  // Nickel
  'Nickle R': { price: 0, unit: 'kg' }, // *+/* means price not available
  'Nickle N': { price: 0, unit: 'kg' }, // *+/* means price not available
  
  // MS (Mild Steel) - Convert from MT to kg
  'MS Scrap Old': { price: 32100 / 1000, unit: 'kg' }, // 32.1 per kg
  'MS Scrap New': { price: 34600 / 1000, unit: 'kg' }, // 34.6 per kg
  'MS Ingot': { price: 42800 / 1000, unit: 'kg' }, // 42.8 per kg
  'MS Billet': { price: 42900 / 1000, unit: 'kg' }, // 42.9 per kg
  
  // Spong Iron - prices not available (*** MT)
  'Spong Iron Bellari': { price: 0, unit: 'kg' },
  'Spong Iron Mandi': { price: 0, unit: 'kg' },
  
  // Cast Iron - prices not available (*** MT)
  'Cast Iron Local': { price: 0, unit: 'kg' },
  'Cast Iron Imported': { price: 0, unit: 'kg' },
  
  // SS (Stainless Steel)
  'SS Mix MH': { price: 57, unit: 'kg' }, // Using lower price
  'SS 202': { price: 59, unit: 'kg' }, // Using lower price
  'SS 304': { price: 113, unit: 'kg' }, // Using lower price
  'SS 309': { price: 193, unit: 'kg' }, // Using lower price
  'SS 310': { price: 296, unit: 'kg' }, // Using lower price
  'SS 316': { price: 213, unit: 'kg' }, // Using lower price
};

/**
 * Calculate price 20% less than market rate
 */
function calculatePrice(marketPrice) {
  if (!marketPrice || marketPrice === 0) {
    return '0'; // Return '0' for unavailable prices
  }
  return (marketPrice * 0.8).toFixed(2);
}

/**
 * Normalize subcategory name for comparison
 */
function normalizeName(name) {
  return name
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Get all existing metal subcategories
 */
async function getExistingSubcategories() {
  try {
    const subcategories = await Subcategory.findByMainCategoryId(METAL_CATEGORY_ID, true);
    return subcategories.map(sub => ({
      id: sub.id,
      name: sub.subcategory_name || '',
      normalizedName: normalizeName(sub.subcategory_name || ''),
      price: sub.default_price || '0',
      unit: sub.price_unit || 'kg'
    }));
  } catch (error) {
    console.error('❌ Error fetching existing subcategories:', error);
    return [];
  }
}

/**
 * Find missing subcategories
 */
function findMissingSubcategories(existing, marketRates) {
  const missing = [];
  
  for (const [name, rate] of Object.entries(marketRates)) {
    const normalized = normalizeName(name);
    const exists = existing.some(ex => ex.normalizedName === normalized);
    
    if (!exists && rate.price > 0) {
      missing.push({
        name: name,
        marketPrice: rate.price,
        unit: rate.unit
      });
    }
  }
  
  return missing;
}

/**
 * Create missing subcategories
 */
async function createMissingSubcategories(missingSubcategories) {
  const created = [];
  const errors = [];
  
  for (const subcat of missingSubcategories) {
    try {
      const price = calculatePrice(subcat.marketPrice);
      
      const subcategoryData = {
        main_category_id: METAL_CATEGORY_ID,
        subcategory_name: subcat.name,
        default_price: price,
        price_unit: subcat.unit,
        approval_status: 'approved',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      
      const createdSubcat = await Subcategory.create(subcategoryData);
      created.push({
        id: createdSubcat.id,
        name: subcat.name,
        price: price,
        marketPrice: subcat.marketPrice,
        unit: subcat.unit
      });
      
      console.log(`✅ Created: ${subcat.name} - ₹${price}/${subcat.unit} (Market: ₹${subcat.marketPrice}/${subcat.unit})`);
    } catch (error) {
      errors.push({
        name: subcat.name,
        error: error.message
      });
      console.error(`❌ Error creating ${subcat.name}:`, error.message);
    }
  }
  
  return { created, errors };
}

/**
 * Update existing subcategories with missing prices (if price is 0 or empty)
 */
async function updateMissingPrices(existing) {
  const updated = [];
  const errors = [];
  
  for (const subcat of existing) {
    const normalized = normalizeName(subcat.name);
    const marketRate = Object.entries(MARKET_RATES).find(([name]) => 
      normalizeName(name) === normalized
    );
    
    if (marketRate) {
      const [, rate] = marketRate;
      const currentPrice = parseFloat(subcat.price) || 0;
      
      // Update if price is missing or 0
      if (currentPrice === 0 && rate.price > 0) {
        try {
          const newPrice = calculatePrice(rate.price);
          
          await Subcategory.update(subcat.id, {
            default_price: newPrice,
            price_unit: rate.unit
          });
          
          updated.push({
            id: subcat.id,
            name: subcat.name,
            oldPrice: subcat.price,
            newPrice: newPrice,
            marketPrice: rate.price,
            unit: rate.unit
          });
          
          console.log(`🔄 Updated: ${subcat.name} - ₹${subcat.price} → ₹${newPrice}/${rate.unit} (Market: ₹${rate.price}/${rate.unit})`);
        } catch (error) {
          errors.push({
            name: subcat.name,
            error: error.message
          });
          console.error(`❌ Error updating ${subcat.name}:`, error.message);
        }
      }
    }
  }
  
  return { updated, errors };
}

/**
 * Main function
 */
async function main() {
  console.log('🚀 Starting metal subcategory update process...\n');
  
  try {
    // Verify metal category exists
    const CategoryImgKeywords = require('../models/CategoryImgKeywords');
    const category = await CategoryImgKeywords.findById(METAL_CATEGORY_ID);
    
    if (!category) {
      console.error(`❌ Metal category with ID ${METAL_CATEGORY_ID} not found!`);
      process.exit(1);
    }
    
    console.log(`✅ Found metal category: ${category.category_name || category.cat_name}\n`);
    
    // Get existing subcategories
    console.log('📋 Fetching existing metal subcategories...');
    const existing = await getExistingSubcategories();
    console.log(`   Found ${existing.length} existing subcategories\n`);
    
    // Find missing subcategories
    console.log('🔍 Finding missing subcategories...');
    const missing = findMissingSubcategories(existing, MARKET_RATES);
    console.log(`   Found ${missing.length} missing subcategories\n`);
    
    // Create missing subcategories
    let createErrors = [];
    let created = [];
    if (missing.length > 0) {
      console.log('➕ Creating missing subcategories...');
      const result = await createMissingSubcategories(missing);
      created = result.created;
      createErrors = result.errors;
      console.log(`\n   ✅ Created: ${created.length}`);
      console.log(`   ❌ Errors: ${createErrors.length}\n`);
      
      if (createErrors.length > 0) {
        console.log('   Errors:');
        createErrors.forEach(err => {
          console.log(`     - ${err.name}: ${err.error}`);
        });
        console.log('');
      }
    } else {
      console.log('   ✅ No missing subcategories found\n');
    }
    
    // Update existing subcategories with missing prices
    console.log('🔄 Updating subcategories with missing prices...');
    const { updated, errors: updateErrors } = await updateMissingPrices(existing);
    console.log(`\n   ✅ Updated: ${updated.length}`);
    console.log(`   ❌ Errors: ${updateErrors.length}\n`);
    
    if (updateErrors.length > 0) {
      console.log('   Errors:');
      updateErrors.forEach(err => {
        console.log(`     - ${err.name}: ${err.error}`);
      });
      console.log('');
    }
    
    // Summary
    console.log('📊 Summary:');
    console.log(`   Total existing subcategories: ${existing.length}`);
    console.log(`   Missing subcategories found: ${missing.length}`);
    console.log(`   Subcategories created: ${created.length}`);
    console.log(`   Subcategories updated: ${updated.length}`);
    console.log(`   Total errors: ${createErrors.length + updateErrors.length}`);
    console.log('\n✅ Process completed!\n');
    
  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
}

// Run the script
if (require.main === module) {
  main()
    .then(() => {
      console.log('✅ Script completed successfully');
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Script failed:', error);
      process.exit(1);
    });
}

module.exports = { main, MARKET_RATES, calculatePrice };

