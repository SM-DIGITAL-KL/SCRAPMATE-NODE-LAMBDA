/**
 * Script to find nearby shops (R/S type) within 50km radius of a B2B user
 * Usage: node scripts/find-nearby-shops.js <user_id>
 */

const User = require('../models/User');
const Shop = require('../models/Shop');
const { getDynamoDBClient } = require('../config/dynamodb');
const { ScanCommand } = require('@aws-sdk/lib-dynamodb');

const userId = process.argv[2];

if (!userId) {
  console.error('❌ Please provide a user ID');
  console.log('Usage: node scripts/find-nearby-shops.js <user_id>');
  process.exit(1);
}

/**
 * Find nearby users by user type(s) within a radius
 */
async function findNearbyUsersByType(refLat, refLng, radius, userTypes, limit = null) {
  try {
    const client = getDynamoDBClient();
    const allUsers = [];
    let lastKey = null;

    // Build filter expression for user types
    const userTypeConditions = userTypes.map((_, idx) => `user_type = :type${idx}`).join(' OR ');
    const expressionAttributeValues = {};
    userTypes.forEach((type, idx) => {
      expressionAttributeValues[`:type${idx}`] = type;
    });
    expressionAttributeValues[':appType'] = 'vendor_app';
    expressionAttributeValues[':deleted'] = 2;

    // Scan all vendor_app users with specified user types
    do {
      const params = {
        TableName: 'users',
        FilterExpression: `app_type = :appType AND (${userTypeConditions}) AND (attribute_not_exists(del_status) OR del_status <> :deleted)`,
        ExpressionAttributeValues: expressionAttributeValues
      };

      if (lastKey) {
        params.ExclusiveStartKey = lastKey;
      }

      const command = new ScanCommand(params);
      const response = await client.send(command);

      if (response.Items) {
        allUsers.push(...response.Items);
      }

      lastKey = response.LastEvaluatedKey;
    } while (lastKey);

    console.log(`   Found ${allUsers.length} vendor_app users with types: ${userTypes.join(', ')}`);

    // Get shops for all users
    const usersWithShops = [];
    for (const user of allUsers) {
      try {
        const shop = await Shop.findByUserId(user.id);
        if (shop && shop.lat_log) {
          const [shopLat, shopLng] = shop.lat_log.split(',').map(Number);
          if (!isNaN(shopLat) && !isNaN(shopLng)) {
            usersWithShops.push({
              ...user,
              shop,
              latitude: shopLat,
              longitude: shopLng
            });
          }
        }
      } catch (err) {
        // Skip users without shops or with invalid locations
      }
    }

    console.log(`   Found ${usersWithShops.length} users with valid shop locations`);

    // Calculate distances and filter by radius
    const R = 6371; // Earth's radius in km
    const usersWithDistance = [];

    for (const user of usersWithShops) {
      const dLat = (user.latitude - refLat) * Math.PI / 180;
      const dLng = (user.longitude - refLng) * Math.PI / 180;
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(refLat * Math.PI / 180) * Math.cos(user.latitude * Math.PI / 180) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      const distance = R * c;

      if (distance <= radius) {
        usersWithDistance.push({
          user_id: user.id,
          name: user.name,
          mob_num: user.mob_num,
          user_type: user.user_type,
          shop_id: user.shop?.id,
          shop_name: user.shop?.name,
          latitude: user.latitude,
          longitude: user.longitude,
          distance: distance,
          distance_km: parseFloat(distance.toFixed(2))
        });
      }
    }

    // Sort by distance
    usersWithDistance.sort((a, b) => a.distance - b.distance);
    
    // Return all users if limit is null, otherwise return top N
    if (limit === null || limit === undefined) {
      return usersWithDistance;
    }
    return usersWithDistance.slice(0, limit);
  } catch (error) {
    console.error('❌ Error finding nearby users:', error);
    throw error;
  }
}

