const { getDynamoDBClient } = require('../config/dynamodb');
const { GetCommand, PutCommand, UpdateCommand, ScanCommand, BatchWriteCommand } = require('@aws-sdk/lib-dynamodb');

const TABLE_NAME = 'live_prices';

class LivePrice {
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

  // Get all live prices
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
      // Handle case where table doesn't exist yet
      if (err.name === 'ResourceNotFoundException' || err.__type === 'com.amazonaws.dynamodb.v20120810#ResourceNotFoundException') {
        console.log('⚠️  Live prices table does not exist yet. Returning empty array.');
        return [];
      }
      throw err;
    }
  }

  // Get by location
  static async findByLocation(location) {
    try {
      const client = getDynamoDBClient();
      let lastKey = null;
      const allItems = [];

      do {
        const params = {
          TableName: TABLE_NAME,
          FilterExpression: 'location = :location',
          ExpressionAttributeValues: {
            ':location': location
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
      // Handle case where table doesn't exist yet
      if (err.name === 'ResourceNotFoundException' || err.__type === 'com.amazonaws.dynamodb.v20120810#ResourceNotFoundException') {
        console.log('⚠️  Live prices table does not exist yet. Returning empty array.');
        return [];
      }
      throw err;
    }
  }

  // Get by category
  static async findByCategory(category) {
    try {
      const client = getDynamoDBClient();
      let lastKey = null;
      const allItems = [];

      do {
        const params = {
          TableName: TABLE_NAME,
          FilterExpression: 'category = :category',
          ExpressionAttributeValues: {
            ':category': category
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
      // Handle case where table doesn't exist yet
      if (err.name === 'ResourceNotFoundException' || err.__type === 'com.amazonaws.dynamodb.v20120810#ResourceNotFoundException') {
        console.log('⚠️  Live prices table does not exist yet. Returning empty array.');
        return [];
      }
      throw err;
    }
  }

  // Create or update live price
  static async createOrUpdate(data) {
    try {
      const client = getDynamoDBClient();
      
      // Generate unique ID based on location, item, and category
      const uniqueKey = `${data.location || ''}_${data.item || ''}_${data.category || ''}`;
      const id = data.id || (Date.now() + Math.floor(Math.random() * 1000));
      
      const livePrice = {
        id: id,
        location: data.location || '',
        item: data.item || '',
        category: data.category || null,
        city: data.city || null,
        buy_price: data.buy_price || null,
        sell_price: data.sell_price || null,
        lme_price: data.lme_price || null,
        mcx_price: data.mcx_price || null,
        injection_moulding: data.injection_moulding || null,
        battery_price: data.battery_price || null,
        pe_63: data.pe_63 || null,
        drum_scrap: data.drum_scrap || null,
        blow: data.blow || null,
        pe_100: data.pe_100 || null,
        crate: data.crate || null,
        black_cable: data.black_cable || null,
        white_pipe: data.white_pipe || null,
        grey_pvc: data.grey_pvc || null,
        unique_key: uniqueKey, // For deduplication
        created_at: data.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const command = new PutCommand({
        TableName: TABLE_NAME,
        Item: livePrice
      });

      await client.send(command);
      return livePrice;
    } catch (err) {
      // Handle case where table doesn't exist yet
      if (err.name === 'ResourceNotFoundException' || err.__type === 'com.amazonaws.dynamodb.v20120810#ResourceNotFoundException') {
        throw new Error(`Live prices table does not exist. Please create the '${TABLE_NAME}' table in DynamoDB first.`);
      }
      throw err;
    }
  }

  // Batch create/update live prices
  static async batchCreateOrUpdate(prices) {
    try {
      const client = getDynamoDBClient();
      const batchSize = 25; // DynamoDB batch write limit
      const batches = [];

      console.log(`📦 Preparing to batch write ${prices.length} prices in batches of ${batchSize}`);

      // Split into batches
      for (let i = 0; i < prices.length; i += batchSize) {
        batches.push(prices.slice(i, i + batchSize));
      }

      console.log(`📦 Created ${batches.length} batches`);

      // Process each batch
      let totalWritten = 0;
      const baseTimestamp = Date.now(); // Use same base timestamp for all items in this sync
      
      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex];
        console.log(`📝 Processing batch ${batchIndex + 1}/${batches.length} (${batch.length} items)`);
        
        const writeRequests = batch.map((price, batchItemIndex) => {
          // Generate unique ID for each item
          // Formula: baseTimestamp + (batchIndex * 10000) + batchItemIndex
          // This ensures each ID is unique across all batches and items
          // batchIndex * 10000 gives us room for up to 10000 items per batch
          const globalIndex = (batchIndex * 10000) + batchItemIndex;
          const id = price.id || (baseTimestamp + globalIndex);
          
          return {
            PutRequest: {
              Item: {
                id: id,
                location: price.location || '',
                item: price.item || '',
                category: price.category || null,
                city: price.city || null,
                buy_price: price.buy_price || null,
                sell_price: price.sell_price || null,
                lme_price: price.lme_price || null,
                mcx_price: price.mcx_price || null,
                injection_moulding: price.injection_moulding || null,
                battery_price: price.battery_price || null,
                pe_63: price.pe_63 || null,
                drum_scrap: price.drum_scrap || null,
                blow: price.blow || null,
                pe_100: price.pe_100 || null,
                crate: price.crate || null,
                black_cable: price.black_cable || null,
                white_pipe: price.white_pipe || null,
                grey_pvc: price.grey_pvc || null,
                unique_key: `${price.location || ''}_${price.item || ''}_${price.category || ''}`,
                created_at: price.created_at || new Date().toISOString(),
                updated_at: new Date().toISOString()
              }
            }
          };
        });

        try {
          const command = new BatchWriteCommand({
            RequestItems: {
              [TABLE_NAME]: writeRequests
            }
          });

          await client.send(command);
          totalWritten += batch.length;
          console.log(`✅ Batch ${batchIndex + 1}/${batches.length} written successfully (${totalWritten}/${prices.length} total)`);
        } catch (batchErr) {
          console.error(`❌ Error writing batch ${batchIndex + 1}:`, batchErr);
          // If table doesn't exist, throw with helpful message
          if (batchErr.name === 'ResourceNotFoundException' || batchErr.__type === 'com.amazonaws.dynamodb.v20120810#ResourceNotFoundException') {
            throw new Error(`Live prices table does not exist. Please create the '${TABLE_NAME}' table in DynamoDB first.`);
          }
          throw batchErr;
        }
      }

      console.log(`✅ Successfully wrote ${totalWritten} prices to DynamoDB`);
      return { success: true, count: totalWritten };
    } catch (err) {
      // Handle case where table doesn't exist yet
      if (err.name === 'ResourceNotFoundException' || err.__type === 'com.amazonaws.dynamodb.v20120810#ResourceNotFoundException') {
        throw new Error(`Live prices table does not exist. Please create the '${TABLE_NAME}' table in DynamoDB first.`);
      }
      throw err;
    }
  }

  // Delete all live prices (for refresh)
  static async deleteAll() {
    try {
      const client = getDynamoDBClient();
      
      // Get all items first
      const allItems = await LivePrice.getAll();
      
      // If table doesn't exist or no items, return success
      if (allItems.length === 0) {
        return { success: true, deleted: 0 };
      }

      // Delete in batches
      const batchSize = 25;
      const batches = [];

      for (let i = 0; i < allItems.length; i += batchSize) {
        batches.push(allItems.slice(i, i + batchSize));
      }

      for (const batch of batches) {
        const deleteRequests = batch.map(item => ({
          DeleteRequest: {
            Key: { id: item.id }
          }
        }));

        const command = new BatchWriteCommand({
          RequestItems: {
            [TABLE_NAME]: deleteRequests
          }
        });

        await client.send(command);
      }

      return { success: true, deleted: allItems.length };
    } catch (err) {
      // Handle case where table doesn't exist yet
      if (err.name === 'ResourceNotFoundException' || err.__type === 'com.amazonaws.dynamodb.v20120810#ResourceNotFoundException') {
        console.log('⚠️  Live prices table does not exist yet. Nothing to delete.');
        return { success: true, deleted: 0 };
      }
      throw err;
    }
  }
}

module.exports = LivePrice;
