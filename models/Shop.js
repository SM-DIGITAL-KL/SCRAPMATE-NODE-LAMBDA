const { getDynamoDBClient } = require('../config/dynamodb');
const { GetCommand, PutCommand, UpdateCommand, ScanCommand, BatchGetCommand, BatchWriteCommand } = require('@aws-sdk/lib-dynamodb');

const TABLE_NAME = 'shops';

class Shop {
  static async findById(id) {
    try {
      const client = getDynamoDBClient();
      const shopId = typeof id === 'string' && !isNaN(id) ? parseInt(id) : id;

      const command = new GetCommand({
        TableName: TABLE_NAME,
        Key: { id: shopId }
      });

      const response = await client.send(command);
      return response.Item || null;
    } catch (err) {
      throw err;
    }
  }

  static async findByUserId(userId) {
    try {
      const client = getDynamoDBClient();
      // DynamoDB is strict about data types - check if user_id is stored as string or number
      // Try both string and number formats to handle inconsistent data types
      const uidNum = typeof userId === 'string' && !isNaN(userId) ? parseInt(userId) : userId;
      const uidStr = String(userId);

      // Scan with pagination to find the matching shop - try number first
      let lastKey = null;

      do {
        const params = {
          TableName: TABLE_NAME,
          FilterExpression: 'user_id = :userId',
          ExpressionAttributeValues: {
            ':userId': uidNum
          }
        };

        if (lastKey) {
          params.ExclusiveStartKey = lastKey;
        }

        const command = new ScanCommand(params);
        const response = await client.send(command);

        if (response.Items && response.Items.length > 0) {
          return response.Items[0];
        }

        lastKey = response.LastEvaluatedKey;
      } while (lastKey);

      // If not found with number, try string
      lastKey = null;
      do {
        const params = {
          TableName: TABLE_NAME,
          FilterExpression: 'user_id = :userId',
          ExpressionAttributeValues: {
            ':userId': uidStr
          }
        };

        if (lastKey) {
          params.ExclusiveStartKey = lastKey;
        }

        const command = new ScanCommand(params);
        const response = await client.send(command);

        if (response.Items && response.Items.length > 0) {
          return response.Items[0];
        }

        lastKey = response.LastEvaluatedKey;
      } while (lastKey);

      return null;
    } catch (err) {
      console.error('Shop.findByUserId error:', err);
      throw err;
    }
  }

  /**
   * Find all shops for a user (useful for SR users who may have both B2C and B2B shops)
   * @param {string|number} userId - User ID
   * @returns {Promise<Array>} Array of all shops for the user
   */
  static async findAllByUserId(userId) {
    try {
      const client = getDynamoDBClient();
      // DynamoDB is strict about data types - check if user_id is stored as string or number
      // Try both string and number formats to handle inconsistent data types
      const uidNum = typeof userId === 'string' && !isNaN(userId) ? parseInt(userId) : userId;
      const uidStr = String(userId);

      const allShops = [];
      let lastKey = null;
      const foundShopIds = new Set(); // Track found shop IDs to avoid duplicates

      // First, try querying with number type
      do {
        const params = {
          TableName: TABLE_NAME,
          FilterExpression: 'user_id = :userId',
          ExpressionAttributeValues: {
            ':userId': uidNum
          }
        };

        if (lastKey) {
          params.ExclusiveStartKey = lastKey;
        }

        const command = new ScanCommand(params);
        const response = await client.send(command);

        if (response.Items && response.Items.length > 0) {
          response.Items.forEach(shop => {
            if (!foundShopIds.has(shop.id)) {
              allShops.push(shop);
              foundShopIds.add(shop.id);
            }
          });
        }

        lastKey = response.LastEvaluatedKey;
      } while (lastKey);

      // Also try querying with string type (in case user_id is stored as string)
      lastKey = null;
      do {
        const params = {
          TableName: TABLE_NAME,
          FilterExpression: 'user_id = :userId',
          ExpressionAttributeValues: {
            ':userId': uidStr
          }
        };

        if (lastKey) {
          params.ExclusiveStartKey = lastKey;
        }

        const command = new ScanCommand(params);
        const response = await client.send(command);

        if (response.Items && response.Items.length > 0) {
          response.Items.forEach(shop => {
            if (!foundShopIds.has(shop.id)) {
              allShops.push(shop);
              foundShopIds.add(shop.id);
            }
          });
        }

        lastKey = response.LastEvaluatedKey;
      } while (lastKey);

      return allShops;
    } catch (err) {
      console.error('Shop.findAllByUserId error:', err);
      throw err;
    }
  }

