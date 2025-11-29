#!/usr/bin/env node
/**
 * Script to help migrate all models from MySQL to DynamoDB
 * This creates template files for models that need migration
 */

const fs = require('fs');
const path = require('path');

const modelsDir = path.join(__dirname, '..', 'models');
const modelsToMigrate = [
  'DeliveryBoy.js',
  'Invoice.js',
  'Notifications.js',
  'OrderRatings.js',
  'Package.js',
  'ShopImages.js',
  'CallLog.js'
];

const tableNameMap = {
  'DeliveryBoy.js': 'delivery_boy',
  'Invoice.js': 'invoice',
  'Notifications.js': 'notifications',
  'OrderRatings.js': 'order_rating',
  'Package.js': 'packages',
  'ShopImages.js': 'shop_images',
  'CallLog.js': 'call_logs'
};

// Template as a function to avoid template literal issues
function generateTemplate(tableName, className) {
  return `const { getDynamoDBClient } = require('../config/dynamodb');
const { GetCommand, PutCommand, UpdateCommand, ScanCommand, BatchGetCommand, BatchWriteCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');

const TABLE_NAME = '${tableName}';

class ${className} {
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
}

module.exports = ${className};
`;
}

console.log('Creating DynamoDB migration templates...\n');

modelsToMigrate.forEach(modelFile => {
  const className = modelFile.replace('.js', '');
  const tableName = tableNameMap[modelFile] || className.toLowerCase();
  
  const content = generateTemplate(tableName, className);
  
  const filePath = path.join(modelsDir, modelFile);
  const backupPath = path.join(modelsDir, `${modelFile}.mysql.backup`);
  
  // Backup existing file if it exists
  if (fs.existsSync(filePath)) {
    const existingContent = fs.readFileSync(filePath, 'utf-8');
    fs.writeFileSync(backupPath, existingContent, 'utf-8');
    console.log(`✅ Backed up ${modelFile} to ${modelFile}.mysql.backup`);
  }
  
  // Write new DynamoDB version
  fs.writeFileSync(filePath, content, 'utf-8');
  console.log(`✅ Created DynamoDB version of ${modelFile}`);
});

console.log(`\n✅ Migration templates created for ${modelsToMigrate.length} models`);
console.log('⚠️  Note: You may need to add custom methods based on your SQL queries');
console.log('⚠️  Original MySQL files backed up with .mysql.backup extension');
