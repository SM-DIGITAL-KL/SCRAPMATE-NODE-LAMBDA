const { getDynamoDBClient } = require('../config/dynamodb');
const { GetCommand, PutCommand, UpdateCommand, ScanCommand, BatchGetCommand, BatchWriteCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');

const TABLE_NAME = 'products';

class Product {
  static async findByShopId(shopId, catId = null) {
    try {
      const client = getDynamoDBClient();
      const sid = typeof shopId === 'string' && !isNaN(shopId) ? parseInt(shopId) : shopId;
      
      let filterExpression = 'shop_id = :shopId';
      const expressionAttributeValues = { ':shopId': sid };
      
      if (catId) {
        const cid = typeof catId === 'string' && !isNaN(catId) ? parseInt(catId) : catId;
        filterExpression += ' AND cat_id = :catId';
        expressionAttributeValues[':catId'] = cid;
      }
      
      const command = new ScanCommand({
        TableName: TABLE_NAME,
        FilterExpression: filterExpression,
        ExpressionAttributeValues: expressionAttributeValues
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
      const pid = typeof id === 'string' && !isNaN(id) ? parseInt(id) : id;
      
      const command = new GetCommand({
        TableName: TABLE_NAME,
        Key: { id: pid }
      });

      const response = await client.send(command);
      return response.Item || null;
    } catch (err) {
      throw err;
    }
  }

  // Count products by shop ID (optimized with Select: "COUNT")
  static async getCountByShopId(shopId) {
    try {
      const client = getDynamoDBClient();
      const sid = typeof shopId === 'string' && !isNaN(shopId) ? parseInt(shopId) : shopId;
      let lastKey = null;
      let count = 0;
      
      do {
        const params = {
          TableName: TABLE_NAME,
          FilterExpression: 'shop_id = :shopId',
          ExpressionAttributeValues: {
            ':shopId': sid
          },
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
      throw err;
    }
  }

  // Count products by category ID (optimized with Select: "COUNT")
  static async countByCategoryId(catId) {
    try {
      const client = getDynamoDBClient();
      const cid = typeof catId === 'string' && !isNaN(catId) ? parseInt(catId) : catId;
      let lastKey = null;
      let count = 0;
      
      do {
        const params = {
          TableName: TABLE_NAME,
          FilterExpression: 'cat_id = :catId',
          ExpressionAttributeValues: {
            ':catId': cid
          },
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
      throw err;
    }
  }

  static async findByCategoryId(catId) {
    try {
      const client = getDynamoDBClient();
      const cid = typeof catId === 'string' && !isNaN(catId) ? parseInt(catId) : catId;
      
      const command = new ScanCommand({
        TableName: TABLE_NAME,
        FilterExpression: 'cat_id = :catId',
        ExpressionAttributeValues: {
          ':catId': cid
        }
      });

      const response = await client.send(command);
      return response.Items || [];
    } catch (err) {
      throw err;
    }
  }

  static async create(data) {
    try {
      const client = getDynamoDBClient();
      const id = data.id || (Date.now() + Math.floor(Math.random() * 1000));
      
      const product = {
        id: id,
        shop_id: typeof data.shop_id === 'string' && !isNaN(data.shop_id) ? parseInt(data.shop_id) : data.shop_id,
        cat_id: typeof data.cat_id === 'string' && !isNaN(data.cat_id) ? parseInt(data.cat_id) : data.cat_id,
        name: data.name,
        description: data.description || '',
        price: typeof data.price === 'string' && !isNaN(data.price) ? parseFloat(data.price) : data.price,
        image: data.image || '',
        filesize: data.filesize || '',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const command = new PutCommand({
        TableName: TABLE_NAME,
        Item: product
      });

      await client.send(command);
      return product;
    } catch (err) {
      throw err;
    }
  }

  static async update(id, data) {
    try {
      const client = getDynamoDBClient();
      const pid = typeof id === 'string' && !isNaN(id) ? parseInt(id) : id;
      
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
        Key: { id: pid },
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
      const pid = typeof id === 'string' && !isNaN(id) ? parseInt(id) : id;
      
      const command = new DeleteCommand({
        TableName: TABLE_NAME,
        Key: { id: pid }
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
      const allProducts = [];
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
          allProducts.push(...response.Responses[TABLE_NAME]);
        }
      }

      return allProducts;
    } catch (err) {
      throw err;
    }
  }

  static async findByShopIds(shopIds, catId = null) {
    try {
      const client = getDynamoDBClient();
      const allProducts = [];
      const batchSize = 10;
      
      for (let i = 0; i < shopIds.length; i += batchSize) {
        const batch = shopIds.slice(i, i + batchSize);
        const shopIdsList = batch.map(sid => typeof sid === 'string' && !isNaN(sid) ? parseInt(sid) : sid);
        
        let filterExpression = `shop_id IN (${shopIdsList.map((_, idx) => `:sid${idx}`).join(', ')})`;
        const expressionAttributeValues = shopIdsList.reduce((acc, sid, idx) => {
          acc[`:sid${idx}`] = sid;
          return acc;
        }, {});
        
        if (catId) {
          const cid = typeof catId === 'string' && !isNaN(catId) ? parseInt(catId) : catId;
          filterExpression += ' AND cat_id = :catId';
          expressionAttributeValues[':catId'] = cid;
        }
        
        const command = new ScanCommand({
          TableName: TABLE_NAME,
          FilterExpression: filterExpression,
          ExpressionAttributeValues: expressionAttributeValues
        });

        const response = await client.send(command);
        if (response.Items) {
          allProducts.push(...response.Items);
        }
      }

      return allProducts;
    } catch (err) {
      throw err;
    }
  }

  static async batchCreate(products) {
    try {
      const client = getDynamoDBClient();
      const batchSize = 25;
      const allResults = [];
      
      for (let i = 0; i < products.length; i += batchSize) {
        const batch = products.slice(i, i + batchSize);
        const putRequests = batch.map(product => ({
          PutRequest: {
            Item: {
              ...product,
              id: product.id || (Date.now() + Math.floor(Math.random() * 1000)),
              created_at: product.created_at || new Date().toISOString(),
              updated_at: product.updated_at || new Date().toISOString()
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

  // Get all products
  static async getAll() {
    try {
      const client = getDynamoDBClient();
      let lastKey = null;
      const allProducts = [];
      
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
          allProducts.push(...response.Items);
        }
        
        lastKey = response.LastEvaluatedKey;
      } while (lastKey);
      
      return allProducts;
    } catch (err) {
      throw err;
    }
  }
}

module.exports = Product;
