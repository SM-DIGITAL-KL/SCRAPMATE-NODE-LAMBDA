const { getDynamoDBClient } = require('../config/dynamodb');
const { GetCommand, PutCommand, UpdateCommand, ScanCommand, BatchGetCommand, BatchWriteCommand } = require('@aws-sdk/lib-dynamodb');

const TABLE_NAME = 'orders';

class Order {
  static async findByOrderNo(orderNo) {
    try {
      const client = getDynamoDBClient();
      
      const command = new ScanCommand({
        TableName: TABLE_NAME,
        FilterExpression: 'order_no = :orderNo OR order_number = :orderNo',
        ExpressionAttributeValues: {
          ':orderNo': orderNo
        }
      });

      const response = await client.send(command);
      return response.Items || [];
    } catch (err) {
      throw err;
    }
  }

  static async findByShopId(shopId, status = null, offset = 0, limit = 10) {
    try {
      const client = getDynamoDBClient();
      const sid = typeof shopId === 'string' && !isNaN(shopId) ? parseInt(shopId) : shopId;
      
      let filterExpression = 'shop_id = :shopId';
      const expressionAttributeNames = { '#status': 'status' };
      const expressionAttributeValues = { ':shopId': sid };
      
      if (status !== null) {
        filterExpression += ' AND #status = :status';
        expressionAttributeValues[':status'] = status;
      }
      
      const command = new ScanCommand({
        TableName: TABLE_NAME,
        FilterExpression: filterExpression,
        ExpressionAttributeNames: status !== null ? expressionAttributeNames : undefined,
        ExpressionAttributeValues: expressionAttributeValues
      });

      const response = await client.send(command);
      let results = response.Items || [];
      
      // Sort by id DESC (DynamoDB doesn't support ORDER BY, so we sort in memory)
      results.sort((a, b) => (b.id || 0) - (a.id || 0));
      
      // Apply pagination
      if (offset > 0) {
        results = results.slice(offset * limit, (offset * limit) + limit);
      } else {
        results = results.slice(0, limit);
      }
      
      return results;
    } catch (err) {
      throw err;
    }
  }

  static async findByCustomerId(customerId) {
    try {
      const client = getDynamoDBClient();
      const cid = typeof customerId === 'string' && !isNaN(customerId) ? parseInt(customerId) : customerId;
      
      const command = new ScanCommand({
        TableName: TABLE_NAME,
        FilterExpression: 'customer_id = :customerId',
        ExpressionAttributeValues: {
          ':customerId': cid
        }
      });

      const response = await client.send(command);
      let results = response.Items || [];
      results.sort((a, b) => (b.id || 0) - (a.id || 0));
      return results;
    } catch (err) {
      throw err;
    }
  }

  static async findByDeliveryBoyId(delvBoyId) {
    try {
      const client = getDynamoDBClient();
      const dbid = typeof delvBoyId === 'string' && !isNaN(delvBoyId) ? parseInt(delvBoyId) : delvBoyId;
      
      const command = new ScanCommand({
        TableName: TABLE_NAME,
        FilterExpression: 'delv_boy_id = :dbid OR delv_id = :dbid',
        ExpressionAttributeValues: {
          ':dbid': dbid
        }
      });

      const response = await client.send(command);
      let results = response.Items || [];
      results.sort((a, b) => (b.id || 0) - (a.id || 0));
      return results;
    } catch (err) {
      throw err;
    }
  }

  static async findCompletedByDeliveryBoyId(delvBoyId) {
    try {
      const client = getDynamoDBClient();
      const dbid = typeof delvBoyId === 'string' && !isNaN(delvBoyId) ? parseInt(delvBoyId) : delvBoyId;
      
      const command = new ScanCommand({
        TableName: TABLE_NAME,
        FilterExpression: '(delv_boy_id = :dbid OR delv_id = :dbid) AND #status = :status',
        ExpressionAttributeNames: {
          '#status': 'status'
        },
        ExpressionAttributeValues: {
          ':dbid': dbid,
          ':status': 4
        }
      });

      const response = await client.send(command);
      let results = response.Items || [];
      results.sort((a, b) => (b.id || 0) - (a.id || 0));
      return results;
    } catch (err) {
      throw err;
    }
  }

  static async findPendingByCustomerId(customerId) {
    try {
      const client = getDynamoDBClient();
      const cid = typeof customerId === 'string' && !isNaN(customerId) ? parseInt(customerId) : customerId;
      const today = new Date().toISOString().split('T')[0];
      
      // Scan and filter in memory for complex date logic
      const command = new ScanCommand({
        TableName: TABLE_NAME,
        FilterExpression: 'customer_id = :customerId',
        ExpressionAttributeValues: {
          ':customerId': cid
        }
      });

      const response = await client.send(command);
      let results = (response.Items || []).filter(order => {
        if (order.status !== 4) return true;
        const orderDate = order.updated_at ? order.updated_at.split('T')[0] : null;
        return orderDate === today;
      });
      
      results.sort((a, b) => (b.id || 0) - (a.id || 0));
      return results;
    } catch (err) {
      throw err;
    }
  }

