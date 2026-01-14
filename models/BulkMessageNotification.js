const { getDynamoDBClient } = require('../config/dynamodb');
const { GetCommand, PutCommand, UpdateCommand, ScanCommand, QueryCommand, BatchWriteCommand } = require('@aws-sdk/lib-dynamodb');

const TABLE_NAME = 'bulk_message_notifications';

class BulkMessageNotification {
  /**
   * Save a bulk message notification record
   * @param {Object} data - Notification data
   * @param {string} data.phone_number - Phone number (required)
   * @param {Object} data.business_data - Business data object
   * @param {string} data.message - Message sent
   * @param {string} data.status - Status: 'sent', 'failed', 'pending'
   * @param {string} data.language - Language code (optional)
   * @returns {Promise<Object>} Saved notification record
   */
  static async save(data) {
    try {
      const client = getDynamoDBClient();
      
      const {
        phone_number,
        business_data,
        message,
        status = 'sent',
        language = 'en'
      } = data;

      if (!phone_number) {
        throw new Error('Phone number is required');
      }

      // Normalize phone number (remove spaces, +, etc.)
      const normalizedPhone = phone_number.replace(/[\s+\-()]/g, '');
      
      // Create a unique ID using phone number and timestamp
      const id = `${normalizedPhone}_${Date.now()}`;
      
      const notification = {
        id: id,
        phone_number: normalizedPhone,
        business_data: business_data || {},
        message: message || '',
        status: status,
        language: language,
        notified_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const command = new PutCommand({
        TableName: TABLE_NAME,
        Item: notification
      });

      await client.send(command);
      
      return notification;
    } catch (err) {
      console.error('Error saving bulk message notification:', err);
      throw err;
    }
  }

  /**
   * Save multiple bulk message notifications in batch
   * @param {Array} notifications - Array of notification data objects
   * @returns {Promise<Object>} Result with success and failure counts
   */
  static async saveBatch(notifications) {
    try {
      const client = getDynamoDBClient();
      
      if (!Array.isArray(notifications) || notifications.length === 0) {
        throw new Error('Notifications array is required and must not be empty');
      }

      const items = notifications.map((data, index) => {
        const {
          phone_number,
          business_data,
          message,
          status = 'sent',
          language = 'en'
        } = data;

        if (!phone_number) {
          throw new Error(`Phone number is required for notification at index ${index}`);
        }

        const normalizedPhone = phone_number.replace(/[\s+\-()]/g, '');
        const id = `${normalizedPhone}_${Date.now()}_${index}`;
        
        return {
          id: id,
          phone_number: normalizedPhone,
          business_data: business_data || {},
          message: message || '',
          status: status,
          language: language,
          notified_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
      });

      // DynamoDB BatchWriteCommand can handle up to 25 items at a time
      const batchSize = 25;
      const batches = [];
      
      for (let i = 0; i < items.length; i += batchSize) {
        batches.push(items.slice(i, i + batchSize));
      }

      let successCount = 0;
      let failureCount = 0;

      for (const batch of batches) {
        try {
          const command = new BatchWriteCommand({
            RequestItems: {
              [TABLE_NAME]: batch.map(item => ({
                PutRequest: {
                  Item: item
                }
              }))
            }
          });

          await client.send(command);
          successCount += batch.length;
        } catch (err) {
          console.error('Error in batch write:', err);
          failureCount += batch.length;
        }
      }

      return {
        total: notifications.length,
        success: successCount,
        failed: failureCount
      };
    } catch (err) {
      console.error('Error saving bulk message notifications batch:', err);
      throw err;
    }
  }

  /**
   * Check if a phone number has been notified
   * @param {string} phone_number - Phone number to check
   * @returns {Promise<Array>} Array of notification records for this phone number
   */
  static async findByPhoneNumber(phone_number) {
    try {
      const client = getDynamoDBClient();
      
      if (!phone_number) {
        throw new Error('Phone number is required');
      }

      const normalizedPhone = phone_number.replace(/[\s+\-()]/g, '');
      
      const command = new ScanCommand({
        TableName: TABLE_NAME,
        FilterExpression: 'phone_number = :phone',
        ExpressionAttributeValues: {
          ':phone': normalizedPhone
        }
      });

      const response = await client.send(command);
      const items = response.Items || [];
      
      // Sort by notified_at descending (most recent first)
      items.sort((a, b) => {
        const dateA = new Date(a.notified_at || a.created_at);
        const dateB = new Date(b.notified_at || b.created_at);
        return dateB - dateA;
      });

      return items;
    } catch (err) {
      console.error('Error finding bulk message notification by phone:', err);
      throw err;
    }
  }

  /**
   * Check if multiple phone numbers have been notified
   * @param {Array<string>} phone_numbers - Array of phone numbers to check
   * @returns {Promise<Object>} Object mapping phone numbers to their notification status
   */
  static async findByPhoneNumbers(phone_numbers) {
    try {
      if (!Array.isArray(phone_numbers) || phone_numbers.length === 0) {
        throw new Error('Phone numbers array is required and must not be empty');
      }

      const client = getDynamoDBClient();
      
      // Normalize all phone numbers
      const normalizedPhones = phone_numbers.map(phone => 
        phone.replace(/[\s+\-()]/g, '')
      );

      // Scan for all phone numbers (DynamoDB doesn't support IN filter efficiently)
      // For better performance with large datasets, consider using GSI
      const command = new ScanCommand({
        TableName: TABLE_NAME,
        FilterExpression: 'phone_number IN (:phones)',
        ExpressionAttributeValues: {
          ':phones': normalizedPhones
        }
      });

      const response = await client.send(command);
      const items = response.Items || [];

      // Group by phone number
      const result = {};
      normalizedPhones.forEach(phone => {
        result[phone] = [];
      });

      items.forEach(item => {
        if (result[item.phone_number]) {
          result[item.phone_number].push(item);
        }
      });

      // Sort each phone's notifications by notified_at descending
      Object.keys(result).forEach(phone => {
        result[phone].sort((a, b) => {
          const dateA = new Date(a.notified_at || a.created_at);
          const dateB = new Date(b.notified_at || b.created_at);
          return dateB - dateA;
        });
      });

      return result;
    } catch (err) {
      console.error('Error finding bulk message notifications by phones:', err);
      throw err;
    }
  }

  /**
   * Get notification by ID
   * @param {string} id - Notification ID
   * @returns {Promise<Object|null>} Notification record or null
   */
  static async findById(id) {
    try {
      const client = getDynamoDBClient();
      
      if (!id) {
        throw new Error('ID is required');
      }

      const command = new GetCommand({
        TableName: TABLE_NAME,
        Key: { id: id }
      });

      const response = await client.send(command);
      return response.Item || null;
    } catch (err) {
      console.error('Error finding bulk message notification by ID:', err);
      throw err;
    }
  }

  /**
   * Update notification status
   * @param {string} id - Notification ID
   * @param {string} status - New status
   * @returns {Promise<Object>} Updated notification
   */
  static async updateStatus(id, status) {
    try {
      const client = getDynamoDBClient();
      
      if (!id || !status) {
        throw new Error('ID and status are required');
      }

      const command = new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { id: id },
        UpdateExpression: 'SET #status = :status, updated_at = :updated_at',
        ExpressionAttributeNames: {
          '#status': 'status'
        },
        ExpressionAttributeValues: {
          ':status': status,
          ':updated_at': new Date().toISOString()
        },
        ReturnValues: 'ALL_NEW'
      });

      const response = await client.send(command);
      return response.Attributes;
    } catch (err) {
      console.error('Error updating bulk message notification status:', err);
      throw err;
    }
  }

  /**
   * Get all notifications (with pagination support)
   * @param {number} limit - Maximum number of items to return
   * @param {string} lastKey - Last evaluated key for pagination
   * @returns {Promise<Object>} Object with items and lastKey
   */
  static async findAll(limit = 100, lastKey = null) {
    try {
      const client = getDynamoDBClient();
      
      const params = {
        TableName: TABLE_NAME,
        Limit: limit
      };

      if (lastKey) {
        params.ExclusiveStartKey = lastKey;
      }

      const command = new ScanCommand(params);
      const response = await client.send(command);
      
      const items = response.Items || [];
      
      // Sort by notified_at descending
      items.sort((a, b) => {
        const dateA = new Date(a.notified_at || a.created_at);
        const dateB = new Date(b.notified_at || b.created_at);
        return dateB - dateA;
      });

      return {
        items: items,
        lastKey: response.LastEvaluatedKey || null
      };
    } catch (err) {
      console.error('Error finding all bulk message notifications:', err);
      throw err;
    }
  }
}

module.exports = BulkMessageNotification;






