/**
 * Order Location History Model
 * Stores location history for orders in DynamoDB
 * Saves location every 30 minutes when pickup is initiated
 */

const { getDynamoDBClient } = require('../config/dynamodb');
const { PutCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');

const TABLE_NAME = 'order_location_history';

class OrderLocationHistory {
  /**
   * Save location history for an order
   * @param {Object} data - Location data
   * @param {number} data.order_id - Order ID
   * @param {number} data.user_id - User ID
   * @param {string} data.user_type - User type (R, S, SR, D)
   * @param {number} data.latitude - Latitude
   * @param {number} data.longitude - Longitude
   * @param {number} data.timestamp - Timestamp in milliseconds
   * @param {string} data.created_at - ISO timestamp string
   */
  static async save(data) {
    try {
      console.log('💾 [OrderLocationHistory] Saving location:', {
        order_id: data.order_id,
        user_id: data.user_id,
        user_type: data.user_type,
        latitude: data.latitude,
        longitude: data.longitude,
        timestamp: data.timestamp
      });
      
      const client = getDynamoDBClient();
      
      const id = `${data.order_id}_${data.timestamp}`;
      
      const item = {
        id: id,
        order_id: parseInt(data.order_id),
        user_id: parseInt(data.user_id),
        user_type: data.user_type,
        latitude: parseFloat(data.latitude),
        longitude: parseFloat(data.longitude),
        timestamp: data.timestamp,
        created_at: data.created_at || new Date().toISOString()
      };

      console.log('💾 [OrderLocationHistory] Item to save:', JSON.stringify(item, null, 2));

      const command = new PutCommand({
        TableName: TABLE_NAME,
        Item: item
      });

      await client.send(command);
      console.log('💾 [OrderLocationHistory] Successfully saved location history');
      return item;
    } catch (err) {
      console.error('❌ [OrderLocationHistory] Error saving order location history:', err);
      console.error('❌ [OrderLocationHistory] Error message:', err.message);
      console.error('❌ [OrderLocationHistory] Error stack:', err.stack);
      console.error('❌ [OrderLocationHistory] Data that failed:', JSON.stringify(data, null, 2));
      throw err;
    }
  }

  /**
   * Get last saved location for an order
   * @param {number} orderId - Order ID
   * @returns {Promise<Object|null>} Last location or null
   */
  static async getLastLocation(orderId) {
    try {
      const client = getDynamoDBClient();
      
      const command = new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: 'order_id-timestamp-index', // GSI for querying by order_id
        KeyConditionExpression: 'order_id = :orderId',
        ExpressionAttributeValues: {
          ':orderId': parseInt(orderId)
        },
        ScanIndexForward: false, // Sort descending by timestamp
        Limit: 1
      });

      const response = await client.send(command);
      
      if (response.Items && response.Items.length > 0) {
        return {
          ...response.Items[0],
          timestamp: response.Items[0].timestamp || new Date(response.Items[0].created_at).getTime()
        };
      }

      return null;
    } catch (err) {
      // If index doesn't exist, try scanning (fallback)
      try {
        const { ScanCommand } = require('@aws-sdk/lib-dynamodb');
        const client = getDynamoDBClient();
        
        const scanCommand = new ScanCommand({
          TableName: TABLE_NAME,
          FilterExpression: 'order_id = :orderId',
          ExpressionAttributeValues: {
            ':orderId': parseInt(orderId)
          }
        });

        const response = await client.send(scanCommand);
        
        if (response.Items && response.Items.length > 0) {
          // Sort by timestamp descending and get first
          const sorted = response.Items.sort((a, b) => {
            const aTime = a.timestamp || new Date(a.created_at).getTime();
            const bTime = b.timestamp || new Date(b.created_at).getTime();
            return bTime - aTime;
          });
          
          return {
            ...sorted[0],
            timestamp: sorted[0].timestamp || new Date(sorted[0].created_at).getTime()
          };
        }
      } catch (scanErr) {
        console.error('Error getting last location (scan fallback):', scanErr);
      }
      
      return null;
    }
  }

  /**
   * Get location history for an order
   * @param {number} orderId - Order ID
   * @param {number} limit - Maximum number of records to return
   * @returns {Promise<Array>} Array of location records
   */
  static async getHistory(orderId, limit = 100) {
    try {
      const client = getDynamoDBClient();
      
      const command = new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: 'order_id-timestamp-index',
        KeyConditionExpression: 'order_id = :orderId',
        ExpressionAttributeValues: {
          ':orderId': parseInt(orderId)
        },
        ScanIndexForward: false, // Sort descending by timestamp
        Limit: limit
      });

      const response = await client.send(command);
      return response.Items || [];
    } catch (err) {
      console.error('Error getting location history:', err);
      return [];
    }
  }
}

module.exports = OrderLocationHistory;

