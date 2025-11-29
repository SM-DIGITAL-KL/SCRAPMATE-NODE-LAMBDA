const { getDynamoDBClient } = require('../config/dynamodb');
const { GetCommand, PutCommand, UpdateCommand, ScanCommand, BatchGetCommand, BatchWriteCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');

const TABLE_NAME = 'call_logs';

class CallLog {
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

  // Count all call logs (optimized with Select: "COUNT")
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

  // Count call logs by date (today)
  static async countByDate(date = null) {
    try {
      const client = getDynamoDBClient();
      const targetDate = date || new Date().toISOString().split('T')[0];
      
      let lastKey = null;
      let count = 0;
      
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
          // Filter by date in memory (DynamoDB doesn't support DATE() function)
          const matching = response.Items.filter(item => {
            if (!item.created_at) return false;
            const itemDate = item.created_at.split('T')[0];
            return itemDate === targetDate;
          });
          count += matching.length;
        }
        
        lastKey = response.LastEvaluatedKey;
      } while (lastKey);
      
      return count;
    } catch (err) {
      throw err;
    }
  }

  // Search call logs with user and shop names (for admin panel)
  static async searchWithNames(searchTerm = '', limit = 10, offset = 0) {
    try {
      const client = getDynamoDBClient();
      const User = require('./User');
      const Shop = require('./Shop');
      
      // Get all call logs
      let allCallLogs = [];
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
          allCallLogs.push(...response.Items);
        }
        
        lastKey = response.LastEvaluatedKey;
      } while (lastKey);
      
      // Sort by created_at DESC
      allCallLogs.sort((a, b) => {
        const dateA = new Date(a.created_at || 0);
        const dateB = new Date(b.created_at || 0);
        return dateB - dateA;
      });
      
      // Get unique user_ids and shop_ids
      const userIds = [...new Set(allCallLogs.map(cl => cl.user_id).filter(Boolean))];
      const shopIds = [...new Set(allCallLogs.map(cl => cl.shop_id).filter(Boolean))];
      
      // Batch get users and shops
      const users = await User.findByIds(userIds);
      const shops = await Shop.findByIds(shopIds);
      
      // Create lookup maps
      const userMap = {};
      users.forEach(u => { userMap[u.id] = u; });
      const shopMap = {};
      shops.forEach(s => { shopMap[s.id] = s; });
      
      // Combine call logs with user and shop names
      let results = allCallLogs.map(cl => ({
        ...cl,
        user_name: cl.user_id && userMap[cl.user_id] ? userMap[cl.user_id].name : '',
        shop_name: cl.shop_id && shopMap[cl.shop_id] ? shopMap[cl.shop_id].shopname : ''
      }));
      
      // Filter by search term if provided
      if (searchTerm) {
        const searchLower = searchTerm.toLowerCase();
        results = results.filter(cl => 
          (cl.user_name && cl.user_name.toLowerCase().includes(searchLower)) ||
          (cl.shop_name && cl.shop_name.toLowerCase().includes(searchLower))
        );
      }
      
      // Apply pagination
      const total = results.length;
      results = results.slice(offset, offset + limit);
      
      return { data: results, total };
    } catch (err) {
      throw err;
    }
  }
}

module.exports = CallLog;
