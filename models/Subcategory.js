const { getDynamoDBClient } = require('../config/dynamodb');
const { GetCommand, PutCommand, UpdateCommand, ScanCommand, BatchGetCommand, BatchWriteCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');

const TABLE_NAME = 'subcategory';

class Subcategory {
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

  // Find by main category ID
  static async findByMainCategoryId(mainCategoryId) {
    try {
      const client = getDynamoDBClient();
      const catId = typeof mainCategoryId === 'string' && !isNaN(mainCategoryId) ? parseInt(mainCategoryId) : mainCategoryId;

      let lastKey = null;
      const allItems = [];

      do {
        const params = {
          TableName: TABLE_NAME,
          FilterExpression: 'main_category_id = :mainCategoryId',
          ExpressionAttributeValues: {
            ':mainCategoryId': catId
          }
        };

        if (lastKey) {
          params.ExclusiveStartKey = lastKey;
        }

        const command = new ScanCommand(params);
        const response = await client.send(command);

        if (response.Items) {
          allItems.push(...response.Items);
        }

        lastKey = response.LastEvaluatedKey;
      } while (lastKey);

      return allItems;
    } catch (err) {
      throw err;
    }
  }

  // Get all subcategories
  static async getAll() {
    try {
      const client = getDynamoDBClient();
      let lastKey = null;
      const allItems = [];

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
          allItems.push(...response.Items);
        }

        lastKey = response.LastEvaluatedKey;
      } while (lastKey);

      return allItems;
    } catch (err) {
      throw err;
    }
  }

  // Get paginated subcategories
  static async getPaginated(page = 1, limit = 20, categoryId = null) {
    try {
      const client = getDynamoDBClient();
      const pageNumber = parseInt(page) || 1;
      const pageSize = parseInt(limit) || 20;
      const skip = (pageNumber - 1) * pageSize;

      let allItems = [];
      let lastKey = null;
      let scannedCount = 0;

      // First, get all items (with optional category filter)
      do {
        const params = {
          TableName: TABLE_NAME
        };

        if (categoryId) {
          const catId = typeof categoryId === 'string' && !isNaN(categoryId) ? parseInt(categoryId) : categoryId;
          params.FilterExpression = 'main_category_id = :mainCategoryId';
          params.ExpressionAttributeValues = {
            ':mainCategoryId': catId
          };
        }

        if (lastKey) {
          params.ExclusiveStartKey = lastKey;
        }

        const command = new ScanCommand(params);
        const response = await client.send(command);

        if (response.Items) {
          allItems.push(...response.Items);
        }

        scannedCount += response.ScannedCount || 0;
        lastKey = response.LastEvaluatedKey;
      } while (lastKey);

      // Apply pagination
      const total = allItems.length;
      const paginatedItems = allItems.slice(skip, skip + pageSize);

      return {
        items: paginatedItems,
        total: total,
        page: pageNumber,
        limit: pageSize,
        totalPages: Math.ceil(total / pageSize),
        hasMore: (pageNumber * pageSize) < total
      };
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
        id: id,
        main_category_id: typeof data.main_category_id === 'string' && !isNaN(data.main_category_id) ? parseInt(data.main_category_id) : data.main_category_id,
        subcategory_name: data.subcategory_name || '',
        default_price: data.default_price || '',
        price_unit: data.price_unit || 'kg', // 'kg' or 'pcs'
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

  // Batch create
  static async batchCreate(subcategories) {
    try {
      const client = getDynamoDBClient();
      const batchSize = 25;
      const allResults = [];

      for (let i = 0; i < subcategories.length; i += batchSize) {
        const batch = subcategories.slice(i, i + batchSize);
        const putRequests = batch.map(subcat => ({
          PutRequest: {
            Item: {
              id: subcat.id || (Date.now() + Math.floor(Math.random() * 1000) + i),
              main_category_id: typeof subcat.main_category_id === 'string' && !isNaN(subcat.main_category_id) ? parseInt(subcat.main_category_id) : subcat.main_category_id,
              subcategory_name: subcat.subcategory_name || '',
              default_price: subcat.default_price || '',
              price_unit: subcat.price_unit || 'kg',
              created_at: subcat.created_at || new Date().toISOString(),
              updated_at: subcat.updated_at || new Date().toISOString()
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
        Key: { id: itemId },
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

module.exports = Subcategory;





