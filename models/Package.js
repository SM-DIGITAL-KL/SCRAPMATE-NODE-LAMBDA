const { getDynamoDBClient } = require('../config/dynamodb');
const { GetCommand, PutCommand, UpdateCommand, ScanCommand, BatchGetCommand, BatchWriteCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');

const TABLE_NAME = 'packages';

class Package {
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

  // Get all packages (optionally filtered by status)
  static async getAll(status = null) {
    try {
      const client = getDynamoDBClient();
      let lastKey = null;
      const allPackages = [];
      
      do {
        const params = {
          TableName: TABLE_NAME
        };
        
        if (status !== null) {
          params.FilterExpression = 'status = :status';
          params.ExpressionAttributeValues = { ':status': status };
        }
        
        if (lastKey) {
          params.ExclusiveStartKey = lastKey;
        }
        
        const command = new ScanCommand(params);
        const response = await client.send(command);
        
        if (response.Items) {
          allPackages.push(...response.Items);
        }
        
        lastKey = response.LastEvaluatedKey;
      } while (lastKey);
      
      // Sort by id DESC and filter out status 3 if needed
      allPackages.sort((a, b) => (b.id || 0) - (a.id || 0));
      const filtered = status === null ? allPackages.filter(p => p.status !== 3) : allPackages;
      
      return filtered;
    } catch (err) {
      throw err;
    }
  }

  // Find by type
  static async findByType(type) {
    try {
      const client = getDynamoDBClient();
      const typeValue = typeof type === 'string' && !isNaN(type) ? parseInt(type) : type;
      
      const command = new ScanCommand({
        TableName: TABLE_NAME,
        FilterExpression: '#type = :type',
        ExpressionAttributeNames: {
          '#type': 'type'  // 'type' is a reserved keyword in DynamoDB
        },
        ExpressionAttributeValues: {
          ':type': typeValue
        },
        Limit: 1
      });

      const response = await client.send(command);
      return response.Items && response.Items.length > 0 ? response.Items[0] : null;
    } catch (err) {
      throw err;
    }
  }

  // Set free package for new user
  static async setPackage(userId) {
    try {
      const Invoice = require('./Invoice');
      
      // Find free package (type = 1)
      const freePackage = await this.findByType(1);
      
      if (freePackage) {
        // Check if user already has an invoice
        const existingInvoice = await Invoice.findLatestByUserId(userId);
        
        // Only create invoice if user doesn't have one yet
        if (!existingInvoice) {
          const today = new Date();
          const fromDate = today.toISOString().split('T')[0];
          
          // Calculate to_date by adding duration days
          const toDate = new Date(today);
          toDate.setDate(toDate.getDate() + (freePackage.duration || 30));
          const toDateStr = toDate.toISOString().split('T')[0];
          
          // Create invoice
          const invoiceData = {
            user_id: typeof userId === 'string' && !isNaN(userId) ? parseInt(userId) : userId,
            from_date: fromDate,
            to_date: toDateStr,
            name: freePackage.name || 'Free Package',
            displayname: freePackage.displayname || 'Free',
            type: 'Free',
            price: freePackage.price || 0,
            duration: freePackage.duration || 30
          };
          
          await Invoice.create(invoiceData);
          console.log(`✅ Created free package invoice for user ${userId}`);
        } else {
          console.log(`ℹ️  User ${userId} already has an invoice, skipping package setup`);
        }
      } else {
        console.log('⚠️  No free package (type=1) found in packages table');
      }
      
      return true;
    } catch (err) {
      console.error('Error setting package:', err);
      // Don't throw error - allow registration to continue even if package setup fails
      return true;
    }
  }
}

module.exports = Package;