  /**
   * Find shops by contact phone number
   * @param {string|number} contact - Contact phone number
   * @param {number} userId - Optional: Exclude shops belonging to this user_id
   * @returns {Promise<Array>} Array of shops with matching contact
   */
  static async findByContact(contact, excludeUserId = null) {
    try {
      const client = getDynamoDBClient();
      const contactNum = typeof contact === 'string' && !isNaN(contact) ? parseInt(contact) : contact;

      // Scan with pagination to find shops with matching contact
      let lastKey = null;
      const allShops = [];

      do {
        const params = {
          TableName: TABLE_NAME,
          FilterExpression: 'contact = :contact',
          ExpressionAttributeValues: {
            ':contact': contactNum
          }
        };

        if (lastKey) {
          params.ExclusiveStartKey = lastKey;
        }

        const command = new ScanCommand(params);
        const response = await client.send(command);

        if (response.Items) {
          allShops.push(...response.Items);
        }

        lastKey = response.LastEvaluatedKey;
      } while (lastKey);

      // Filter out shops belonging to excludeUserId if provided
      if (excludeUserId !== null) {
        const excludeUid = typeof excludeUserId === 'string' && !isNaN(excludeUserId) ? parseInt(excludeUserId) : excludeUserId;
        return allShops.filter(shop => shop.user_id !== excludeUid);
      }

      return allShops;
    } catch (err) {
      console.error('Shop.findByContact error:', err);
      throw err;
    }
  }

