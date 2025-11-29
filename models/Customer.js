const { getDynamoDBClient } = require('../config/dynamodb');
const { GetCommand, PutCommand, UpdateCommand, ScanCommand, BatchGetCommand, BatchWriteCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');

const TABLE_NAME = 'customer';

class Customer {
  static async findById(id) {
    try {
      const client = getDynamoDBClient();
      const customerId = typeof id === 'string' && !isNaN(id) ? parseInt(id) : id;
      
      const command = new GetCommand({
        TableName: TABLE_NAME,
        Key: { id: customerId }
      });

      const response = await client.send(command);
      return response.Item || null;
    } catch (err) {
      throw err;
    }
  }

  static async findByUserId(userId) {
    try {
      const client = getDynamoDBClient();
      const uid = typeof userId === 'string' && !isNaN(userId) ? parseInt(userId) : userId;
      
      // Scan with pagination to find the matching customer
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

  static async create(data) {
    try {
      const client = getDynamoDBClient();
      const id = data.id || (Date.now() + Math.floor(Math.random() * 1000));
      
      const customer = {
        id: id,
        user_id: typeof data.user_id === 'string' && !isNaN(data.user_id) ? parseInt(data.user_id) : data.user_id,
        email: data.email,
        name: data.name,
        contact: typeof data.contact === 'string' && !isNaN(data.contact) ? parseInt(data.contact) : data.contact,
        address: data.address,
        location: data.location,
        state: data.state,
        place: data.place,
        language: data.language,
        profile_photo: data.profile_photo,
        pincode: data.pincode,
        lat_log: data.lat_log,
        place_id: data.place_id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const command = new PutCommand({
        TableName: TABLE_NAME,
        Item: customer
      });

      await client.send(command);
      return customer;
    } catch (err) {
      throw err;
    }
  }

  static async update(id, data) {
    try {
      const client = getDynamoDBClient();
      const customerId = typeof id === 'string' && !isNaN(id) ? parseInt(id) : id;
      
      const updateExpressions = [];
      const expressionAttributeValues = {};
      const expressionAttributeNames = {};
      
      Object.keys(data).forEach((key, index) => {
        if (data[key] !== undefined) {
          const attrName = `#attr${index}`;
          const attrValue = `:val${index}`;
          updateExpressions.push(`${attrName} = ${attrValue}`);
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
        Key: { id: customerId },
        UpdateExpression: `SET ${updateExpressions.join(', ')}`,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues
      });

      await client.send(command);
      return { affectedRows: 1 };
    } catch (err) {
      throw err;
    }
  }

  // Batch operations
  static async findByIds(ids) {
    try {
      const client = getDynamoDBClient();
      const allCustomers = [];
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
          allCustomers.push(...response.Responses[TABLE_NAME]);
        }
      }

      return allCustomers;
    } catch (err) {
      throw err;
    }
  }

  static async findByUserIds(userIds) {
    try {
      const client = getDynamoDBClient();
      const allCustomers = [];
      
      // Since user_id is not a key, we need to scan and filter
      // For better performance with many user_ids, we can batch scan
      const batchSize = 10; // Process 10 user_ids at a time
      
      for (let i = 0; i < userIds.length; i += batchSize) {
        const batch = userIds.slice(i, i + batchSize);
        const userIdsList = batch.map(uid => typeof uid === 'string' && !isNaN(uid) ? parseInt(uid) : uid);
        
        // Use IN expression for multiple user_ids
        const command = new ScanCommand({
          TableName: TABLE_NAME,
          FilterExpression: `user_id IN (${userIdsList.map((_, idx) => `:uid${idx}`).join(', ')})`,
          ExpressionAttributeValues: userIdsList.reduce((acc, uid, idx) => {
            acc[`:uid${idx}`] = uid;
            return acc;
          }, {})
        });

        const response = await client.send(command);
        if (response.Items) {
          allCustomers.push(...response.Items);
        }
      }

      return allCustomers;
    } catch (err) {
      throw err;
    }
  }

  static async batchCreate(customers) {
    try {
      const client = getDynamoDBClient();
      const batchSize = 25;
      const allResults = [];
      
      for (let i = 0; i < customers.length; i += batchSize) {
        const batch = customers.slice(i, i + batchSize);
        const putRequests = batch.map(customer => ({
          PutRequest: {
            Item: {
              ...customer,
              id: customer.id || (Date.now() + Math.floor(Math.random() * 1000)),
              created_at: customer.created_at || new Date().toISOString(),
              updated_at: customer.updated_at || new Date().toISOString()
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

  // Get all customers (sorted by id DESC)
  static async getAll() {
    try {
      const client = getDynamoDBClient();
      let lastKey = null;
      const allCustomers = [];
      
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
          allCustomers.push(...response.Items);
        }
        
        lastKey = response.LastEvaluatedKey;
      } while (lastKey);
      
      // Sort by id DESC
      allCustomers.sort((a, b) => (b.id || 0) - (a.id || 0));
      
      return allCustomers;
    } catch (err) {
      throw err;
    }
  }

  // Delete customer
  static async delete(id) {
    try {
      const client = getDynamoDBClient();
      const customerId = typeof id === 'string' && !isNaN(id) ? parseInt(id) : id;
      
      const command = new DeleteCommand({
        TableName: TABLE_NAME,
        Key: { id: customerId }
      });

      await client.send(command);
      return { affectedRows: 1 };
    } catch (err) {
      throw err;
    }
  }
}

module.exports = Customer;