async function findNearbyShops() {
  try {
    console.log(`\n🔍 Finding nearby shops for B2B user with phone: ${userId}\n`);

    const client = getDynamoDBClient();
    const { ScanCommand } = require('@aws-sdk/lib-dynamodb');
    
    // First, try to find user by mobile number (since userId is a phone number)
    console.log(`   Searching for user by mobile number: ${userId}`);
    let user = null;
    let allUsers = [];
    
    // Try different phone number formats - scan without app_type filter first
    const phoneFormats = [
      String(userId),            // As string
      parseInt(userId),          // As number
      userId,                    // As provided
    ];
    
    for (const phoneFormat of phoneFormats) {
      console.log(`   Trying phone format: ${phoneFormat} (type: ${typeof phoneFormat})`);
      let scanKey = null;
      let foundUsers = [];
      
      do {
        const scanParams = {
          TableName: 'users',
          FilterExpression: 'mob_num = :mobNum',
          ExpressionAttributeValues: {
            ':mobNum': phoneFormat
          }
        };
        
        if (scanKey) {
          scanParams.ExclusiveStartKey = scanKey;
        }
        
        const scanCommand = new ScanCommand(scanParams);
        const response = await client.send(scanCommand);
        
        if (response.Items) {
          foundUsers.push(...response.Items);
        }
        scanKey = response.LastEvaluatedKey;
      } while (scanKey);
      
      if (foundUsers.length > 0) {
        console.log(`   ✅ Found ${foundUsers.length} user(s) with phone format: ${phoneFormat}`);
        allUsers = foundUsers;
        break;
      }
    }
    
    if (allUsers.length > 0) {
      // Filter for B2B users (S or SR type) or use any if not found
      const b2bUsers = allUsers.filter(u => u.user_type === 'S' || u.user_type === 'SR');
      if (b2bUsers.length > 0) {
        user = b2bUsers[0];
        const { password: _, ...userWithoutPassword } = user;
        user = userWithoutPassword;
        console.log(`   ✅ Found B2B user by mobile number: ID=${user.id}, Name=${user.name || 'N/A'}, Type=${user.user_type}`);
      } else {
        console.log(`   ⚠️ Found user(s) but not B2B type. Found types: ${[...new Set(allUsers.map(u => u.user_type))].join(', ')}`);
        // Use first user anyway
        user = allUsers[0];
        const { password: _, ...userWithoutPassword } = user;
        user = userWithoutPassword;
        console.log(`   Using user: ID=${user.id}, Type=${user.user_type}`);
      }
    }
    
    // If still not found, try by ID
    if (!user) {
      console.log(`   Trying to find user by ID: ${userId}`);
      user = await User.findById(userId);
      if (!user) {
        const userIdNum = parseInt(userId);
        if (!isNaN(userIdNum)) {
          user = await User.findById(userIdNum);
        }
      }
    }
    
    if (!user) {
      console.error(`❌ User ${userId} not found (tried as ID: string, number, and as mobile number)`);
      console.log(`\n🔍 Searching for B2B users (S type) to verify ID format...\n`);
      
      // List some B2B users to help identify the correct format
      const client = getDynamoDBClient();
      const { ScanCommand } = require('@aws-sdk/lib-dynamodb');
      
      // Try to find any user with this ID or mobile number
      const scanCommand = new ScanCommand({
        TableName: 'users',
        FilterExpression: '(id = :id OR mob_num = :mobNum) AND app_type = :appType',
        ExpressionAttributeValues: {
          ':id': parseInt(userId) || userId,
          ':mobNum': userId,
          ':appType': 'vendor_app'
        }
      });
      
      const response = await client.send(scanCommand);
      if (response.Items && response.Items.length > 0) {
        console.log(`   Found ${response.Items.length} user(s) matching criteria:\n`);
        response.Items.forEach((u, idx) => {
          console.log(`   ${idx + 1}. ID: ${u.id}, Name: ${u.name || 'N/A'}, Mobile: ${u.mob_num || 'N/A'}, Type: ${u.user_type || 'N/A'}`);
        });
        console.log(`\n   Please use the correct user ID from above.`);
      } else {
        // List some B2B/SR users to help identify the correct format
        const listCommand = new ScanCommand({
          TableName: 'users',
          FilterExpression: '(user_type = :typeS OR user_type = :typeSR) AND app_type = :appType',
          ExpressionAttributeValues: {
            ':typeS': 'S',
            ':typeSR': 'SR',
            ':appType': 'vendor_app'
          },
          Limit: 10
        });
        
        const listResponse = await client.send(listCommand);
        if (listResponse.Items && listResponse.Items.length > 0) {
          console.log(`   Found ${listResponse.Items.length} B2B users (S/SR type) as reference:\n`);
          listResponse.Items.forEach((u, idx) => {
            console.log(`   ${idx + 1}. ID: ${u.id}, Name: ${u.name || 'N/A'}, Mobile: ${u.mob_num || 'N/A'}, Type: ${u.user_type || 'N/A'}`);
          });
          console.log(`\n   Please verify the user ID format and try again.`);
        }
      }
      
      process.exit(1);
    }

    console.log(`✅ Found user: ${user.name || 'N/A'} (${user.mob_num || 'N/A'})`);
    console.log(`   User Type: ${user.user_type || 'N/A'}`);
    console.log(`   App Type: ${user.app_type || 'N/A'}\n`);

    // Get user's shop location
    let shop = await Shop.findByUserId(user.id);
    if (!shop) {
      console.log(`   ⚠️ No shop found for user ID: ${user.id}`);
      console.log(`   Trying to find shop by user_id in shops table...`);
      
      // Try to find shop directly
      const client = getDynamoDBClient();
      const { ScanCommand } = require('@aws-sdk/lib-dynamodb');
      let scanKey = null;
      let shops = [];
      
      do {
        const scanParams = {
          TableName: 'shops',
          FilterExpression: 'user_id = :userId',
          ExpressionAttributeValues: {
            ':userId': user.id
          }
        };
        
        if (scanKey) {
          scanParams.ExclusiveStartKey = scanKey;
        }
        
        const scanCommand = new ScanCommand(scanParams);
        const response = await client.send(scanCommand);
        
        if (response.Items) {
          shops.push(...response.Items);
        }
        scanKey = response.LastEvaluatedKey;
      } while (scanKey);
      
      if (shops.length > 0) {
        shop = shops[0];
        console.log(`   ✅ Found shop: ID=${shop.id}, Name=${shop.name || shop.shopname || 'N/A'}`);
      }
    }
    
    if (!shop) {
      console.error(`❌ User ${user.id} (${user.name}) does not have a shop`);
      console.log(`   Cannot find nearby shops without a shop location.`);
      console.log(`\n   User Details:`);
      console.log(`   - ID: ${user.id}`);
      console.log(`   - Name: ${user.name || 'N/A'}`);
      console.log(`   - Mobile: ${user.mob_num || 'N/A'}`);
      console.log(`   - Type: ${user.user_type || 'N/A'}`);
      process.exit(1);
    }
    
    if (!shop.lat_log) {
      console.error(`❌ User ${user.id} has a shop but no location (lat_log) set`);
      console.log(`   Shop Details:`);
      console.log(`   - Shop ID: ${shop.id}`);
      console.log(`   - Shop Name: ${shop.name || shop.shopname || 'N/A'}`);
      console.log(`   - Address: ${shop.address || 'N/A'}`);
      console.log(`   - Location: ${shop.lat_log || 'NOT SET'}`);
      console.log(`\n   ⚠️ Cannot find nearby shops without shop location coordinates.`);
      console.log(`   Please set the shop location (lat_log) in the shops table.`);
      process.exit(1);
    }

    const [lat, lng] = shop.lat_log.split(',').map(Number);
    if (isNaN(lat) || isNaN(lng)) {
      console.error(`❌ Invalid shop location format: ${shop.lat_log}`);
      console.log(`   Expected format: "latitude,longitude" (e.g., "10.1234,76.5678")`);
      process.exit(1);
    }

    console.log(`📍 User's shop location: ${lat}, ${lng}`);
    console.log(`   Shop Name: ${shop.name || 'N/A'}`);
    console.log(`   Shop Address: ${shop.address || 'N/A'}\n`);

    // Find all shops for this user (SR users can have both R and S type shops)
    console.log(`🔍 Finding user's own shops...`);
    const userShops = await Shop.findAllByUserId(user.id);
    console.log(`   Found ${userShops.length} shop(s) for user ${user.id}`);
    
    const userOwnShops = [];
    for (const userShop of userShops) {
      if (userShop.lat_log) {
        const [shopLat, shopLng] = userShop.lat_log.split(',').map(Number);
        if (!isNaN(shopLat) && !isNaN(shopLng)) {
          // Determine user_type based on shop_type
          // shop_type 1 = B2B (S), shop_type 2 = Retailer/Door Step Buyer (R), shop_type 3 = Retailer B2C (R)
          let shopUserType = null;
          if (userShop.shop_type === 1) {
            shopUserType = 'S';
          } else if (userShop.shop_type === 2 || userShop.shop_type === 3) {
            shopUserType = 'R';
          } else {
            // Fallback: use user's user_type if shop_type is not set
            shopUserType = user.user_type === 'SR' ? 'R' : user.user_type;
          }
          
          // Calculate distance (should be 0 or very small for own shops)
          const R = 6371; // Earth's radius in km
          const dLat = (shopLat - lat) * Math.PI / 180;
          const dLng = (shopLng - lng) * Math.PI / 180;
          const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat * Math.PI / 180) * Math.cos(shopLat * Math.PI / 180) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
          const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
          const distance = R * c;
          
          userOwnShops.push({
            user_id: user.id,
            name: user.name,
            mob_num: user.mob_num,
            user_type: shopUserType,
            shop_id: userShop.id,
            shop_name: userShop.name || userShop.shopname,
            latitude: shopLat,
            longitude: shopLng,
            distance: distance,
            distance_km: parseFloat(distance.toFixed(2)),
            is_own_shop: true
          });
        }
      }
    }
    
    if (userOwnShops.length > 0) {
      console.log(`   ✅ Found ${userOwnShops.length} user's own shop(s) with location:`);
      userOwnShops.forEach((s, idx) => {
        console.log(`      ${idx + 1}. Shop ID: ${s.shop_id}, Type: ${s.user_type}, Name: ${s.shop_name || 'N/A'}`);
      });
    }
    console.log('');

    // Find nearby R and S type shops within 50km (excluding user's own shops)
    console.log(`🔍 Finding nearby shops (R/S type) within 50km radius...\n`);
    const nearbyShops = await findNearbyUsersByType(lat, lng, 50, ['R', 'S'], null);
    
    // Filter out user's own shops from nearby shops (to avoid duplicates)
    const userShopIds = new Set(userOwnShops.map(s => s.shop_id));
    const otherNearbyShops = nearbyShops.filter(s => !userShopIds.has(s.shop_id));
    
    // Combine user's own shops with other nearby shops
    const allShops = [...userOwnShops, ...otherNearbyShops];
    
    // Sort by distance
    allShops.sort((a, b) => a.distance - b.distance);

    console.log(`\n✅ Found ${allShops.length} shops (including user's own shops) within 50km:\n`);

    if (allShops.length === 0) {
      console.log('   No shops found within 50km radius');
      return;
    }

    // Group by user type
    const rTypeShops = allShops.filter(s => s.user_type === 'R');
    const sTypeShops = allShops.filter(s => s.user_type === 'S');

    console.log(`📊 Summary:`);
    console.log(`   Total: ${allShops.length} shops`);
    console.log(`   User's own shops: ${userOwnShops.length}`);
    console.log(`   Other nearby shops: ${otherNearbyShops.length}`);
    console.log(`   R type (B2C): ${rTypeShops.length} shops`);
    console.log(`   S type (B2B): ${sTypeShops.length} shops\n`);

    // Display all shops
    console.log(`📋 All Shops (sorted by distance):\n`);
    allShops.forEach((shop, index) => {
      const isOwn = shop.is_own_shop ? ' (OWN SHOP)' : '';
      console.log(`${index + 1}. ${shop.shop_name || shop.name || 'N/A'}${isOwn}`);
      console.log(`   User ID: ${shop.user_id}`);
      console.log(`   Name: ${shop.name || 'N/A'}`);
      console.log(`   Mobile: ${shop.mob_num || 'N/A'}`);
      console.log(`   User Type: ${shop.user_type}`);
      console.log(`   Shop ID: ${shop.shop_id || 'N/A'}`);
      console.log(`   Location: ${shop.latitude}, ${shop.longitude}`);
      console.log(`   Distance: ${shop.distance_km} km`);
      console.log('');
    });

    // Export to JSON
    const output = {
      user_id: userId,
      user_name: user.name,
      user_location: {
        latitude: lat,
        longitude: lng,
        shop_name: shop.name,
        shop_address: shop.address
      },
      search_radius_km: 50,
      total_shops_found: allShops.length,
      own_shops_count: userOwnShops.length,
      other_nearby_shops_count: otherNearbyShops.length,
      r_type_count: rTypeShops.length,
      s_type_count: sTypeShops.length,
      shops: allShops
    };

    console.log(`\n📄 JSON Output:\n`);
    console.log(JSON.stringify(output, null, 2));

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

// Run the script
findNearbyShops();

