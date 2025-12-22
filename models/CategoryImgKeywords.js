const { getDynamoDBClient } = require('../config/dynamodb');
const { GetCommand, PutCommand, UpdateCommand, ScanCommand, BatchGetCommand, BatchWriteCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');

const TABLE_NAME = 'category_img_keywords';

class CategoryImgKeywords {
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

  // Get all category image keywords
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
          // Filter out soft-deleted items
          const activeItems = response.Items.filter(item => !item.deleted);
          allItems.push(...activeItems);
        }
        
        lastKey = response.LastEvaluatedKey;
      } while (lastKey);
      
      return allItems;
    } catch (err) {
      throw err;
    }
  }

  // Get categories updated after a specific timestamp
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
      // Add a buffer (subtract 30 seconds) to catch updates that happened just before the timestamp
      // This handles timing issues where the update happened shortly before the timestamp was set
      // This is especially important when a category is created and then its image is updated shortly after
      const timestampDate = new Date(timestampStr);
      const bufferedTimestamp = new Date(timestampDate.getTime() - 30000).toISOString(); // 30 second buffer
      
      console.log(`🔍 [CategoryImgKeywords.getUpdatedAfter] Filtering categories:`);
      console.log(`   Original timestamp: ${timestampStr}`);
      console.log(`   Buffered timestamp: ${bufferedTimestamp} (30s buffer to catch recent updates)`);
      console.log(`   Total items to check: ${allItems.length}`);
      
      // Log a few sample items for debugging
      const sampleItems = allItems.slice(0, 3);
      sampleItems.forEach(item => {
        console.log(`   📋 Sample category ${item.id} (${item.category_name || item.cat_name || 'N/A'}):`);
        console.log(`      updated_at: ${item.updated_at || 'missing'}`);
        console.log(`      created_at: ${item.created_at || 'missing'}`);
        if (item.updated_at) {
          const itemDate = new Date(item.updated_at);
          const bufferedDate = new Date(bufferedTimestamp);
          const isAfter = itemDate > bufferedDate;
          console.log(`      Comparison: ${item.updated_at} > ${bufferedTimestamp} = ${isAfter}`);
          console.log(`      Time difference: ${Math.round((itemDate.getTime() - bufferedDate.getTime()) / 1000)} seconds`);
        }
      });
      
      const filtered = allItems.filter(item => {
        const updatedAt = item.updated_at;
        const createdAt = item.created_at;
        const isDeleted = item.deleted === true;
        
        // ALWAYS include deleted items - they need to be sent to client to remove from cache
        // This ensures deleted items are propagated even if deletion timestamp is old
        if (isDeleted) {
          if (updatedAt && updatedAt > bufferedTimestamp) {
            console.log(`   🗑️  Category ${item.id} (${item.category_name || item.cat_name || 'N/A'}): DELETED after timestamp`);
          } else {
            console.log(`   🗑️  Category ${item.id} (${item.category_name || item.cat_name || 'N/A'}): DELETED (including regardless of timestamp to ensure removal)`);
          }
          return true;
        }
        
        // Check if updated_at exists and is greater than buffered timestamp
        if (updatedAt) {
          const isUpdated = updatedAt > bufferedTimestamp;
          if (isUpdated) {
            const itemDate = new Date(updatedAt);
            const bufferedDate = new Date(bufferedTimestamp);
            const diffSeconds = Math.round((itemDate.getTime() - bufferedDate.getTime()) / 1000);
            console.log(`   ✅ Category ${item.id} (${item.category_name || item.cat_name || 'N/A'}): updated_at (${updatedAt}) > buffered timestamp (${diffSeconds}s ahead)`);
            return true;
          } else {
            // Log why it didn't match (for debugging)
            const itemDate = new Date(updatedAt);
            const bufferedDate = new Date(bufferedTimestamp);
            const diffSeconds = Math.round((bufferedDate.getTime() - itemDate.getTime()) / 1000);
            if (diffSeconds < 60) { // Only log if within 1 minute (to avoid spam)
              console.log(`   ❌ Category ${item.id} (${item.category_name || item.cat_name || 'N/A'}): updated_at (${updatedAt}) <= buffered timestamp (${diffSeconds}s behind)`);
            }
          }
        }
        
        // Check if created_at is greater than buffered timestamp (for newly created items)
        if (createdAt) {
          const isNew = createdAt > bufferedTimestamp;
          if (isNew) {
            console.log(`   ✅ Category ${item.id} (${item.category_name || item.cat_name || 'N/A'}): created_at (${createdAt}) > buffered timestamp`);
            return true;
          }
        }
        
        return false;
      });
      
      console.log(`📊 [CategoryImgKeywords.getUpdatedAfter] Found ${filtered.length} updated categories out of ${allItems.length} total`);
      if (filtered.length > 0) {
        console.log(`   Updated category IDs: ${filtered.map(c => c.id).join(', ')}`);
        filtered.forEach(cat => {
          console.log(`   - Category ${cat.id}: ${cat.category_name || cat.cat_name || 'N/A'}, updated_at: ${cat.updated_at}, created_at: ${cat.created_at}`);
        });
      }
      
      return filtered;
    } catch (err) {
      console.error('❌ Error in CategoryImgKeywords.getUpdatedAfter:', err);
      throw err;
    }
  }

  // Find by category name
  static async findByCategoryName(categoryName) {
    try {
      const client = getDynamoDBClient();
      let lastKey = null;
      const allItems = [];
      
      do {
        const params = {
          TableName: TABLE_NAME,
          FilterExpression: 'category_name = :categoryName',
          ExpressionAttributeValues: {
            ':categoryName': categoryName
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

  // Find by multiple category names
  static async findByCategoryNames(categoryNames) {
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
          // Filter in memory since DynamoDB doesn't support IN with strings easily
          const matching = response.Items.filter(item => 
            categoryNames.includes(item.category_name)
          );
          allItems.push(...matching);
        }
        
        lastKey = response.LastEvaluatedKey;
      } while (lastKey);
      
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
      
      const newUpdatedAt = new Date().toISOString();
      updateExpressions.push('#updated = :updated');
      expressionAttributeNames['#updated'] = 'updated_at';
      expressionAttributeValues[':updated'] = newUpdatedAt;
      
      console.log(`📝 [CategoryImgKeywords.update] Updating category ${itemId}:`);
      console.log(`   New updated_at timestamp: ${newUpdatedAt}`);
      console.log(`   Update expressions: ${updateExpressions.join(', ')}`);
      
      const command = new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { id: itemId },
        UpdateExpression: 'SET ' + updateExpressions.join(', '),
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues
      });

      await client.send(command);
      
      // Verify the update by fetching the item
      const updatedItem = await this.findById(itemId);
      if (updatedItem) {
        console.log(`✅ [CategoryImgKeywords.update] Category ${itemId} updated successfully`);
        console.log(`   Verified updated_at: ${updatedItem.updated_at}`);
        console.log(`   Category name: ${updatedItem.category_name || updatedItem.cat_name || 'N/A'}`);
        console.log(`   Category image: ${updatedItem.category_img || updatedItem.cat_img ? (updatedItem.category_img || updatedItem.cat_img).substring(0, 100) + '...' : 'none'}`);
      } else {
        console.warn(`⚠️ [CategoryImgKeywords.update] Could not verify update for category ${itemId}`);
      }
      
      return { affectedRows: 1 };
    } catch (err) {
      throw err;
    }
  }

  // Delete (soft delete - sets deleted flag instead of removing)
  static async delete(id) {
    try {
      const client = getDynamoDBClient();
      const itemId = typeof id === 'string' && !isNaN(id) ? parseInt(id) : id;
      
      // Soft delete: Update the item with deleted flag and updated_at timestamp
      const { UpdateCommand } = require('@aws-sdk/lib-dynamodb');
      const command = new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { id: itemId },
        UpdateExpression: 'SET deleted = :deleted, updated_at = :updated_at',
        ExpressionAttributeValues: {
          ':deleted': true,
          ':updated_at': new Date().toISOString()
        }
      });

      await client.send(command);
      return { affectedRows: 1 };
    } catch (err) {
      throw err;
    }
  }
}

module.exports = CategoryImgKeywords;
