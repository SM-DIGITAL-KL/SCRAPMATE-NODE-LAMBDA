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
      const uid = typeof userId === 'string' && !isNaN(userId) ? parseInt(userId) : userId;
      
      // Scan with pagination to find the matching shop
      let lastKey = null;
      
      do {
        const params = {
          TableName: TABLE_NAME,
          FilterExpression: 'user_id = :userId',
          ExpressionAttributeValues: {
            ':userId': uid
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

  static async create(data) {
    try {
      const client = getDynamoDBClient();
      const id = data.id || (Date.now() + Math.floor(Math.random() * 1000));
      
      // Base shop object with required fields
      const shop = {
        id: id,
        user_id: typeof data.user_id === 'string' && !isNaN(data.user_id) ? parseInt(data.user_id) : data.user_id,
        email: data.email || '',
        shopname: data.shopname || '',
        contact: typeof data.contact === 'string' && !isNaN(data.contact) ? parseInt(data.contact) : (data.contact || ''),
        address: data.address || '',
        location: data.location || '',
        state: data.state || '',
        place: data.place || '',
        language: data.language || '',
        profile_photo: data.profile_photo || '',
        shop_type: data.shop_type || 1,
        pincode: data.pincode || '',
        lat_log: data.lat_log || '',
        place_id: data.place_id || '',
        del_status: data.del_status || 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      // Add all other fields from data (including B2B signup fields)
      Object.keys(data).forEach(key => {
        if (data[key] !== undefined && !shop.hasOwnProperty(key)) {
          shop[key] = data[key];
        }
      });

      const command = new PutCommand({
        TableName: TABLE_NAME,
        Item: shop
      });

      await client.send(command);
      return shop;
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
      
      Object.keys(data).forEach((key, index) => {
        if (data[key] !== undefined) {
          const attrName = `#attr${index}`;
          const attrValue = `:val${index}`;
          updateExpressions.push(`${attrName} = ${attrValue}`);
          expressionAttributeNames[attrName] = key;
          expressionAttributeValues[attrValue] = data[key];
        }
      });
      
      if (updateExpressions.length === 0) {
        return { affectedRows: 0 };
      }
      
      updateExpressions.push('#updated = :updated');
      expressionAttributeNames['#updated'] = 'updated_at';
      expressionAttributeValues[':updated'] = new Date().toISOString();
      
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

  static async findByUserIds(userIds) {
    try {
      const client = getDynamoDBClient();
      const allShops = [];
      const batchSize = 10;
      
      for (let i = 0; i < userIds.length; i += batchSize) {
        const batch = userIds.slice(i, i + batchSize);
        const userIdsList = batch.map(uid => typeof uid === 'string' && !isNaN(uid) ? parseInt(uid) : uid);
        
        const command = new ScanCommand({
          TableName: TABLE_NAME,
          FilterExpression: `user_id IN (${userIdsList.map((_, idx) => `:uid${idx}`).join(', ')})`,
          ExpressionAttributeValues: userIdsList.reduce((acc, uid, idx) => {
            acc[`:uid${idx}`] = uid;
            return acc;
          }, {})
        });

        const response = await client.send(command);
        if (response.Items) {
          allShops.push(...response.Items);
        }
      }

      return allShops;
    } catch (err) {
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
