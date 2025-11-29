const { getDynamoDBClient } = require('../config/dynamodb');
const { GetCommand, PutCommand, UpdateCommand, ScanCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');

const TABLE_NAME = 'user_admins';

class UserAdmin {
  // Find by ID
  static async findById(id) {
    try {
      const client = getDynamoDBClient();
      const command = new GetCommand({
        TableName: TABLE_NAME,
        Key: { id: Number(id) }
      });
      const response = await client.send(command);
      return response.Item || null;
    } catch (err) {
      console.error('UserAdmin.findById error:', err);
      throw err;
    }
  }

  // Find by user_id
  static async findByUserId(userId) {
    try {
      const client = getDynamoDBClient();
      let lastKey = null;
      const results = [];

      do {
        const params = {
          TableName: TABLE_NAME,
          FilterExpression: 'user_id = :user_id',
          ExpressionAttributeValues: {
            ':user_id': Number(userId)
          }
        };

        if (lastKey) {
          params.ExclusiveStartKey = lastKey;
        }

        const command = new ScanCommand(params);
        const response = await client.send(command);

        if (response.Items) {
          results.push(...response.Items);
        }

        lastKey = response.LastEvaluatedKey;
      } while (lastKey);

      return results.length > 0 ? results[0] : null;
    } catch (err) {
      console.error('UserAdmin.findByUserId error:', err);
      throw err;
    }
  }

  // Get all user admins
  static async getAll() {
    try {
      const client = getDynamoDBClient();
      let lastKey = null;
      const results = [];

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
          results.push(...response.Items);
        }

        lastKey = response.LastEvaluatedKey;
      } while (lastKey);

      return results;
    } catch (err) {
      console.error('UserAdmin.getAll error:', err);
      throw err;
    }
  }

  // Count all user admins (optimized with Select: "COUNT")
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
      console.error('UserAdmin.count error:', err);
      throw err;
    }
  }

  // Create user admin
  static async create(data) {
    try {
      const client = getDynamoDBClient();
      
      // Ensure id is a number
      const item = {
        ...data,
        id: data.id ? Number(data.id) : Date.now(), // Use timestamp as ID if not provided
        user_id: data.user_id ? Number(data.user_id) : null,
        phone: data.phone ? Number(data.phone) : null,
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
      console.error('UserAdmin.create error:', err);
      throw err;
    }
  }

  // Update user admin
  static async update(id, data) {
    try {
      const client = getDynamoDBClient();
      
      // Build update expression
      const updateExpressions = [];
      const expressionAttributeNames = {};
      const expressionAttributeValues = {};

      Object.keys(data).forEach((key, index) => {
        if (key !== 'id') {
          const attrName = `#attr${index}`;
          const attrValue = `:val${index}`;
          updateExpressions.push(`${attrName} = ${attrValue}`);
          expressionAttributeNames[attrName] = key;
      
          // Convert numbers
          if (key === 'user_id' || key === 'phone') {
            expressionAttributeValues[attrValue] = data[key] ? Number(data[key]) : null;
          } else {
            expressionAttributeValues[attrValue] = data[key];
          }
        }
      });

      // Always update updated_at
      updateExpressions.push(`#updated_at = :updated_at`);
      expressionAttributeNames['#updated_at'] = 'updated_at';
      expressionAttributeValues[':updated_at'] = new Date().toISOString();

      const command = new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { id: Number(id) },
        UpdateExpression: `SET ${updateExpressions.join(', ')}`,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        ReturnValues: 'ALL_NEW'
      });

      const response = await client.send(command);
      return response.Attributes;
    } catch (err) {
      console.error('UserAdmin.update error:', err);
      throw err;
    }
  }

  // Delete user admin
  static async delete(id) {
    try {
      const client = getDynamoDBClient();
      const command = new DeleteCommand({
        TableName: TABLE_NAME,
        Key: { id: Number(id) }
      });

      await client.send(command);
      return true;
    } catch (err) {
      console.error('UserAdmin.delete error:', err);
      throw err;
    }
  }
}

module.exports = UserAdmin;

