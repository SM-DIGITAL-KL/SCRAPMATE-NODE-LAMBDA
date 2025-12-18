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

  // Get subcategories updated after a specific timestamp
  static async getUpdatedAfter(timestamp) {
    try {
      if (!timestamp) {
        return await this.getAll();
      }

      const client = getDynamoDBClient();
      let lastKey = null;
      const allItems = [];
      
      // Convert timestamp to ISO string if it's not already
      const timestampStr = typeof timestamp === 'string' ? timestamp : new Date(timestamp).toISOString();
      
      // Scan all items and filter in memory for more reliable comparison
      // DynamoDB FilterExpression can be unreliable with string comparisons
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
      
      // Filter in memory: items where updated_at > timestamp OR created_at > timestamp
      // This ensures we catch all updates, including name changes
      const filtered = allItems.filter(item => {
        const updatedAt = item.updated_at;
        const createdAt = item.created_at;
        
        // Check if updated_at exists and is greater than timestamp
        if (updatedAt && updatedAt > timestampStr) {
          return true;
        }
        
        // Check if created_at is greater than timestamp (for newly created items)
        if (createdAt && createdAt > timestampStr) {
          return true;
        }
        
        return false;
      });
      
      console.log(`📊 [Subcategory.getUpdatedAfter] Found ${filtered.length} updated subcategories out of ${allItems.length} total (timestamp: ${timestampStr})`);
      
      return filtered;
    } catch (err) {
      console.error('❌ Error in Subcategory.getUpdatedAfter:', err);
      throw err;
    }
  }

  // Get paginated subcategories
  // OPTIMIZED: Uses Limit parameter to avoid scanning entire table
  static async getPaginated(page = 1, limit = 20, categoryId = null) {
    try {
      const client = getDynamoDBClient();
      const pageNumber = parseInt(page) || 1;
      const pageSize = parseInt(limit) || 20;
      const skip = (pageNumber - 1) * pageSize;
      const itemsNeeded = skip + pageSize;

      let allItems = [];
      let lastKey = null;
      let scannedCount = 0;
      let hasMoreItems = false;

      // Optimized approach: Stop scanning when we have enough items
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
          // For filtered scans, fetch more items to account for filter selectivity
          // DynamoDB filters after scanning, so we need to scan more items
          const remaining = itemsNeeded - allItems.length;
          if (remaining > 0) {
            params.Limit = Math.min(remaining * 5, 500); // Fetch 5x to account for filter
          }
        } else {
          // No filter: use Limit to fetch only what we need
          const remaining = itemsNeeded - allItems.length;
          if (remaining <= 0) break; // We have enough items
          params.Limit = Math.min(remaining + 10, 100); // Fetch a bit extra for safety
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
        hasMoreItems = !!lastKey;

        // Stop early if we have enough items (for non-filtered scans)
        if (!categoryId && allItems.length >= itemsNeeded) {
          break;
        }
        // For filtered scans, continue until we have enough or no more items
        if (categoryId && allItems.length >= itemsNeeded && !lastKey) {
          break;
        }
        // Safety limit: stop if we've scanned too much
        if (scannedCount > 10000) {
          console.warn(`⚠️  Subcategory.getPaginated: Scanned ${scannedCount} items, stopping early`);
          break;
        }
      } while (lastKey && allItems.length < itemsNeeded);

      // Apply pagination
      const total = allItems.length; // Note: For filtered scans, this is approximate
      const paginatedItems = allItems.slice(skip, skip + pageSize);

      return {
        items: paginatedItems,
        total: total,
        page: pageNumber,
        limit: pageSize,
        totalPages: Math.ceil(total / pageSize),
        hasMore: hasMoreItems || (pageNumber * pageSize) < total
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

  // Get subcategories updated after a specific timestamp
  static async getUpdatedAfter(timestamp) {
    try {
      if (!timestamp) {
        return await this.getAll();
      }

      const client = getDynamoDBClient();
      let lastKey = null;
      const allItems = [];
      
      // Convert timestamp to ISO string if it's not already
      const timestampStr = typeof timestamp === 'string' ? timestamp : new Date(timestamp).toISOString();
      
      // Scan all items and filter in memory for more reliable comparison
      // DynamoDB FilterExpression can be unreliable with string comparisons
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
      
      // Filter in memory: items where updated_at > timestamp OR created_at > timestamp
      // This ensures we catch all updates, including name changes
      const filtered = allItems.filter(item => {
        const updatedAt = item.updated_at;
        const createdAt = item.created_at;
        
        // Check if updated_at exists and is greater than timestamp
        if (updatedAt && updatedAt > timestampStr) {
          return true;
        }
        
        // Check if created_at is greater than timestamp (for newly created items)
        if (createdAt && createdAt > timestampStr) {
          return true;
        }
        
        return false;
      });
      
      console.log(`📊 [Subcategory.getUpdatedAfter] Found ${filtered.length} updated subcategories out of ${allItems.length} total (timestamp: ${timestampStr})`);
      
      return filtered;
    } catch (err) {
      console.error('❌ Error in Subcategory.getUpdatedAfter:', err);
      throw err;
    }
  }

  // Get paginated subcategories
  // OPTIMIZED: Uses Limit parameter to avoid scanning entire table
  static async getPaginated(page = 1, limit = 20, categoryId = null) {
    try {
      const client = getDynamoDBClient();
      const pageNumber = parseInt(page) || 1;
      const pageSize = parseInt(limit) || 20;
      const skip = (pageNumber - 1) * pageSize;
      const itemsNeeded = skip + pageSize;

      let allItems = [];
      let lastKey = null;
      let scannedCount = 0;
      let hasMoreItems = false;

      // Optimized approach: Stop scanning when we have enough items
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
          // For filtered scans, fetch more items to account for filter selectivity
          // DynamoDB filters after scanning, so we need to scan more items
          const remaining = itemsNeeded - allItems.length;
          if (remaining > 0) {
            params.Limit = Math.min(remaining * 5, 500); // Fetch 5x to account for filter
          }
        } else {
          // No filter: use Limit to fetch only what we need
          const remaining = itemsNeeded - allItems.length;
          if (remaining <= 0) break; // We have enough items
          params.Limit = Math.min(remaining + 10, 100); // Fetch a bit extra for safety
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
        hasMoreItems = !!lastKey;

        // Stop early if we have enough items (for non-filtered scans)
        if (!categoryId && allItems.length >= itemsNeeded) {
          break;
        }
        // For filtered scans, continue until we have enough or no more items
        if (categoryId && allItems.length >= itemsNeeded && !lastKey) {
          break;
        }
        // Safety limit: stop if we've scanned too much
        if (scannedCount > 10000) {
          console.warn(`⚠️  Subcategory.getPaginated: Scanned ${scannedCount} items, stopping early`);
          break;
        }
      } while (lastKey && allItems.length < itemsNeeded);

      // Apply pagination
      const total = allItems.length; // Note: For filtered scans, this is approximate
      const paginatedItems = allItems.slice(skip, skip + pageSize);

      return {
        items: paginatedItems,
        total: total,
        page: pageNumber,
        limit: pageSize,
        totalPages: Math.ceil(total / pageSize),
        hasMore: hasMoreItems || (pageNumber * pageSize) < total
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