  static async create(data) {
    try {
      const client = getDynamoDBClient();
      const id = data.id || (Date.now() + Math.floor(Math.random() * 1000));

      // Base shop object with required fields
      // Validate user_id conversion
      let validatedUserId = data.user_id;
      if (typeof data.user_id === 'string' && data.user_id.trim() !== '' && !isNaN(data.user_id)) {
        const parsed = parseInt(data.user_id);
        if (!isNaN(parsed) && isFinite(parsed)) {
          validatedUserId = parsed;
        }
      }
      
      // Validate contact conversion - only convert if it's a non-empty numeric string
      let validatedContact = data.contact || '';
      if (typeof data.contact === 'string' && data.contact.trim() !== '') {
        if (!isNaN(data.contact) && data.contact.trim() !== '') {
          const parsed = parseInt(data.contact);
          if (!isNaN(parsed) && isFinite(parsed)) {
            validatedContact = parsed;
          }
        }
      }
      
      // Validate shop_type to ensure it's a valid number
      let validatedShopType = 1;
      if (data.shop_type !== undefined && data.shop_type !== null) {
        const shopType = typeof data.shop_type === 'string' ? parseInt(data.shop_type) : data.shop_type;
        if (typeof shopType === 'number' && !isNaN(shopType) && isFinite(shopType)) {
          validatedShopType = shopType;
        }
      }
      
      // Validate del_status to ensure it's a valid number
      let validatedDelStatus = 1;
      if (data.del_status !== undefined && data.del_status !== null) {
        const delStatus = typeof data.del_status === 'string' ? parseInt(data.del_status) : data.del_status;
        if (typeof delStatus === 'number' && !isNaN(delStatus) && isFinite(delStatus)) {
          validatedDelStatus = delStatus;
        }
      }
      
      const shop = {
        id: id,
        user_id: validatedUserId,
        email: data.email || '',
        shopname: data.shopname || '',
        contact: validatedContact,
        address: data.address || '',
        location: data.location || '',
        state: data.state || '',
        place: data.place || '',
        language: data.language || '',
        profile_photo: data.profile_photo || '',
        shop_type: validatedShopType,
        pincode: data.pincode || '',
        lat_log: data.lat_log || '',
        place_id: data.place_id || '',
        del_status: validatedDelStatus,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      // Handle latitude and longitude separately with validation
      if (data.latitude !== undefined && data.latitude !== null) {
        const lat = typeof data.latitude === 'string' ? parseFloat(data.latitude) : data.latitude;
        if (typeof lat === 'number' && !isNaN(lat) && isFinite(lat)) {
          // Limit precision to 8 decimal places to prevent floating-point issues
          shop.latitude = Number(lat.toFixed(8));
          console.log(`✅ Shop.create: Validated latitude: ${shop.latitude}`);
        } else {
          console.warn(`⚠️ Shop.create: Invalid latitude value: ${data.latitude}, skipping`);
        }
      }
      if (data.longitude !== undefined && data.longitude !== null) {
        const lng = typeof data.longitude === 'string' ? parseFloat(data.longitude) : data.longitude;
        if (typeof lng === 'number' && !isNaN(lng) && isFinite(lng)) {
          // Limit precision to 8 decimal places to prevent floating-point issues
          shop.longitude = Number(lng.toFixed(8));
          console.log(`✅ Shop.create: Validated longitude: ${shop.longitude}`);
        } else {
          console.warn(`⚠️ Shop.create: Invalid longitude value: ${data.longitude}, skipping`);
        }
      }

      // Add all other fields from data (including B2B signup fields)
      // But validate numeric fields to prevent NaN from reaching DynamoDB
      Object.keys(data).forEach(key => {
        if (data[key] !== undefined && !shop.hasOwnProperty(key)) {
          let value = data[key];
          
          // Skip null values
          if (value === null) {
            return;
          }
          
          // Validate numeric fields to prevent NaN
          if (typeof value === 'number') {
            if (isNaN(value) || !isFinite(value)) {
              console.warn(`⚠️ Shop.create: Skipping invalid numeric value for ${key}: ${value}`);
              return; // Skip this field
            }
          }
          
          // Handle string-to-number conversions that might produce NaN
          if (typeof value === 'string' && !isNaN(value) && value.trim() !== '') {
            // Check if it's a numeric string (like "123", "45.67") but don't auto-convert
            // Only convert if it's clearly meant to be a number (already handled in specific cases above)
          }
          
          shop[key] = value;
        }
      });

      // Final validation: Check all numeric fields in shop object before sending to DynamoDB
      const cleanedShop = {};
      Object.keys(shop).forEach(key => {
        const value = shop[key];
        
        // Skip null/undefined
        if (value === null || value === undefined) {
          return;
        }
        
        // Validate numeric fields - skip if NaN or Infinity
        if (typeof value === 'number') {
          if (isNaN(value) || !isFinite(value)) {
            console.error(`❌ Shop.create: CRITICAL - Found invalid numeric value in final shop object for ${key}: ${value}`);
            console.error(`   Full shop object keys:`, Object.keys(shop));
            console.error(`   Problematic value type: ${typeof value}, value: ${value}`);
            throw new Error(`Cannot create shop: Invalid numeric value (NaN/Infinity) detected for ${key}: ${value}`);
          }
        }
        
        cleanedShop[key] = value;
      });

      console.log(`🔍 Shop.create: Final cleaned shop object keys:`, Object.keys(cleanedShop));
      console.log(`🔍 Shop.create: Checking numeric fields in cleanedShop:`);
      Object.keys(cleanedShop).forEach(key => {
        const val = cleanedShop[key];
        if (typeof val === 'number') {
          console.log(`   ${key}: ${val} (type: ${typeof val}, isNaN: ${isNaN(val)}, isFinite: ${isFinite(val)})`);
        }
      });

      const command = new PutCommand({
        TableName: TABLE_NAME,
        Item: cleanedShop
      });

      await client.send(command);
      return cleanedShop;
    } catch (err) {
      throw err;
    }
  }

  static async update(id, data) {
    try {
      const client = getDynamoDBClient();
      const shopId = typeof id === 'string' && !isNaN(id) ? parseInt(id) : id;

      const updateExpressions = [];
      const expressionAttributeValues = {};
      const expressionAttributeNames = {};

      // Build update expressions, filtering out invalid values
      Object.keys(data).forEach((key, index) => {
        if (data[key] === undefined || data[key] === null) {
          return; // Skip undefined/null values
        }
        
        let value = data[key];
        let shouldSkip = false;
        
        // Validate numeric fields to prevent NaN from reaching DynamoDB
        if (typeof value === 'number') {
          if (isNaN(value) || !isFinite(value)) {
            console.warn(`⚠️ Shop.update: Skipping invalid numeric value for ${key}: ${value} (NaN or Infinity)`);
            console.warn(`   Full data object:`, JSON.stringify(data, null, 2));
            shouldSkip = true;
          }
        }
        
        // Validate if value is string that should be a number (for latitude/longitude)
        if (!shouldSkip && (key === 'latitude' || key === 'longitude') && typeof value === 'string') {
          const numValue = parseFloat(value);
          if (isNaN(numValue) || !isFinite(numValue)) {
            console.warn(`⚠️ Shop.update: Skipping invalid numeric string value for ${key}: ${value}`);
            shouldSkip = true;
          } else {
            value = numValue; // Convert to number
          }
        }
        
        if (shouldSkip) {
          return; // Skip this field
        }
        
        const attrName = `#attr${index}`;
        const attrValue = `:val${index}`;
        updateExpressions.push(`${attrName} = ${attrValue}`);
        expressionAttributeNames[attrName] = key;
        expressionAttributeValues[attrValue] = value;
      });

      if (updateExpressions.length === 0) {
        return { affectedRows: 0 };
      }

      // Final validation: check all expression attribute values for NaN/Infinity
      Object.keys(expressionAttributeValues).forEach(key => {
        const value = expressionAttributeValues[key];
        if (typeof value === 'number') {
          if (isNaN(value) || !isFinite(value)) {
            const fieldName = Object.keys(expressionAttributeNames).find(
              nameKey => expressionAttributeValues[key] === value
            ) || 'unknown';
            console.error(`❌ Shop.update: CRITICAL - Found NaN/Infinity in expressionAttributeValues: ${key} = ${value}`);
            console.error(`   Field name: ${fieldName}`);
            console.error(`   All expressionAttributeValues:`, JSON.stringify(expressionAttributeValues, null, 2));
            throw new Error(`Cannot update shop: Invalid numeric value (NaN/Infinity) detected for ${key}: ${value}`);
          }
        }
      });

      updateExpressions.push('#updated = :updated');
      expressionAttributeNames['#updated'] = 'updated_at';
      expressionAttributeValues[':updated'] = new Date().toISOString();

      console.log(`🔍 Shop.update: Final check - expressionAttributeValues:`, JSON.stringify(expressionAttributeValues, null, 2));
      
      const command = new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { id: shopId },
        UpdateExpression: `SET ${updateExpressions.join(', ')}`,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues
      });

      await client.send(command);
      return { affectedRows: 1 };
    } catch (err) {
      throw err;
    }
  }

  // Get shops by location (Note: DynamoDB doesn't support geospatial queries natively)
  // This implementation scans and filters in memory - consider using a geospatial index for production
  static async getShopsByLocation(refLat, refLng, matchRadius, shopIds = []) {
    try {
      const client = getDynamoDBClient();
      const allShops = [];
      let lastKey = null;

      // Scan all shops (or filter by shopIds if provided)
      do {
        const params = {
          TableName: TABLE_NAME,
          FilterExpression: 'del_status = :status',
          ExpressionAttributeValues: {
            ':status': 1
          }
        };

        if (lastKey) {
          params.ExclusiveStartKey = lastKey;
        }

        const command = new ScanCommand(params);
        const response = await client.send(command);

        if (response.Items) {
          allShops.push(...response.Items);
        }

        lastKey = response.LastEvaluatedKey;
      } while (lastKey);

      // Filter by shopIds if provided
      let filteredShops = shopIds.length > 0
        ? allShops.filter(shop => shopIds.includes(shop.id))
        : allShops;

      // Calculate distance and filter by radius
      const shopsWithDistance = filteredShops
        .map(shop => {
          if (!shop.lat_log) return null;
          const [lat, lng] = shop.lat_log.split(',').map(Number);
          if (!lat || !lng) return null;

          // Haversine formula for distance calculation
          const R = 6371; // Earth's radius in km
          const dLat = (lat - refLat) * Math.PI / 180;
          const dLng = (lng - refLng) * Math.PI / 180;
          const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(refLat * Math.PI / 180) * Math.cos(lat * Math.PI / 180) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
          const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
          const distance = R * c;

          return { ...shop, distance };
        })
        .filter(shop => shop !== null && shop.distance <= matchRadius)
        .sort((a, b) => a.distance - b.distance);

      return shopsWithDistance;
    } catch (err) {
      throw err;
    }
  }

  // Batch operations
  static async findByIds(ids) {
    try {
      const client = getDynamoDBClient();
      const allShops = [];
      const batchSize = 100;

      for (let i = 0; i < ids.length; i += batchSize) {
        const batch = ids.slice(i, i + batchSize);
        const keys = batch.map(id => ({
          id: typeof id === 'string' && !isNaN(id) ? parseInt(id) : id
        }));

        const command = new BatchGetCommand({
          RequestItems: {
            [TABLE_NAME]: {
              Keys: keys
            }
          }
        });

        const response = await client.send(command);
        if (response.Responses && response.Responses[TABLE_NAME]) {
          allShops.push(...response.Responses[TABLE_NAME]);
        }
      }

      return allShops;
    } catch (err) {
      throw err;
    }
  }

  /**
   * OPTIMIZED: Batch fetch shops by multiple user IDs
   * Uses Scan with IN operator (more efficient than N individual Scans)
   * 
   * Note: For even better performance, consider creating a GSI on user_id
   * which would allow Query instead of Scan (95%+ RCU reduction)
   * 
   * @param {Array<string|number>} userIds - Array of user IDs
   * @returns {Promise<Array>} Array of shops
   */
  static async findByUserIds(userIds) {
    try {
      const client = getDynamoDBClient();
      const allShops = [];
      const foundShopIds = new Set(); // Track found shop IDs to avoid duplicates
      const foundUserIds = new Set(); // Track which user_ids we've found shops for

      if (!userIds || userIds.length === 0) {
        return [];
      }

      // OPTIMIZED: Process in batches to avoid expression size limits
      // DynamoDB FilterExpression supports IN operator, but has size limits
      const batchSize = 10;

      for (let i = 0; i < userIds.length; i += batchSize) {
        const batch = userIds.slice(i, i + batchSize);
        const userIdsList = batch.map(uid => typeof uid === 'string' && !isNaN(uid) ? parseInt(uid) : uid);

        // Build FilterExpression with IN operator
        const attributeValues = {};
        const placeholders = userIdsList.map((uid, idx) => {
          const placeholder = `:uid${i + idx}`;
          attributeValues[placeholder] = uid;
          return placeholder;
        });

        const command = new ScanCommand({
          TableName: TABLE_NAME,
          FilterExpression: `user_id IN (${placeholders.join(', ')})`,
          ExpressionAttributeValues: attributeValues
        });

        const response = await client.send(command);
        if (response.Items) {
          response.Items.forEach(shop => {
            if (!foundShopIds.has(shop.id)) {
              allShops.push(shop);
              foundShopIds.add(shop.id);
              // Track which user_ids we've found shops for
              const shopUserId = shop.user_id ? (typeof shop.user_id === 'string' ? parseInt(shop.user_id) : shop.user_id) : null;
              if (shopUserId) {
                foundUserIds.add(shopUserId);
              }
            }
          });
        }

        // Handle pagination if needed
        let lastKey = response.LastEvaluatedKey;
        while (lastKey) {
          const paginatedCommand = new ScanCommand({
            TableName: TABLE_NAME,
            FilterExpression: `user_id IN (${placeholders.join(', ')})`,
            ExpressionAttributeValues: attributeValues,
            ExclusiveStartKey: lastKey
          });

          const paginatedResponse = await client.send(paginatedCommand);
          if (paginatedResponse.Items) {
            paginatedResponse.Items.forEach(shop => {
              if (!foundShopIds.has(shop.id)) {
                allShops.push(shop);
                foundShopIds.add(shop.id);
                const shopUserId = shop.user_id ? (typeof shop.user_id === 'string' ? parseInt(shop.user_id) : shop.user_id) : null;
                if (shopUserId) {
                  foundUserIds.add(shopUserId);
                }
              }
            });
          }
          lastKey = paginatedResponse.LastEvaluatedKey;
        }
      }

      console.log(`✅ Shop.findByUserIds: Found ${allShops.length} shop(s) for ${userIds.length} user ID(s)`);
      return allShops;
    } catch (err) {
      console.error('Shop.findByUserIds error:', err);
      throw err;
    }
  }

  static async batchCreate(shops) {
    try {
      const client = getDynamoDBClient();
      const batchSize = 25;
      const allResults = [];

      for (let i = 0; i < shops.length; i += batchSize) {
        const batch = shops.slice(i, i + batchSize);
        const putRequests = batch.map(shop => ({
          PutRequest: {
            Item: {
              ...shop,
              id: shop.id || (Date.now() + Math.floor(Math.random() * 1000)),
              created_at: shop.created_at || new Date().toISOString(),
              updated_at: shop.updated_at || new Date().toISOString()
            }
          }
        }));

        const command = new BatchWriteCommand({
          RequestItems: {
            [TABLE_NAME]: putRequests
          }
        });

        const response = await client.send(command);
        allResults.push(response);
      }

      return allResults;
    } catch (err) {
      throw err;
    }
  }

  // Count shops by del_status (optimized with Select: "COUNT")
  static async countByDelStatus(delStatus = 1) {
    try {
      const client = getDynamoDBClient();
      let lastKey = null;
      let count = 0;

      do {
        const params = {
          TableName: TABLE_NAME,
          FilterExpression: 'del_status = :status',
          ExpressionAttributeValues: {
            ':status': delStatus
          },
          Select: 'COUNT'
        };

        if (lastKey) {
          params.ExclusiveStartKey = lastKey;
        }

        const command = new ScanCommand(params);
        const response = await client.send(command);

        // With Select: "COUNT", response.Count contains the count
        count += response.Count || 0;

        lastKey = response.LastEvaluatedKey;
      } while (lastKey);

      return count;
    } catch (err) {
      throw err;
    }
  }

  // Get all shops (for admin panel)
  static async getAll(limit = null) {
    try {
      const client = getDynamoDBClient();
      const allShops = [];
      let lastKey = null;

      do {
        const params = {
          TableName: TABLE_NAME
        };

        if (limit && allShops.length >= limit) break;
        if (lastKey) {
          params.ExclusiveStartKey = lastKey;
        }

        const command = new ScanCommand(params);
        const response = await client.send(command);

        if (response.Items) {
          allShops.push(...response.Items);
        }

        lastKey = response.LastEvaluatedKey;
      } while (lastKey && (!limit || allShops.length < limit));

      return limit ? allShops.slice(0, limit) : allShops;
    } catch (err) {
      throw err;
    }
  }

  // Count pending B2B shop approvals
  // B2B shops are identified by shop_type = 1 (Industrial) or 4 (Wholesaler)
  // Pending approval = shops with B2B signup fields (company_name, gst_number) but approval_status != 'approved'
  static async countPendingB2BApprovals() {
    try {
      const client = getDynamoDBClient();
      let lastKey = null;
      let count = 0;

      do {
        // Scan all shops and filter in memory (DynamoDB FilterExpression doesn't support OR well)
        const params = {
          TableName: TABLE_NAME
        };

        if (lastKey) {
          params.ExclusiveStartKey = lastKey;
        }

        const command = new ScanCommand(params);
        const response = await client.send(command);

        if (response.Items) {
          // Filter for B2B shops (shop_type 1 or 4) with B2B signup fields but not approved
          const pendingShops = response.Items.filter(shop => {
            const isB2BShop = shop.shop_type === 1 || shop.shop_type === 4;
            const hasB2BFields = shop.company_name || shop.gst_number || shop.pan_number || shop.business_license_url;
            const isNotApproved = !shop.approval_status || shop.approval_status !== 'approved';
            return isB2BShop && hasB2BFields && isNotApproved;
          });
          count += pendingShops.length;
        }

        lastKey = response.LastEvaluatedKey;
      } while (lastKey);

      return count;
    } catch (err) {
      console.error('Shop.countPendingB2BApprovals error:', err);
      throw err;
    }
  }

  // Count door step buyers (shop_type = 2) (optimized with Select: "COUNT")
  static async countDoorStepBuyers() {
    try {
      const client = getDynamoDBClient();
      let lastKey = null;
      let count = 0;

      do {
        const params = {
          TableName: TABLE_NAME,
          FilterExpression: 'shop_type = :shopType',
          ExpressionAttributeValues: {
            ':shopType': 2
          },
          Select: 'COUNT'
        };

        if (lastKey) {
          params.ExclusiveStartKey = lastKey;
        }

        const command = new ScanCommand(params);
        const response = await client.send(command);

        // With Select: "COUNT", response.Count contains the count
        count += response.Count || 0;

        lastKey = response.LastEvaluatedKey;
      } while (lastKey);

      return count;
    } catch (err) {
      console.error('Shop.countDoorStepBuyers error:', err);
      throw err;
    }
  }

  // Count v2 door step buyers (shop_type = 2 AND user has app_version = 'v2')
  static async countV2DoorStepBuyers() {
    try {
      const User = require('./User');
      const client = getDynamoDBClient();
      let lastKey = null;
      let count = 0;

      do {
        const params = {
          TableName: TABLE_NAME,
          FilterExpression: 'shop_type = :shopType',
          ExpressionAttributeValues: {
            ':shopType': 2
          }
        };

        if (lastKey) {
          params.ExclusiveStartKey = lastKey;
        }

        const command = new ScanCommand(params);
        const response = await client.send(command);

        if (response.Items) {
          // For each door step buyer shop, check if the user is v2
          for (const shop of response.Items) {
            if (shop.user_id) {
              try {
                const user = await User.findById(shop.user_id);
                if (user && user.app_version === 'v2') {
                  count++;
                }
              } catch (userErr) {
                console.error(`Error fetching user ${shop.user_id} for shop ${shop.id}:`, userErr);
                // Continue to next shop if user lookup fails
              }
            }
          }
        }

        lastKey = response.LastEvaluatedKey;
      } while (lastKey);

      return count;
    } catch (err) {
      console.error('Shop.countV2DoorStepBuyers error:', err);
      throw err;
    }
  }
}

module.exports = Shop;
