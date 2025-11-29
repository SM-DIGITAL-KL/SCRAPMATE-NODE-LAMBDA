const { getDynamoDBClient } = require('../config/dynamodb');
const { GetCommand, PutCommand, UpdateCommand, ScanCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');

const TABLE_NAME = process.env.SUBSCRIPTION_PACKAGES_TABLE || 'subscription_packages';

class SubscriptionPackage {
  /**
   * Get all subscription packages
   */
  static async getAll() {
    try {
      const client = getDynamoDBClient();
      const command = new ScanCommand({
        TableName: TABLE_NAME,
      });
      
      const response = await client.send(command);
      return response.Items || [];
    } catch (error) {
      console.error('Error fetching subscription packages:', error);
      throw error;
    }
  }

  /**
   * Get subscription package by ID
   */
  static async getById(id) {
    try {
      const client = getDynamoDBClient();
      const command = new GetCommand({
        TableName: TABLE_NAME,
        Key: { id },
      });
      
      const response = await client.send(command);
      return response.Item || null;
    } catch (error) {
      console.error('Error fetching subscription package:', error);
      throw error;
    }
  }

  /**
   * Create or update subscription package
   */
  static async upsert(packageData) {
    const now = new Date().toISOString();
    
    const item = {
      id: packageData.id,
      name: packageData.name,
      price: packageData.price,
      duration: packageData.duration,
      description: packageData.description || '',
      features: packageData.features || [],
      popular: packageData.popular || false,
      userType: packageData.userType || null, // 'b2b' or 'b2c'
      upiId: packageData.upiId || '',
      merchantName: packageData.merchantName || '',
      isActive: packageData.isActive !== undefined ? packageData.isActive : true,
      createdAt: packageData.createdAt || now,
      updatedAt: now,
    };

    try {
      const client = getDynamoDBClient();
      const command = new PutCommand({
        TableName: TABLE_NAME,
        Item: item,
      });
      
      await client.send(command);
      return item;
    } catch (error) {
      console.error('Error upserting subscription package:', error);
      throw error;
    }
  }

  /**
   * Update subscription package
   */
  static async update(id, updateData) {
    const now = new Date().toISOString();
    
    // Build update expression
    const updateExpressions = [];
    const expressionAttributeNames = {};
    const expressionAttributeValues = {};

    const allowedFields = ['name', 'price', 'duration', 'description', 'features', 'popular', 'userType', 'upiId', 'merchantName', 'isActive'];
    
    allowedFields.forEach(field => {
      if (updateData[field] !== undefined) {
        const nameKey = `#${field}`;
        const valueKey = `:${field}`;
        updateExpressions.push(`${nameKey} = ${valueKey}`);
        expressionAttributeNames[nameKey] = field;
        expressionAttributeValues[valueKey] = updateData[field];
      }
    });

    if (updateExpressions.length === 0) {
      throw new Error('No fields to update');
    }

    updateExpressions.push('#updatedAt = :updatedAt');
    expressionAttributeNames['#updatedAt'] = 'updatedAt';
    expressionAttributeValues[':updatedAt'] = now;

    try {
      const client = getDynamoDBClient();
      const command = new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { id },
        UpdateExpression: `SET ${updateExpressions.join(', ')}`,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        ReturnValues: 'ALL_NEW',
      });
      
      const response = await client.send(command);
      return response.Attributes;
    } catch (error) {
      console.error('Error updating subscription package:', error);
      throw error;
    }
  }

  /**
   * Delete subscription package
   */
  static async delete(id) {
    try {
      const client = getDynamoDBClient();
      const command = new DeleteCommand({
        TableName: TABLE_NAME,
        Key: { id },
      });
      
      await client.send(command);
      return { success: true };
    } catch (error) {
      console.error('Error deleting subscription package:', error);
      throw error;
    }
  }
}

module.exports = SubscriptionPackage;
