const { getDynamoDBClient } = require('../config/dynamodb');
const { GetCommand, PutCommand, UpdateCommand, ScanCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');

const TABLE_NAME = 'per_pages';

class PerPage {
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
      console.error('PerPage.findById error:', err);
      throw err;
    }
  }

  // Get all permissions
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
      console.error('PerPage.getAll error:', err);
      throw err;
    }
  }

  // Count all permissions
  static async count() {
    try {
      const all = await this.getAll();
      return all.length;
    } catch (err) {
      console.error('PerPage.count error:', err);
      throw err;
    }
  }

  // Create permission
  static async create(data) {
    try {
      const client = getDynamoDBClient();
      
      // Ensure id is a number
      const item = {
        ...data,
        id: data.id ? Number(data.id) : Date.now(), // Use timestamp as ID if not provided
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
      console.error('PerPage.create error:', err);
      throw err;
    }
  }

  // Update permission
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
          expressionAttributeValues[attrValue] = data[key];
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
      console.error('PerPage.update error:', err);
      throw err;
    }
  }

  // Delete permission
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
      console.error('PerPage.delete error:', err);
      throw err;
    }
  }
}

module.exports = PerPage;

