const { getDynamoDBClient } = require('../config/dynamodb');
const { GetCommand, PutCommand, UpdateCommand, ScanCommand, BatchGetCommand, BatchWriteCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');

const TABLE_NAME = 'category_img_keywords';

class CategoryImgKeywords {
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

  // Get all category image keywords
  static async getAll() {
    try {
      const client = getDynamoDBClient();
      let lastKey = null;
      const allItems = [];
      
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
          allItems.push(...response.Items);
        }
        
        lastKey = response.LastEvaluatedKey;
      } while (lastKey);
      
      return allItems;
    } catch (err) {
      throw err;
    }
  }

  // Get categories updated after a specific timestamp
  static async getUpdatedAfter(timestamp) {
    try {
      if (!timestamp) {
        return await this.getAll();
      }

      const client = getDynamoDBClient();
      let lastKey = null;
      const allItems = [];
      
      // Convert timestamp to ISO string if it's not already
      const timestampStr = typeof timestamp === 'string' ? timestamp : new Date(timestamp).toISOString();
      
      // Scan all items and filter in memory for more reliable comparison
      // DynamoDB FilterExpression can be unreliable with string comparisons
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
          allItems.push(...response.Items);
        }
        
        lastKey = response.LastEvaluatedKey;
      } while (lastKey);
      
      // Filter in memory: items where updated_at > timestamp OR created_at > timestamp
      // This ensures we catch all updates, including name changes
      const filtered = allItems.filter(item => {
        const updatedAt = item.updated_at;
        const createdAt = item.created_at;
        
        // Check if updated_at exists and is greater than timestamp
        if (updatedAt && updatedAt > timestampStr) {
          return true;
        }
        
        // Check if created_at is greater than timestamp (for newly created items)
        if (createdAt && createdAt > timestampStr) {
          return true;
        }
        
        return false;
      });
      
      console.log(`📊 [CategoryImgKeywords.getUpdatedAfter] Found ${filtered.length} updated categories out of ${allItems.length} total (timestamp: ${timestampStr})`);
      
      return filtered;
    } catch (err) {
      console.error('❌ Error in CategoryImgKeywords.getUpdatedAfter:', err);
      throw err;
    }
  }

  // Find by category name
  static async findByCategoryName(categoryName) {
    try {
      const client = getDynamoDBClient();
      let lastKey = null;
      const allItems = [];
      
      do {
        const params = {
          TableName: TABLE_NAME,
          FilterExpression: 'category_name = :categoryName',
          ExpressionAttributeValues: {
            ':categoryName': categoryName
          }
        };
        
        if (lastKey) {
          params.ExclusiveStartKey = lastKey;
        }
        
        const command = new ScanCommand(params);
        const response = await client.send(command);
        
        if (response.Items) {
          allItems.push(...response.Items);
        }
        
        lastKey = response.LastEvaluatedKey;
      } while (lastKey);
      
      return allItems;
    } catch (err) {
      throw err;
    }
  }

  // Find by multiple category names
  static async findByCategoryNames(categoryNames) {
    try {
      const client = getDynamoDBClient();
      let lastKey = null;
      const allItems = [];
      
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
          // Filter in memory since DynamoDB doesn't support IN with strings easily
          const matching = response.Items.filter(item => 
            categoryNames.includes(item.category_name)
          );
          allItems.push(...matching);
        }
        
        lastKey = response.LastEvaluatedKey;
      } while (lastKey);
      
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

module.exports = CategoryImgKeywords;


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

module.exports = CategoryImgKeywords;

