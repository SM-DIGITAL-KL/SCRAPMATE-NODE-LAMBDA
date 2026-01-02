/**
 * Pending Bulk Buy Order Model
 * Handles pending bulk buy orders that are waiting for payment approval
 */

const { getDynamoDBClient } = require('../config/dynamodb');
const { PutCommand, QueryCommand, ScanCommand, GetCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');

const TABLE_NAME = 'pending_bulk_buy_orders';

class PendingBulkBuyOrder {
  /**
   * Create a new pending bulk buy order
   */
  static async create(data) {
    try {
      const client = getDynamoDBClient();
      const orderId = data.id || (Date.now() + Math.floor(Math.random() * 1000)).toString();
      
      // Ensure proper data types for DynamoDB
      const item = {
        id: orderId,
        user_id: typeof data.user_id === 'string' ? parseInt(data.user_id) : (typeof data.user_id === 'number' ? data.user_id : parseInt(String(data.user_id))),
        transaction_id: data.transaction_id || null,
        payment_amount: typeof data.payment_amount === 'string' ? parseFloat(data.payment_amount) : (typeof data.payment_amount === 'number' ? data.payment_amount : parseFloat(String(data.payment_amount))),
        subscription_plan_id: data.subscription_plan_id || null,
        buyer_id: typeof data.buyer_id === 'string' ? parseInt(data.buyer_id) : (typeof data.buyer_id === 'number' ? data.buyer_id : parseInt(String(data.buyer_id))),
        latitude: typeof data.latitude === 'string' ? parseFloat(data.latitude) : (typeof data.latitude === 'number' ? data.latitude : parseFloat(String(data.latitude))),
        longitude: typeof data.longitude === 'string' ? parseFloat(data.longitude) : (typeof data.longitude === 'number' ? data.longitude : parseFloat(String(data.longitude))),
        scrap_type: data.scrap_type || null,
        subcategories: data.subcategories ? (typeof data.subcategories === 'string' ? data.subcategories : JSON.stringify(data.subcategories)) : null,
        subcategory_id: data.subcategory_id ? (typeof data.subcategory_id === 'string' ? parseInt(data.subcategory_id) : (typeof data.subcategory_id === 'number' ? data.subcategory_id : parseInt(String(data.subcategory_id)))) : null,
        quantity: typeof data.quantity === 'string' ? parseFloat(data.quantity) : (typeof data.quantity === 'number' ? data.quantity : parseFloat(String(data.quantity))),
        preferred_price: data.preferred_price ? (typeof data.preferred_price === 'string' ? parseFloat(data.preferred_price) : (typeof data.preferred_price === 'number' ? data.preferred_price : parseFloat(String(data.preferred_price)))) : null,
        preferred_distance: typeof data.preferred_distance === 'string' ? parseFloat(data.preferred_distance) : (typeof data.preferred_distance === 'number' ? data.preferred_distance : parseFloat(String(data.preferred_distance || 50))),
        when_needed: data.when_needed || null,
        location: data.location || null,
        additional_notes: data.additional_notes || null,
        documents: data.documents ? (typeof data.documents === 'string' ? data.documents : JSON.stringify(data.documents)) : null,
        status: data.status || 'pending_payment', // pending_payment, payment_approved, submitted, cancelled
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const command = new PutCommand({
        TableName: TABLE_NAME,
        Item: item
      });

      try {
        await client.send(command);
        console.log(`✅ Pending bulk buy order created: ID=${orderId}`);
        return item;
      } catch (putError) {
        if (putError.name === 'ResourceNotFoundException' || putError.__type === 'com.amazonaws.dynamodb.v20120810#ResourceNotFoundException') {
          console.error(`❌ Table "${TABLE_NAME}" does not exist. Please create the table first.`);
          throw new Error(`Table "${TABLE_NAME}" does not exist. Please create it first.`);
        }
        throw putError;
      }
    } catch (error) {
      console.error('❌ Error creating pending bulk buy order:', error);
      throw error;
    }
  }

  /**
   * Find pending bulk buy orders for a user
   */
  static async findByUserId(userId) {
    try {
      const client = getDynamoDBClient();
      const userIdNum = typeof userId === 'string' ? parseInt(userId) : (typeof userId === 'number' ? userId : parseInt(String(userId)));

      const command = new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: 'user_id-index', // GSI on user_id
        KeyConditionExpression: 'user_id = :userId',
        ExpressionAttributeValues: {
          ':userId': userIdNum
        },
        ScanIndexForward: false // Sort by created_at descending
      });

      try {
        const response = await client.send(command);
        return response.Items || [];
      } catch (queryError) {
        // If table or index doesn't exist, fall back to scan
        if (queryError.name === 'ResourceNotFoundException' || queryError.__type === 'com.amazonaws.dynamodb.v20120810#ResourceNotFoundException') {
          console.warn(`⚠️ Index "user_id-index" does not exist. Falling back to scan.`);
          return await this.findByUserIdScan(userIdNum);
        }
        throw queryError;
      }
    } catch (error) {
      // If table doesn't exist, return empty array instead of throwing
      if (error.name === 'ResourceNotFoundException' || error.__type === 'com.amazonaws.dynamodb.v20120810#ResourceNotFoundException') {
        console.warn(`⚠️ Table "${TABLE_NAME}" does not exist. Returning empty array.`);
        return [];
      }
      console.error('❌ Error finding pending bulk buy orders by user ID:', error);
      throw error;
    }
  }

  /**
   * Fallback method using scan if index doesn't exist
   */
  static async findByUserIdScan(userId) {
    try {
      const client = getDynamoDBClient();
      const allOrders = [];
      let lastKey = null;

      do {
        const params = {
          TableName: TABLE_NAME,
          FilterExpression: 'user_id = :userId',
          ExpressionAttributeValues: {
            ':userId': userId
          }
        };

        if (lastKey) {
          params.ExclusiveStartKey = lastKey;
        }

        const command = new ScanCommand(params);
        const response = await client.send(command);
        
        if (response.Items) {
          allOrders.push(...response.Items);
        }
        
        lastKey = response.LastEvaluatedKey;
      } while (lastKey);

      // Sort by created_at descending
      allOrders.sort((a, b) => {
        const dateA = new Date(a.created_at || 0).getTime();
        const dateB = new Date(b.created_at || 0).getTime();
        return dateB - dateA;
      });

      return allOrders;
    } catch (error) {
      // If table doesn't exist, return empty array instead of throwing
      if (error.name === 'ResourceNotFoundException' || error.__type === 'com.amazonaws.dynamodb.v20120810#ResourceNotFoundException') {
        console.warn(`⚠️ Table "${TABLE_NAME}" does not exist. Returning empty array.`);
        return [];
      }
      console.error('❌ Error scanning pending bulk buy orders:', error);
      throw error;
    }
  }

  /**
   * Find a pending order by ID
   */
  static async findById(orderId) {
    try {
      const client = getDynamoDBClient();
      
      const command = new GetCommand({
        TableName: TABLE_NAME,
        Key: {
          id: orderId.toString()
        }
      });

      const response = await client.send(command);
      return response.Item || null;
    } catch (error) {
      console.error('❌ Error finding pending bulk buy order by ID:', error);
      throw error;
    }
  }

  /**
   * Update pending order status
   */
  static async updateStatus(orderId, status) {
    try {
      const client = getDynamoDBClient();
      
      const command = new UpdateCommand({
        TableName: TABLE_NAME,
        Key: {
          id: orderId.toString()
        },
        UpdateExpression: 'SET #status = :status, updated_at = :updatedAt',
        ExpressionAttributeNames: {
          '#status': 'status'
        },
        ExpressionAttributeValues: {
          ':status': status,
          ':updatedAt': new Date().toISOString()
        },
        ReturnValues: 'ALL_NEW'
      });

      const response = await client.send(command);
      return response.Attributes;
    } catch (error) {
      console.error('❌ Error updating pending order status:', error);
      throw error;
    }
  }
}

module.exports = PendingBulkBuyOrder;