  static async create(data) {
    try {
      const client = getDynamoDBClient();
      const id = data.id || (Date.now() + Math.floor(Math.random() * 1000));
      const orderNumber = data.order_number || data.order_no || null;
      const orderNo = data.order_no || `ORD${orderNumber}` || null;
      
      const order = {
        id: id,
        order_number: orderNumber,
        order_no: orderNo,
        shop_id: typeof data.shop_id === 'string' && !isNaN(data.shop_id) ? parseInt(data.shop_id) : data.shop_id,
        customer_id: typeof data.customer_id === 'string' && !isNaN(data.customer_id) ? parseInt(data.customer_id) : data.customer_id,
        delv_id: data.delv_id ? (typeof data.delv_id === 'string' && !isNaN(data.delv_id) ? parseInt(data.delv_id) : data.delv_id) : null,
        delv_boy_id: data.delv_boy_id ? (typeof data.delv_boy_id === 'string' && !isNaN(data.delv_boy_id) ? parseInt(data.delv_boy_id) : data.delv_boy_id) : null,
        orderdetails: data.orderdetails || JSON.stringify(data.items || []),
        customerdetails: data.customerdetails || '',
        shopdetails: data.shopdetails || '',
        del_type: data.del_type || data.deliverytype || '',
        estim_weight: data.estim_weight || 0,
        estim_price: data.estim_price || data.total_amount || 0,
        total_amount: data.total_amount || data.estim_price || 0,
        status: data.status || 1,
        address: data.address || '',
        lat_log: data.lat_log || '',
        payment_method: data.payment_method || 'cash',
        date: data.date || new Date().toISOString().split('T')[0],
        image1: data.image1 || '',
        image2: data.image2 || '',
        image3: data.image3 || '',
        image4: data.image4 || '',
        image5: data.image5 || '',
        image6: data.image6 || '',
        call_log: data.call_log || 0,
        preferred_pickup_time: data.preferred_pickup_time || null,
        notified_vendor_ids: data.notified_vendor_ids || null, // Store notified vendor user IDs (JSON string or array)
        notified_shop_ids: data.notified_shop_ids || null, // Store notified shop IDs (JSON string or array)
        bulk_request_id: data.bulk_request_id || null, // Link to bulk request
        bulk_request_vendor_id: data.bulk_request_vendor_id || null, // Link to vendor in bulk request
        bulk_request_bidding_price: data.bulk_request_bidding_price || null,
        bulk_request_committed_quantity: data.bulk_request_committed_quantity || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const command = new PutCommand({
        TableName: TABLE_NAME,
        Item: order
      });

      await client.send(command);
      return order;
    } catch (err) {
      throw err;
    }
  }

  static async updateStatus(orderNo, status, delvId = null, amount = null, quantity = null) {
    try {
      const client = getDynamoDBClient();
      
      // First find the order
      const orders = await this.findByOrderNo(orderNo);
      if (orders.length === 0) {
        throw new Error('Order not found');
      }
      
      const order = orders[0];
      const updateExpressions = ['status = :status'];
      const expressionAttributeValues = { ':status': status };
      const expressionAttributeNames = {};
      
      if (delvId !== null) {
        updateExpressions.push('delv_id = :delvId', 'delv_boy_id = :delvId');
        expressionAttributeValues[':delvId'] = typeof delvId === 'string' && !isNaN(delvId) ? parseInt(delvId) : delvId;
      }
      if (amount !== null) {
        updateExpressions.push('estim_price = :amount');
        expressionAttributeValues[':amount'] = amount;
      }
      if (quantity !== null) {
        updateExpressions.push('estim_weight = :quantity');
        expressionAttributeValues[':quantity'] = quantity;
      }
      
      updateExpressions.push('#updated = :updated');
      expressionAttributeNames['#updated'] = 'updated_at';
      expressionAttributeValues[':updated'] = new Date().toISOString();
      
      const command = new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { id: order.id },
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

  // Update order by ID (generic update method)
  static async updateById(orderId, updateData) {
    try {
      const client = getDynamoDBClient();
      const id = typeof orderId === 'string' && !isNaN(orderId) ? parseInt(orderId) : orderId;
      
      const updateExpressions = [];
      const expressionAttributeValues = {};
      const expressionAttributeNames = {};
      
      Object.keys(updateData).forEach((key, index) => {
        if (updateData[key] !== undefined) {
          const attrName = `#attr${index}`;
          const attrValue = `:val${index}`;
          updateExpressions.push(`${attrName} = ${attrValue}`);
          expressionAttributeNames[attrName] = key;
          expressionAttributeValues[attrValue] = updateData[key];
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
        Key: { id: id },
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

  static async getCountByShopId(shopId) {
    try {
      const orders = await this.findByShopId(shopId, null, 0, 10000);
      return orders.length;
    } catch (err) {
      throw err;
    }
  }

  static async getCountByShopIdAndStatus(shopId, status) {
    try {
      const orders = await this.findByShopId(shopId, status, 0, 10000);
      return orders.length;
    } catch (err) {
      throw err;
    }
  }

  static async getDistinctCustomerCountByShopId(shopId) {
    try {
      const orders = await this.findByShopId(shopId, null, 0, 10000);
      const uniqueCustomers = new Set(orders.map(o => o.customer_id));
      return uniqueCustomers.size;
    } catch (err) {
      throw err;
    }
  }

  static async getMonthlyOrdersByShopId(shopId, status = 4) {
    try {
      const orders = await this.findByShopId(shopId, status, 0, 10000);
      const currentYear = new Date().getFullYear();
      
      const monthly = {};
      orders.forEach(order => {
        if (order.created_at) {
          const date = new Date(order.created_at);
          if (date.getFullYear() === currentYear) {
            const month = date.getMonth() + 1;
            if (!monthly[month]) {
              monthly[month] = { month, count: 0, amount: 0 };
            }
            monthly[month].count++;
            monthly[month].amount += parseFloat(order.estim_price || 0);
          }
        }
      });
      
      return Object.values(monthly);
    } catch (err) {
      throw err;
    }
  }

  static async getCountByDeliveryBoyId(delvBoyId) {
    try {
      const orders = await this.findByDeliveryBoyId(delvBoyId);
      return orders.length;
    } catch (err) {
      throw err;
    }
  }

  static async getCountByDeliveryBoyIdAndStatus(delvBoyId, status) {
    try {
      const orders = await this.findCompletedByDeliveryBoyId(delvBoyId);
      return orders.filter(o => o.status === status).length;
    } catch (err) {
      throw err;
    }
  }

  static async getSumEstimPriceByDeliveryBoyId(delvBoyId) {
    try {
      const orders = await this.findByDeliveryBoyId(delvBoyId);
      return orders.reduce((sum, order) => sum + parseFloat(order.estim_price || 0), 0);
    } catch (err) {
      throw err;
    }
  }

  static async getLastOrderNumber() {
    try {
      const client = getDynamoDBClient();
      
      // Scan and get all, then sort (for small datasets)
      // For production, consider using a GSI or separate sequence table
      const command = new ScanCommand({
        TableName: TABLE_NAME
      });

      const response = await client.send(command);
      const orders = response.Items || [];
      if (orders.length === 0) return null;
      
      // Sort by order_number (numeric) descending, filtering out invalid numbers
      const validOrders = orders
        .filter(order => {
          const orderNum = order.order_number;
          if (!orderNum) return false;
          // Check if it's a valid numeric order number (not too large, reasonable format)
          const num = typeof orderNum === 'string' ? parseInt(orderNum) : orderNum;
          // Valid order numbers should be between 10000 and 999999999 (reasonable range)
          return !isNaN(num) && num >= 10000 && num <= 999999999;
        })
        .sort((a, b) => {
          const numA = typeof a.order_number === 'string' ? parseInt(a.order_number) : a.order_number;
          const numB = typeof b.order_number === 'string' ? parseInt(b.order_number) : b.order_number;
          return numB - numA; // Descending
        });
      
      if (validOrders.length === 0) return null;
      
      const lastOrderNum = validOrders[0].order_number;
      // Ensure it's a number
      return typeof lastOrderNum === 'string' ? parseInt(lastOrderNum) : lastOrderNum;
    } catch (err) {
      throw err;
    }
  }

  static async setCallLog(orderId, callLog = 1) {
    try {
      const client = getDynamoDBClient();
      const oid = typeof orderId === 'string' && !isNaN(orderId) ? parseInt(orderId) : orderId;
      
      const command = new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { id: oid },
        UpdateExpression: 'SET call_log = :callLog, #updated = :updated',
        ExpressionAttributeNames: {
          '#updated': 'updated_at'
        },
        ExpressionAttributeValues: {
          ':callLog': callLog,
          ':updated': new Date().toISOString()
        }
      });

      await client.send(command);
      return { affectedRows: 1 };
    } catch (err) {
      throw err;
    }
  }

  static async getById(id) {
    try {
      const client = getDynamoDBClient();
      const oid = typeof id === 'string' && !isNaN(id) ? parseInt(id) : id;
      
      const command = new GetCommand({
        TableName: TABLE_NAME,
        Key: { id: oid }
      });

      const response = await client.send(command);
      return response.Item || null;
    } catch (err) {
      throw err;
    }
  }

  // Batch operations
  static async findByIds(ids) {
    try {
      const client = getDynamoDBClient();
      const allOrders = [];
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
          allOrders.push(...response.Responses[TABLE_NAME]);
        }
      }

      return allOrders;
    } catch (err) {
      throw err;
    }
  }

  static async batchCreate(orders) {
    try {
      const client = getDynamoDBClient();
      const batchSize = 25;
      const allResults = [];
      
      for (let i = 0; i < orders.length; i += batchSize) {
        const batch = orders.slice(i, i + batchSize);
        const putRequests = batch.map(order => ({
          PutRequest: {
            Item: {
              ...order,
              id: order.id || (Date.now() + Math.floor(Math.random() * 1000)),
              created_at: order.created_at || new Date().toISOString(),
              updated_at: order.updated_at || new Date().toISOString()
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

  static async findByShopIds(shopIds, status = null) {
    try {
      const client = getDynamoDBClient();
      const allOrders = [];
      const batchSize = 10;
      
      for (let i = 0; i < shopIds.length; i += batchSize) {
        const batch = shopIds.slice(i, i + batchSize);
        const shopIdsList = batch.map(sid => typeof sid === 'string' && !isNaN(sid) ? parseInt(sid) : sid);
        
        let filterExpression = `shop_id IN (${shopIdsList.map((_, idx) => `:sid${idx}`).join(', ')})`;
        const expressionAttributeValues = shopIdsList.reduce((acc, sid, idx) => {
          acc[`:sid${idx}`] = sid;
          return acc;
        }, {});
        
        const expressionAttributeNames = {};
        if (status !== null) {
          filterExpression += ' AND #status = :status';
          expressionAttributeNames['#status'] = 'status';
          expressionAttributeValues[':status'] = status;
        }
        
        const command = new ScanCommand({
          TableName: TABLE_NAME,
          FilterExpression: filterExpression,
          ExpressionAttributeNames: Object.keys(expressionAttributeNames).length > 0 ? expressionAttributeNames : undefined,
          ExpressionAttributeValues: expressionAttributeValues
        });

        const response = await client.send(command);
        if (response.Items) {
          allOrders.push(...response.Items);
        }
      }

      return allOrders;
    } catch (err) {
      throw err;
    }
  }

  // Count orders by customer_id and status
  static async getCountByCustomerIdAndStatus(customerId, status = null) {
    try {
      const cid = typeof customerId === 'string' && !isNaN(customerId) ? parseInt(customerId) : customerId;
      
      if (status === null) {
        // Count all orders for customer
        const orders = await this.findByCustomerId(customerId);
        return orders.length;
      } else {
        // Count orders with specific status
        const orders = await this.findByCustomerId(customerId);
        // Handle status comparison - 'completed' string or numeric status
        if (status === 'completed' || status === 4) {
          return orders.filter(o => o.status === 4 || o.status === 'completed').length;
        } else {
          return orders.filter(o => o.status !== 4 && o.status !== 'completed').length;
        }
      }
    } catch (err) {
      throw err;
    }
  }

  // Count all orders (optimized with Select: "COUNT")
  static async count() {
    try {
      const client = getDynamoDBClient();
      let lastKey = null;
      let count = 0;
      
      do {
        const params = {
          TableName: TABLE_NAME,
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

  // Count orders from v2 customer_app users (excluding bulk orders)
  // Bulk orders are identified by having bulk_request_id attribute
  static async countCustomerAppOrdersV2() {
    try {
      const client = getDynamoDBClient();
      const User = require('./User');
      let lastKey = null;
      let count = 0;
      let totalScanned = 0;

      console.log('📊 [countCustomerAppOrdersV2] Starting count of orders from v2 customer_app users (excluding bulk orders)');

      // First, get all v2 customer_app user IDs
      const v2CustomerAppUsers = [];
      let userLastKey = null;
      
      do {
        const userParams = {
          TableName: 'users',
          FilterExpression: 'app_version = :appVersion AND app_type = :appType AND (attribute_not_exists(del_status) OR del_status <> :deleted)',
          ExpressionAttributeValues: {
            ':appVersion': 'v2',
            ':appType': 'customer_app',
            ':deleted': 2
          },
          ProjectionExpression: 'id'
        };

        if (userLastKey) {
          userParams.ExclusiveStartKey = userLastKey;
        }

        const userCommand = new ScanCommand(userParams);
        const userResponse = await client.send(userCommand);

        if (userResponse.Items) {
          v2CustomerAppUsers.push(...userResponse.Items.map(u => u.id));
        }

        userLastKey = userResponse.LastEvaluatedKey;
      } while (userLastKey);

      console.log(`📊 [countCustomerAppOrdersV2] Found ${v2CustomerAppUsers.length} v2 customer_app users`);
      if (v2CustomerAppUsers.length > 0) {
        console.log(`📊 [countCustomerAppOrdersV2] Sample customer_app user IDs: ${v2CustomerAppUsers.slice(0, 5).join(', ')}`);
      }

      if (v2CustomerAppUsers.length === 0) {
        console.log(`⚠️ [countCustomerAppOrdersV2] No v2 customer_app users found, returning 0`);
        return 0;
      }

      // Count orders for these users
      // Process in batches to avoid filter expression limits
      // Use OR conditions instead of IN (more reliable for DynamoDB FilterExpression)
      const batchSize = 25; // Limit to avoid expression size limits
      for (let i = 0; i < v2CustomerAppUsers.length; i += batchSize) {
        const batch = v2CustomerAppUsers.slice(i, i + batchSize);
        const batchUserIds = batch.map(id => typeof id === 'string' && !isNaN(id) ? parseInt(id) : id);

        if (batchUserIds.length === 0) continue;

        let batchLastKey = null;
        do {
          // Build OR conditions: customer_id = :id0 OR customer_id = :id1 OR ...
          // Note: We'll filter out bulk orders in JavaScript after fetching
          const filterParts = batchUserIds.map((_, idx) => `customer_id = :customerId${idx}`);
          const filterExpression = `(${filterParts.join(' OR ')})`;
          const expressionAttributeValues = batchUserIds.reduce((acc, id, idx) => {
            acc[`:customerId${idx}`] = id;
            return acc;
          }, {});

          const params = {
            TableName: TABLE_NAME,
            FilterExpression: filterExpression,
            ExpressionAttributeValues: expressionAttributeValues
          };

          if (batchLastKey) {
            params.ExclusiveStartKey = batchLastKey;
          }

          const command = new ScanCommand(params);
          const response = await client.send(command);

          if (response.Items) {
            // Filter out bulk orders (orders with bulk_request_id)
            const nonBulkOrders = response.Items.filter(order => !order.bulk_request_id);
            count += nonBulkOrders.length;
            console.log(`📊 [countCustomerAppOrdersV2] Batch ${i / batchSize + 1}: Found ${response.Items.length} orders, ${nonBulkOrders.length} non-bulk orders`);
          }
          totalScanned += response.ScannedCount || 0;
          batchLastKey = response.LastEvaluatedKey;
        } while (batchLastKey);
      }

      console.log(`✅ [countCustomerAppOrdersV2] Completed: count=${count}, total_scanned=${totalScanned}`);
      return count;
    } catch (err) {
      console.error('❌ [countCustomerAppOrdersV2] Error:', err);
      throw err;
    }
  }

  // Count all orders that are NOT from customer_app users (includes vendor orders, bulk orders, etc.)
  // This shows all "other" orders that should appear in bulk orders section
  static async countBulkOrders() {
    try {
      const client = getDynamoDBClient();
      let count = 0;
      let totalScanned = 0;

      console.log('📊 [countBulkOrders] Starting count of all non-customer_app orders');

      // First, get all v2 customer_app user IDs to exclude
      const v2CustomerAppUsers = [];
      let userLastKey = null;
      
      do {
        const userParams = {
          TableName: 'users',
          FilterExpression: 'app_version = :appVersion AND app_type = :appType AND (attribute_not_exists(del_status) OR del_status <> :deleted)',
          ExpressionAttributeValues: {
            ':appVersion': 'v2',
            ':appType': 'customer_app',
            ':deleted': 2
          },
          ProjectionExpression: 'id'
        };

        if (userLastKey) {
          userParams.ExclusiveStartKey = userLastKey;
        }

        const userCommand = new ScanCommand(userParams);
        const userResponse = await client.send(userCommand);

        if (userResponse.Items) {
          v2CustomerAppUsers.push(...userResponse.Items.map(u => u.id));
        }

        userLastKey = userResponse.LastEvaluatedKey;
      } while (userLastKey);

      console.log(`📊 [countBulkOrders] Found ${v2CustomerAppUsers.length} v2 customer_app users to exclude`);

      // Get total count of all orders
      let totalOrders = 0;
      let totalOrdersLastKey = null;
      do {
        const totalParams = {
          TableName: TABLE_NAME,
          Select: 'COUNT'
        };

        if (totalOrdersLastKey) {
          totalParams.ExclusiveStartKey = totalOrdersLastKey;
        }

        const totalCommand = new ScanCommand(totalParams);
        const totalResponse = await client.send(totalCommand);
        totalOrders += totalResponse.Count || 0;
        totalOrdersLastKey = totalResponse.LastEvaluatedKey;
      } while (totalOrdersLastKey);

      // Get count of customer_app orders (excluding bulk)
      const customerAppOrdersCount = await this.countCustomerAppOrdersV2();

      // Bulk orders = Total orders - Customer app orders
      count = totalOrders - customerAppOrdersCount;

      console.log(`✅ [countBulkOrders] Completed: total_orders=${totalOrders}, customer_app_orders=${customerAppOrdersCount}, bulk_orders=${count}`);
      return count;
    } catch (err) {
      console.error('❌ [countBulkOrders] Error:', err);
      throw err;
    }
  }

  // Get recent orders from v2 customer_app users with details (excluding bulk orders)
  // Bulk orders are identified by having bulk_request_id attribute
  static async getCustomerAppOrdersV2(limit = 10) {
    try {
      const client = getDynamoDBClient();
      const User = require('./User');
      
      // Get all v2 customer_app user IDs
      const v2CustomerAppUsers = [];
      let userLastKey = null;
      
      do {
        const userParams = {
          TableName: 'users',
          FilterExpression: 'app_version = :appVersion AND app_type = :appType AND (attribute_not_exists(del_status) OR del_status <> :deleted)',
          ExpressionAttributeValues: {
            ':appVersion': 'v2',
            ':appType': 'customer_app',
            ':deleted': 2
          },
          ProjectionExpression: 'id'
        };

        if (userLastKey) {
          userParams.ExclusiveStartKey = userLastKey;
        }

        const userCommand = new ScanCommand(userParams);
        const userResponse = await client.send(userCommand);

        if (userResponse.Items) {
          v2CustomerAppUsers.push(...userResponse.Items.map(u => u.id));
        }

        userLastKey = userResponse.LastEvaluatedKey;
      } while (userLastKey);

      console.log(`📊 [getCustomerAppOrdersV2] Found ${v2CustomerAppUsers.length} v2 customer_app users`);
      if (v2CustomerAppUsers.length > 0) {
        console.log(`📊 [getCustomerAppOrdersV2] Sample customer_app user IDs: ${v2CustomerAppUsers.slice(0, 5).join(', ')}`);
      }

      if (v2CustomerAppUsers.length === 0) {
        console.log(`⚠️ [getCustomerAppOrdersV2] No v2 customer_app users found, returning empty array`);
        return [];
      }

      // Get orders for these users
      const allOrders = [];
      const batchSize = 25; // Limit to avoid expression size limits
      
      for (let i = 0; i < v2CustomerAppUsers.length; i += batchSize) {
        const batch = v2CustomerAppUsers.slice(i, i + batchSize);
        const batchUserIds = batch.map(id => typeof id === 'string' && !isNaN(id) ? parseInt(id) : id);

        if (batchUserIds.length === 0) continue;

        let batchLastKey = null;
        do {
          // Build OR conditions: customer_id = :id0 OR customer_id = :id1 OR ...
          // Note: We'll filter out bulk orders in JavaScript after fetching
          const filterParts = batchUserIds.map((_, idx) => `customer_id = :customerId${idx}`);
          const filterExpression = `(${filterParts.join(' OR ')})`;
          const expressionAttributeValues = batchUserIds.reduce((acc, id, idx) => {
            acc[`:customerId${idx}`] = id;
            return acc;
          }, {});

          const params = {
            TableName: TABLE_NAME,
            FilterExpression: filterExpression,
            ExpressionAttributeValues: expressionAttributeValues
          };

          if (batchLastKey) {
            params.ExclusiveStartKey = batchLastKey;
          }

          const command = new ScanCommand(params);
          const response = await client.send(command);

          if (response.Items) {
            console.log(`📊 [getCustomerAppOrdersV2] Found ${response.Items.length} orders in batch ${i / batchSize + 1}`);
            allOrders.push(...response.Items);
          }

          batchLastKey = response.LastEvaluatedKey;
        } while (batchLastKey);
      }

      console.log(`📊 [getCustomerAppOrdersV2] Total orders found before filtering: ${allOrders.length}`);
      
      // Filter out orders with bulk_request_id
      const filteredOrders = allOrders.filter(order => !order.bulk_request_id);
      console.log(`📊 [getCustomerAppOrdersV2] Orders after excluding bulk_request_id: ${filteredOrders.length}`);

      // Sort by id DESC (newest first) and limit
      filteredOrders.sort((a, b) => (b.id || 0) - (a.id || 0));
      const result = filteredOrders.slice(0, limit);
      console.log(`✅ [getCustomerAppOrdersV2] Returning ${result.length} customer app orders`);
      return result;
    } catch (err) {
      console.error('❌ [getCustomerAppOrdersV2] Error:', err);
      throw err;
    }
  }

  // Get recent orders that are NOT from customer_app users (includes vendor orders, bulk orders, etc.)
  // This shows all "other" orders that should appear in bulk orders section
  static async getBulkOrders(limit = 10) {
    try {
      const client = getDynamoDBClient();
      
      // Get all v2 customer_app user IDs to exclude
      const v2CustomerAppUsers = [];
      let userLastKey = null;
      
      do {
        const userParams = {
          TableName: 'users',
          FilterExpression: 'app_version = :appVersion AND app_type = :appType AND (attribute_not_exists(del_status) OR del_status <> :deleted)',
          ExpressionAttributeValues: {
            ':appVersion': 'v2',
            ':appType': 'customer_app',
            ':deleted': 2
          },
          ProjectionExpression: 'id'
        };

        if (userLastKey) {
          userParams.ExclusiveStartKey = userLastKey;
        }

        const userCommand = new ScanCommand(userParams);
        const userResponse = await client.send(userCommand);

        if (userResponse.Items) {
          v2CustomerAppUsers.push(...userResponse.Items.map(u => u.id));
        }

        userLastKey = userResponse.LastEvaluatedKey;
      } while (userLastKey);

      console.log(`📊 [getBulkOrders] Found ${v2CustomerAppUsers.length} v2 customer_app users to exclude`);

      // Get all orders, then filter out customer_app orders
      const allOrders = [];
      let lastKey = null;

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
          allOrders.push(...response.Items);
        }

        lastKey = response.LastEvaluatedKey;
      } while (lastKey);

      // Filter out customer_app orders (where customer_id is in customer_app users AND no bulk_request_id)
      const customerAppUserSet = new Set(v2CustomerAppUsers.map(id => typeof id === 'string' && !isNaN(id) ? parseInt(id) : id));
      const bulkOrders = allOrders.filter(order => {
        const customerId = order.customer_id ? (typeof order.customer_id === 'string' && !isNaN(order.customer_id) ? parseInt(order.customer_id) : order.customer_id) : null;
        const isCustomerAppOrder = customerId && customerAppUserSet.has(customerId) && !order.bulk_request_id;
        return !isCustomerAppOrder; // Return orders that are NOT customer_app orders
      });

      // Sort by id DESC (newest first) and limit
      bulkOrders.sort((a, b) => (b.id || 0) - (a.id || 0));
      console.log(`✅ [getBulkOrders] Found ${bulkOrders.length} bulk orders (non-customer_app orders)`);
      return bulkOrders.slice(0, limit);
    } catch (err) {
      console.error('❌ [getBulkOrders] Error:', err);
      throw err;
    }
  }

  // Get recent orders (sorted by created_at DESC)
  static async getRecent(limit = 8) {
    try {
      const client = getDynamoDBClient();
      let lastKey = null;
      const allOrders = [];
      const maxScanItems = limit * 3; // Only scan 3x the limit to save time
      let scannedCount = 0;
      
      do {
        const params = {
          TableName: TABLE_NAME,
          Limit: Math.min(100, maxScanItems - scannedCount) // Limit each scan
        };
        
        if (lastKey) {
          params.ExclusiveStartKey = lastKey;
        }
        
        const command = new ScanCommand(params);
        const response = await client.send(command);
        
        if (response.Items) {
          allOrders.push(...response.Items);
          scannedCount += response.Items.length;
        }
        
        lastKey = response.LastEvaluatedKey;
        
        // Stop early if we have enough items or reached max scan limit
        if (allOrders.length >= maxScanItems || scannedCount >= maxScanItems) {
          break;
        }
      } while (lastKey);
      
      // Sort by created_at DESC
      allOrders.sort((a, b) => {
        const dateA = new Date(a.created_at || 0);
        const dateB = new Date(b.created_at || 0);
        return dateB - dateA;
      });
      
      return allOrders.slice(0, limit);
    } catch (err) {
      throw err;
    }
  }

  // Get monthly count (optimized to process items incrementally)
  static async getMonthlyCount(status = null) {
    try {
      const client = getDynamoDBClient();
      const currentYear = new Date().getFullYear();
      const monthlyCounts = new Array(12).fill(0);
      
      let lastKey = null;
      
      do {
        const params = {
          TableName: TABLE_NAME,
          ProjectionExpression: 'created_at, #status', // Only get needed fields
          ExpressionAttributeNames: { '#status': 'status' }
        };
        
        if (status !== null) {
          params.FilterExpression = '#status = :status';
          params.ExpressionAttributeValues = { ':status': status };
        }
        
        if (lastKey) {
          params.ExclusiveStartKey = lastKey;
        }
        
        const command = new ScanCommand(params);
        const response = await client.send(command);
        
        // Process items incrementally instead of storing all
        if (response.Items) {
          response.Items.forEach(order => {
            if (order.created_at) {
              const date = new Date(order.created_at);
              if (date.getFullYear() === currentYear) {
                const month = date.getMonth(); // 0-11
                monthlyCounts[month]++;
              }
            }
          });
        }
        
        lastKey = response.LastEvaluatedKey;
      } while (lastKey);
      
      return monthlyCounts;
    } catch (err) {
      throw err;
    }
  }

  // Get monthly pending orders count (status IN 1,2,3) - optimized
  static async getMonthlyPendingCount() {
    try {
      const client = getDynamoDBClient();
      const currentYear = new Date().getFullYear();
      const monthlyCounts = new Array(12).fill(0);
      
      let lastKey = null;
      
      do {
        const params = {
          TableName: TABLE_NAME,
          ProjectionExpression: 'created_at, #status', // Only get needed fields
          ExpressionAttributeNames: { '#status': 'status' }
        };
        
        if (lastKey) {
          params.ExclusiveStartKey = lastKey;
        }
        
        const command = new ScanCommand(params);
        const response = await client.send(command);
        
        // Process items incrementally instead of storing all
        if (response.Items) {
          response.Items.forEach(order => {
            const orderStatus = order.status;
            if ((orderStatus === 1 || orderStatus === 2 || orderStatus === 3) && order.created_at) {
              const date = new Date(order.created_at);
              if (date.getFullYear() === currentYear) {
                const month = date.getMonth(); // 0-11
                monthlyCounts[month]++;
              }
            }
          });
        }
        
        lastKey = response.LastEvaluatedKey;
      } while (lastKey);
      
      return monthlyCounts;
    } catch (err) {
      throw err;
    }
  }

  // Get orders with shop names (for customer panel)
  static async findByCustomerIdWithShopNames(customerId, limit = 5) {
    try {
      const Shop = require('./Shop');
      const orders = await this.findByCustomerId(customerId);
      
      // Sort by id DESC and limit
      orders.sort((a, b) => (b.id || 0) - (a.id || 0));
      const limitedOrders = orders.slice(0, limit);
      
      // Get unique shop_ids
      const shopIds = [...new Set(limitedOrders.map(o => o.shop_id).filter(Boolean))];
      
      // Batch get shops
      const shops = await Shop.findByIds(shopIds);
      const shopMap = {};
      shops.forEach(s => { shopMap[s.id] = s; });
      
      // Combine orders with shop names
      const results = limitedOrders.map(order => ({
        ...order,
        shop_name: order.shop_id && shopMap[order.shop_id] ? shopMap[order.shop_id].shopname : ''
      }));
      
      return results;
    } catch (err) {
      throw err;
    }
  }

  // Get all orders (optionally filtered by status)
  /**
   * Find orders by bulk_request_id
   * Returns all orders created from a specific bulk scrap request
   */
  static async findByBulkRequestId(bulkRequestId) {
    try {
      const client = getDynamoDBClient();
      const { ScanCommand } = require('@aws-sdk/lib-dynamodb');
      const allOrders = [];
      let lastKey = null;

      do {
        const params = {
          TableName: TABLE_NAME,
          FilterExpression: 'bulk_request_id = :bulkRequestId',
          ExpressionAttributeValues: {
            ':bulkRequestId': typeof bulkRequestId === 'string' ? parseInt(bulkRequestId) : (typeof bulkRequestId === 'number' ? bulkRequestId : parseInt(String(bulkRequestId)))
          }
        };

        if (lastKey) {
          params.ExclusiveStartKey = lastKey;
        }

        const command = new ScanCommand(params);
        let response;
        try {
          response = await client.send(command);
        } catch (scanError) {
          if (scanError.name === 'ResourceNotFoundException' || scanError.__type === 'com.amazonaws.dynamodb.v20120810#ResourceNotFoundException') {
            console.warn(`⚠️  Table "${TABLE_NAME}" does not exist yet. Returning empty array.`);
            return [];
          }
          throw scanError;
        }

        if (response.Items) {
          allOrders.push(...response.Items);
        }

        lastKey = response.LastEvaluatedKey;
      } while (lastKey);

      // Sort by created_at (newest first)
      allOrders.sort((a, b) => {
        const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
        return dateB - dateA;
      });

      console.log(`✅ Found ${allOrders.length} orders for bulk request ${bulkRequestId}`);
      return allOrders;
    } catch (error) {
      console.error('❌ Error finding orders by bulk_request_id:', error);
      throw error;
    }
  }

  static async getAll(status = null) {
    try {
      const client = getDynamoDBClient();
      let lastKey = null;
      const allOrders = [];
      
      do {
        const params = {
          TableName: TABLE_NAME
        };
        
        if (status !== null) {
          params.FilterExpression = '#status = :status';
          params.ExpressionAttributeNames = { '#status': 'status' };
          params.ExpressionAttributeValues = { ':status': status };
        }
        
        if (lastKey) {
          params.ExclusiveStartKey = lastKey;
        }
        
        const command = new ScanCommand(params);
        const response = await client.send(command);
        
        if (response.Items) {
          allOrders.push(...response.Items);
        }
        
        lastKey = response.LastEvaluatedKey;
      } while (lastKey);
      
      // Sort by id DESC
      allOrders.sort((a, b) => (b.id || 0) - (a.id || 0));
      
      return allOrders;
    } catch (err) {
      throw err;
    }
  }
}

module.exports = Order;
