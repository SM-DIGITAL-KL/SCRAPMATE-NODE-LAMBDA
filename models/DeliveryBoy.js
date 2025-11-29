const { getDynamoDBClient } = require('../config/dynamodb');
const { GetCommand, PutCommand, UpdateCommand, ScanCommand, BatchGetCommand, BatchWriteCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');

const TABLE_NAME = 'delivery_boy';

class DeliveryBoy {
  // Find by ID
  static async findById(id) {
    try {
      const client = getDynamoDBClient();
      const itemId = typeof id === 'string' && !isNaN(id) ? parseInt(id) : id;
      
      const command = new GetCommand({
        TableName: TABLE_NAME,
        Key: { id: itemId }
      });

      const response = await client.send(command);
      return response.Item || null;
    } catch (err) {
      throw err;
    }
  }

  // Batch find by IDs
  static async findByIds(ids) {
    try {
      const client = getDynamoDBClient();
      const allItems = [];
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
          allItems.push(...response.Responses[TABLE_NAME]);
        }
      }

      return allItems;
    } catch (err) {
      throw err;
    }
  }

  // Create
  static async create(data) {
    try {
      const client = getDynamoDBClient();
      const id = data.id || (Date.now() + Math.floor(Math.random() * 1000));
      
      // Ensure user_id is a number (not string) for proper querying
      const userId = data.user_id;
      const userIdNum = typeof userId === 'string' && !isNaN(userId) 
        ? parseInt(userId) 
        : (typeof userId === 'number' ? userId : parseInt(userId));
      
      const item = {
        ...data,
        id: id,
        user_id: userIdNum, // Ensure it's always a number
        created_at: data.created_at || new Date().toISOString(),
        updated_at: data.updated_at || new Date().toISOString()
      };

      const command = new PutCommand({
        TableName: TABLE_NAME,
        Item: item
      });

      await client.send(command);
      return item;
    } catch (err) {
      throw err;
    }
  }

  // Update
  static async update(id, data) {
    try {
      const client = getDynamoDBClient();
      const itemId = typeof id === 'string' && !isNaN(id) ? parseInt(id) : id;
      
      const updateExpressions = [];
      const expressionAttributeValues = {};
      const expressionAttributeNames = {};
      
      Object.keys(data).forEach((key, index) => {
        if (data[key] !== undefined) {
          const attrName = '#attr' + index;
          const attrValue = ':val' + index;
          updateExpressions.push(attrName + ' = ' + attrValue);
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
        Key: { id: itemId },
        UpdateExpression: 'SET ' + updateExpressions.join(', '),
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues
      });

      await client.send(command);
      return { affectedRows: 1 };
    } catch (err) {
      throw err;
    }
  }

  // Batch create
  static async batchCreate(items) {
    try {
      const client = getDynamoDBClient();
      const batchSize = 25;
      const allResults = [];
      
      for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize);
        const putRequests = batch.map(item => ({
          PutRequest: {
            Item: {
              ...item,
              id: item.id || (Date.now() + Math.floor(Math.random() * 1000)),
              created_at: item.created_at || new Date().toISOString(),
              updated_at: item.updated_at || new Date().toISOString()
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

  // Batch update
  static async batchUpdate(updates) {
    try {
      const promises = updates.map(update => {
        const { id, ...data } = update;
        return this.update(id, data);
      });
      
      await Promise.all(promises);
      return { affectedRows: updates.length };
    } catch (err) {
      throw err;
    }
  }

  // Delete
  static async delete(id) {
    try {
      const client = getDynamoDBClient();
      const itemId = typeof id === 'string' && !isNaN(id) ? parseInt(id) : id;
      
      const command = new DeleteCommand({
        TableName: TABLE_NAME,
        Key: { id: itemId }
      });

      await client.send(command);
      return { affectedRows: 1 };
    } catch (err) {
      throw err;
    }
  }

  // Find by shop_id
  static async findByShopId(shopId) {
    try {
      const client = getDynamoDBClient();
      
      // Try both string and number types since DynamoDB is type-sensitive
      const shopIdStr = String(shopId);
      const shopIdNum = typeof shopId === 'string' && !isNaN(shopId) ? parseInt(shopId) : shopId;
      
      console.log(`🔎 DeliveryBoy.findByShopId: searching for shop_id=${shopId} (as string: "${shopIdStr}", as number: ${shopIdNum})`);
      
      // Scan with pagination to get all delivery boys for the shop
      // Try both string and number matches since DynamoDB is type-sensitive
      let lastKey = null;
      const allItems = [];
      
      do {
        // First try with number type
        const params = {
          TableName: TABLE_NAME,
          FilterExpression: 'shop_id = :shopIdNum OR shop_id = :shopIdStr',
          ExpressionAttributeValues: {
            ':shopIdNum': shopIdNum,
            ':shopIdStr': shopIdStr
          }
        };
        
        if (lastKey) {
          params.ExclusiveStartKey = lastKey;
        }
        
        const command = new ScanCommand(params);
        const response = await client.send(command);
        
        if (response.Items) {
          // Filter items that match either string or number
          const matchingItems = response.Items.filter(item => {
            const itemShopId = item.shop_id;
            return itemShopId === shopIdNum || 
                   itemShopId === shopIdStr || 
                   String(itemShopId) === shopIdStr ||
                   Number(itemShopId) === shopIdNum;
          });
          allItems.push(...matchingItems);
          console.log(`   Found ${matchingItems.length} item(s) in this page (total so far: ${allItems.length})`);
        }
        
        lastKey = response.LastEvaluatedKey;
      } while (lastKey);
      
      console.log(`✅ DeliveryBoy.findByShopId: found ${allItems.length} total item(s) for shop_id=${shopId}`);
      return allItems;
    } catch (err) {
      console.error('DeliveryBoy.findByShopId error:', err);
      throw err;
    }
  }

  // Get counts by multiple shop_ids (batch)
  static async getCountsByShopIds(shopIds) {
    try {
      const client = getDynamoDBClient();
      const counts = {};
      
      // Initialize counts to 0
      shopIds.forEach(id => {
        const idNum = typeof id === 'string' && !isNaN(id) ? parseInt(id) : id;
        counts[idNum] = 0;
        counts[String(idNum)] = 0;
      });
      
      // Scan all delivery boys and count by shop_id
      let lastKey = null;
      
      do {
        const params = {
          TableName: TABLE_NAME
        };
        
        if (lastKey) {
          params.ExclusiveStartKey = lastKey;
        }
        
        const command = new ScanCommand(params);
        const response = await client.send(command);
        
        if (response.Items) {
          response.Items.forEach(item => {
            const itemShopId = item.shop_id;
            // Match with any shop ID in our list (handling both string and number types)
            shopIds.forEach(shopId => {
              const shopIdStr = String(shopId);
              const shopIdNum = typeof shopId === 'string' && !isNaN(shopId) ? parseInt(shopId) : shopId;
              
              if (itemShopId === shopIdNum || itemShopId === shopIdStr || 
                  String(itemShopId) === shopIdStr || Number(itemShopId) === shopIdNum) {
                // Count for both number and string keys
                if (counts[shopIdNum] !== undefined) {
                  counts[shopIdNum]++;
                }
                if (counts[shopIdStr] !== undefined) {
                  counts[shopIdStr]++;
                }
              }
            });
          });
        }
        
        lastKey = response.LastEvaluatedKey;
      } while (lastKey);
      
      // Normalize counts (return number type keys)
      const normalizedCounts = {};
      shopIds.forEach(id => {
        const idNum = typeof id === 'string' && !isNaN(id) ? parseInt(id) : id;
        normalizedCounts[idNum] = counts[idNum] || counts[String(idNum)] || 0;
      });
      
      return normalizedCounts;
    } catch (err) {
      console.error('DeliveryBoy.getCountsByShopIds error:', err);
      // Return zeros on error
      const counts = {};
      shopIds.forEach(id => {
        const idNum = typeof id === 'string' && !isNaN(id) ? parseInt(id) : id;
        counts[idNum] = 0;
      });
      return counts;
    }
  }

  // Find by user_id
  static async findByUserId(userId) {
    try {
      const client = getDynamoDBClient();
      const uid = typeof userId === 'string' && !isNaN(userId) ? parseInt(userId) : userId;
      
      // Scan with pagination to find the matching delivery boy
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
      throw err;
    }
  }

  // Count all delivery boys (optimized with Select: "COUNT")
  static async count() {
    try {
      const client = getDynamoDBClient();
      let lastKey = null;
      let count = 0;
      
      do {
        const params = {
          TableName: TABLE_NAME,
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
}

module.exports = DeliveryBoy;
