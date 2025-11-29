const { getDynamoDBClient } = require('../config/dynamodb');
const { GetCommand, PutCommand, UpdateCommand, ScanCommand, BatchGetCommand, BatchWriteCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');

const TABLE_NAME = 'shop_images';

class ShopImages {
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

  // Find by shop_id
  static async findByShopId(shopId) {
    try {
      const client = getDynamoDBClient();
      
      // Try both string and number types since DynamoDB is type-sensitive
      const shopIdStr = String(shopId);
      const shopIdNum = typeof shopId === 'string' && !isNaN(shopId) ? parseInt(shopId) : shopId;
      
      // Scan with pagination to get all shop images for the shop
      let lastKey = null;
      const allItems = [];
      
      do {
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
        }
        
        lastKey = response.LastEvaluatedKey;
      } while (lastKey);
      
      return allItems;
    } catch (err) {
      console.error('ShopImages.findByShopId error:', err);
      throw err;
    }
  }

  // Get count by shop_id
  static async getCountByShopId(shopId) {
    try {
      const images = await this.findByShopId(shopId);
      return images.length;
    } catch (err) {
      console.error('ShopImages.getCountByShopId error:', err);
      return 0;
    }
  }

  // Get counts by multiple shop_ids (batch)
  static async getCountsByShopIds(shopIds) {
    try {
      const client = getDynamoDBClient();
      const counts = {};
      
      // Initialize counts to 0
      shopIds.forEach(id => {
        counts[id] = 0;
      });
      
      // Scan all shop_images and count by shop_id
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
            // Check if this shop_id is in our list
            const shopIdStr = String(itemShopId);
            const shopIdNum = typeof itemShopId === 'string' && !isNaN(itemShopId) ? parseInt(itemShopId) : itemShopId;
            
            // Match with any shop ID in our list (handling both string and number types)
            shopIds.forEach(shopId => {
              const shopIdStr2 = String(shopId);
              const shopIdNum2 = typeof shopId === 'string' && !isNaN(shopId) ? parseInt(shopId) : shopId;
              
              if (itemShopId === shopIdNum2 || itemShopId === shopIdStr2 || 
                  shopIdStr === shopIdStr2 || shopIdNum === shopIdNum2) {
                const key = shopIdNum2 || shopIdStr2;
                counts[key] = (counts[key] || 0) + 1;
              }
            });
          });
        }
        
        lastKey = response.LastEvaluatedKey;
      } while (lastKey);
      
      return counts;
    } catch (err) {
      console.error('ShopImages.getCountsByShopIds error:', err);
      // Return zeros on error
      const counts = {};
      shopIds.forEach(id => {
        counts[id] = 0;
      });
      return counts;
    }
  }

  // Create
  static async create(data) {
    try {
      const client = getDynamoDBClient();
      const id = data.id || (Date.now() + Math.floor(Math.random() * 1000));
      
      const item = {
        ...data,
        id: id,
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
}

module.exports = ShopImages;
