require('dotenv').config();
const Shop = require('../models/Shop');

async function updateShopLocationFields(userId) {
  try {
    console.log(`\n🔍 Updating shop location fields for user ID: ${userId}\n`);

    // Find shop by user_id
    const shop = await Shop.findByUserId(userId);

    if (!shop) {
      console.log(`❌ No shop found for user ID: ${userId}`);
      return null;
    }

    console.log(`✅ Shop found!`);
    console.log(`   Shop ID: ${shop.id}`);
    console.log(`   Current Address: ${shop.address || 'N/A'}\n`);

    // Try to extract pincode and state from address string
    const address = shop.address || '';
    let extractedPincode = '';
    let extractedState = '';
    let extractedPlace = '';

    // Common patterns:
    // "Kerala, 691558" -> state: Kerala, pincode: 691558
    // "City, State, 123456" -> extract pincode (6 digits at end)
    // "State, Pincode" -> extract state and pincode

    // Try to extract pincode (6 digits)
    const pincodeMatch = address.match(/\b(\d{6})\b/);
    if (pincodeMatch) {
      extractedPincode = pincodeMatch[1];
      console.log(`   📍 Extracted pincode: ${extractedPincode}`);
    }

    // Try to extract state (common Indian states)
    const indianStates = [
      'Kerala', 'Tamil Nadu', 'Karnataka', 'Andhra Pradesh', 'Telangana',
      'Maharashtra', 'Gujarat', 'Rajasthan', 'Punjab', 'Haryana',
      'Uttar Pradesh', 'Madhya Pradesh', 'West Bengal', 'Odisha',
      'Bihar', 'Jharkhand', 'Assam', 'Manipur', 'Meghalaya', 'Mizoram',
      'Nagaland', 'Tripura', 'Sikkim', 'Goa', 'Himachal Pradesh',
      'Uttarakhand', 'Delhi', 'Chandigarh', 'Puducherry'
    ];

    for (const state of indianStates) {
      if (address.includes(state)) {
        extractedState = state;
        console.log(`   📍 Extracted state: ${extractedState}`);
        break;
      }
    }

    // Try to extract place/city (first part before comma, if not a state)
    const parts = address.split(',').map(p => p.trim()).filter(p => p);
    if (parts.length > 0 && parts[0] !== extractedState) {
      extractedPlace = parts[0];
      console.log(`   📍 Extracted place: ${extractedPlace}`);
    }

    // Build location string
    const locationParts = [];
    if (extractedPlace) locationParts.push(extractedPlace);
    if (extractedState) locationParts.push(extractedState);
    const extractedLocation = locationParts.join(', ');

    // Prepare update data
    const updateData = {};

    if (extractedPincode && !shop.pincode) {
      updateData.pincode = extractedPincode;
    }
    if (extractedState && !shop.state) {
      updateData.state = extractedState;
    }
    if (extractedPlace && !shop.place) {
      updateData.place = extractedPlace;
    }
    if (extractedLocation && !shop.location) {
      updateData.location = extractedLocation;
    }

    // Set default language if missing (1 = English, 2 = Malayalam, etc.)
    if (!shop.language) {
      // Default to 1 (English) or 2 if state is Kerala (Malayalam)
      updateData.language = extractedState === 'Kerala' ? '2' : '1';
    }

    if (Object.keys(updateData).length === 0) {
      console.log(`   ℹ️  No fields to update (all fields already present or cannot be extracted)\n`);
      return shop;
    }

    console.log(`\n📝 Updating shop with data:`, JSON.stringify(updateData, null, 2));
    
    await Shop.update(shop.id, updateData);

    // Fetch updated shop
    const updatedShop = await Shop.findById(shop.id);

    console.log(`\n✅ Shop updated successfully!\n`);
    console.log(`📍 Updated Location Data Fields:\n`);
    console.log(`   lat_log: ${updatedShop.lat_log || 'MISSING'}`);
    console.log(`   latitude: ${updatedShop.latitude !== undefined ? updatedShop.latitude : 'MISSING'}`);
    console.log(`   longitude: ${updatedShop.longitude !== undefined ? updatedShop.longitude : 'MISSING'}`);
    console.log(`   pincode: ${updatedShop.pincode || 'MISSING'}`);
    console.log(`   place_id: ${updatedShop.place_id || 'MISSING'}`);
    console.log(`   state: ${updatedShop.state || 'MISSING'}`);
    console.log(`   language: ${updatedShop.language || 'MISSING'}`);
    console.log(`   place: ${updatedShop.place || 'MISSING'}`);
    console.log(`   location: ${updatedShop.location || 'MISSING'}\n`);

    return updatedShop;
  } catch (error) {
    console.error('❌ Error updating shop location fields:', error);
    throw error;
  }
}

// Get user ID from command line argument
const userId = process.argv[2];

if (!userId) {
  console.error('Usage: node scripts/update-shop-location-fields.js <user_id>');
  process.exit(1);
}

updateShopLocationFields(userId)
  .then((shop) => {
    if (shop) {
      process.exit(0);
    } else {
      process.exit(1);
    }
  })
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });

