const { getDynamoDBClient } = require('../config/dynamodb');
const { GetCommand, PutCommand, UpdateCommand, ScanCommand, BatchGetCommand, BatchWriteCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');

const TABLE_NAME = 'product_category';

class ProductCategory {
  static async findByShopId(shopId) {
    try {
      const client = getDynamoDBClient();
      const sid = typeof shopId === 'string' && !isNaN(shopId) ? parseInt(shopId) : shopId;
      
      const command = new ScanCommand({
        TableName: TABLE_NAME,
        FilterExpression: 'shop_id = :shopId',
        ExpressionAttributeValues: {
          ':shopId': sid
        }
      });

      const response = await client.send(command);
      return response.Items || [];
    } catch (err) {
      throw err;
    }
  }

  static async findById(id) {
    try {
      const client = getDynamoDBClient();
      const cid = typeof id === 'string' && !isNaN(id) ? parseInt(id) : id;
      
      const command = new GetCommand({
        TableName: TABLE_NAME,
        Key: { id: cid }
      });

      const response = await client.send(command);
      return response.Item || null;
    } catch (err) {
      throw err;
    }
  }

  static async create(data) {
    try {
      const client = getDynamoDBClient();
      const id = data.id || (Date.now() + Math.floor(Math.random() * 1000));
      
      const category = {
        id: id,
        shop_id: typeof data.shop_id === 'string' && !isNaN(data.shop_id) ? parseInt(data.shop_id) : data.shop_id,
        cat_name: data.cat_name,
        cat_img: data.cat_img || '',
        filesize: data.filesize || '',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const command = new PutCommand({
        TableName: TABLE_NAME,
        Item: category
      });

      await client.send(command);
      return category;
    } catch (err) {
      throw err;
    }
  }

  static async update(id, data) {
    try {
      const client = getDynamoDBClient();
      const cid = typeof id === 'string' && !isNaN(id) ? parseInt(id) : id;
      
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
        Key: { id: cid },
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

  static async delete(id) {
    try {
      const client = getDynamoDBClient();
      const cid = typeof id === 'string' && !isNaN(id) ? parseInt(id) : id;
      
      const command = new DeleteCommand({
        TableName: TABLE_NAME,
        Key: { id: cid }
      });

      await client.send(command);
      return { affectedRows: 1 };
    } catch (err) {
      throw err;
    }
  }

  static async getCountByShopId(shopId) {
    try {
      const categories = await this.findByShopId(shopId);
      return categories.length;
    } catch (err) {
      throw err;
    }
  }

  static async getByCategoryNames(shopId, categoryNames) {
    try {
      const client = getDynamoDBClient();
      const sid = typeof shopId === 'string' && !isNaN(shopId) ? parseInt(shopId) : shopId;
      
      const command = new ScanCommand({
        TableName: TABLE_NAME,
        FilterExpression: 'shop_id = :shopId AND cat_name IN (:catNames)',
        ExpressionAttributeValues: {
          ':shopId': sid,
          ':catNames': categoryNames
        }
      });

      const response = await client.send(command);
      return (response.Items || []).map(item => ({
        id: item.id,
        cat_name: item.cat_name
      }));
    } catch (err) {
      throw err;
    }
  }

  // Batch operations
  static async findByIds(ids) {
    try {
      const client = getDynamoDBClient();
      const allCategories = [];
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
          allCategories.push(...response.Responses[TABLE_NAME]);
        }
      }

      return allCategories;
    } catch (err) {
      throw err;
    }
  }

  static async findByShopIds(shopIds) {
    try {
      const client = getDynamoDBClient();
      const allCategories = [];
      const batchSize = 10;
      
      for (let i = 0; i < shopIds.length; i += batchSize) {
        const batch = shopIds.slice(i, i + batchSize);
        const shopIdsList = batch.map(sid => typeof sid === 'string' && !isNaN(sid) ? parseInt(sid) : sid);
        
        const command = new ScanCommand({
          TableName: TABLE_NAME,
          FilterExpression: `shop_id IN (${shopIdsList.map((_, idx) => `:sid${idx}`).join(', ')})`,
          ExpressionAttributeValues: shopIdsList.reduce((acc, sid, idx) => {
            acc[`:sid${idx}`] = sid;
            return acc;
          }, {})
        });

        const response = await client.send(command);
        if (response.Items) {
          allCategories.push(...response.Items);
        }
      }

      return allCategories;
    } catch (err) {
      throw err;
    }
  }

  static async batchCreate(categories) {
    try {
      const client = getDynamoDBClient();
      const batchSize = 25;
      const allResults = [];
      
      for (let i = 0; i < categories.length; i += batchSize) {
        const batch = categories.slice(i, i + batchSize);
        const putRequests = batch.map(category => ({
          PutRequest: {
            Item: {
              ...category,
              id: category.id || (Date.now() + Math.floor(Math.random() * 1000)),
              created_at: category.created_at || new Date().toISOString(),
              updated_at: category.updated_at || new Date().toISOString()
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

  // Get all product categories
  static async getAll() {
    try {
      const client = getDynamoDBClient();
      let lastKey = null;
      const allCategories = [];
      
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
          allCategories.push(...response.Items);
        }
        
        lastKey = response.LastEvaluatedKey;
      } while (lastKey);
      
      return allCategories;
    } catch (err) {
      throw err;
    }
  }
}

module.exports = ProductCategory;
