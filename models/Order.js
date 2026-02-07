const { getDynamoDBClient } = require('../config/dynamodb');
const { GetCommand, PutCommand, UpdateCommand, ScanCommand, QueryCommand, BatchGetCommand, BatchWriteCommand } = require('@aws-sdk/lib-dynamodb');
const RedisCache = require('../utils/redisCache');

const TABLE_NAME = 'orders';
const ORDER_BY_CUSTOMER_CACHE_PREFIX = 'order:by_customer:';
const ORDER_ALL_CACHE_PREFIX = 'order:all:';
const ORDER_BY_SHOP_CACHE_PREFIX = 'order:by_shop:';
const ORDER_BY_DELIVERY_PREFIX = 'order:by_delivery:';
const ORDER_BY_ORDER_NO_PREFIX = 'order:by_order_no:';

class Order {
  static async findByOrderNo(orderNo) {
    try {
      const key = String(orderNo).trim();
      if (!key) return [];
      const cacheKey = `${ORDER_BY_ORDER_NO_PREFIX}${key}`;
      const cached = await RedisCache.get(cacheKey);
      if (cached !== null && cached !== undefined && Array.isArray(cached)) {
        return cached;
      }
      const client = getDynamoDBClient();
      
      // Try using GSI first (order_no-index)
      try {
        const queryCommand = new QueryCommand({
          TableName: TABLE_NAME,
          IndexName: 'order_no-index',
          KeyConditionExpression: 'order_no = :orderNo',
          ExpressionAttributeValues: { ':orderNo': key }
        });
        const queryResponse = await client.send(queryCommand);
        if (queryResponse.Items && queryResponse.Items.length > 0) {
          await RedisCache.set(cacheKey, queryResponse.Items, 'orders');
          return queryResponse.Items;
        }
      } catch (gsiError) {
        // GSI might not exist yet, fall back to Scan
        console.warn('⚠️  GSI order_no-index not available, using Scan fallback:', gsiError.message);
      }
      
      // Fallback to Scan if GSI doesn't exist or no results
      const command = new ScanCommand({
        TableName: TABLE_NAME,
        FilterExpression: 'order_no = :orderNo OR order_number = :orderNo',
        ExpressionAttributeValues: { ':orderNo': orderNo }
      });
      const response = await client.send(command);
      const items = response.Items || [];
      await RedisCache.set(cacheKey, items, 'orders');
      return items;
    } catch (err) {
      throw err;
    }
  }

  static async findByShopId(shopId, status = null, offset = 0, limit = 10) {
    try {
      const sid = typeof shopId === 'string' && !isNaN(shopId) ? parseInt(shopId) : shopId;
      const cacheKey = status === null ? `${ORDER_BY_SHOP_CACHE_PREFIX}${sid}` : null;
      if (cacheKey) {
        const cached = await RedisCache.get(cacheKey);
        if (cached !== null && cached !== undefined && Array.isArray(cached)) {
          if (offset > 0) return cached.slice(offset * limit, (offset * limit) + limit);
          return cached.slice(0, limit);
        }
      }

      const client = getDynamoDBClient();
      
      // Try using GSI first (shop_id-status-index)
      try {
        const queryCommand = new QueryCommand({
          TableName: TABLE_NAME,
          IndexName: 'shop_id-status-index',
          KeyConditionExpression: 'shop_id = :shopId',
          ExpressionAttributeValues: { ':shopId': sid },
          ScanIndexForward: false, // Sort descending by created_at
          Limit: limit + offset // Fetch enough items for pagination
        });
        
        // Add status filter if provided
        if (status !== null) {
          queryCommand.FilterExpression = '#status = :status';
          queryCommand.ExpressionAttributeNames = { '#status': 'status' };
          queryCommand.ExpressionAttributeValues[':status'] = status;
        }
        
        const queryResponse = await client.send(queryCommand);
        let results = queryResponse.Items || [];
        
        // Apply offset
        if (offset > 0) {
          results = results.slice(offset);
        }
        results = results.slice(0, limit);
        
        if (cacheKey) await RedisCache.set(cacheKey, results, 'orders');
        return results;
      } catch (gsiError) {
        // GSI might not exist yet, fall back to Scan
        console.warn('⚠️  GSI shop_id-status-index not available, using Scan fallback:', gsiError.message);
      }
      
      // Fallback to Scan if GSI doesn't exist
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
      results.sort((a, b) => {
        // Sort by created_at descending, fallback to id
        const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
        if (dateB !== dateA) return dateB - dateA;
        return (b.id || 0) - (a.id || 0);
      });
      if (cacheKey) await RedisCache.set(cacheKey, results, 'orders');
      if (offset > 0) return results.slice(offset * limit, (offset * limit) + limit);
      return results.slice(0, limit);
    } catch (err) {
      throw err;
    }
  }

  static async findByCustomerId(customerId) {
    try {
      const cid = typeof customerId === 'string' && !isNaN(customerId) ? parseInt(customerId) : customerId;
      const cacheKey = `${ORDER_BY_CUSTOMER_CACHE_PREFIX}${cid}`;
      const cached = await RedisCache.get(cacheKey);
      if (cached && Array.isArray(cached)) {
        return cached;
      }

      const client = getDynamoDBClient();
      
      // Try using GSI first (customer_id-status-index)
      try {
        const queryCommand = new QueryCommand({
          TableName: TABLE_NAME,
          IndexName: 'customer_id-status-index',
          KeyConditionExpression: 'customer_id = :customerId',
          ExpressionAttributeValues: {
            ':customerId': cid
          },
          ScanIndexForward: false // Sort descending by created_at
        });
        
        const queryResponse = await client.send(queryCommand);
        let results = queryResponse.Items || [];
        
        // Handle pagination if LastEvaluatedKey exists
        let lastKey = queryResponse.LastEvaluatedKey;
        while (lastKey) {
          queryCommand.input.ExclusiveStartKey = lastKey;
          const nextResponse = await client.send(queryCommand);
          if (nextResponse.Items) {
            results.push(...nextResponse.Items);
          }
          lastKey = nextResponse.LastEvaluatedKey;
        }
        
        // Sort by id as fallback if created_at is missing
        results.sort((a, b) => {
          const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
          const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
          if (dateB !== dateA) return dateB - dateA;
          return (b.id || 0) - (a.id || 0);
        });
        
        await RedisCache.set(cacheKey, results, 'orders');
        return results;
      } catch (gsiError) {
        // GSI might not exist yet, fall back to Scan
        console.warn('⚠️  GSI customer_id-status-index not available, using Scan fallback:', gsiError.message);
      }
      
      // Fallback to Scan if GSI doesn't exist
      const command = new ScanCommand({
        TableName: TABLE_NAME,
        FilterExpression: 'customer_id = :customerId',
        ExpressionAttributeValues: {
          ':customerId': cid
        }
      });

      const response = await client.send(command);
      let results = response.Items || [];
      results.sort((a, b) => {
        const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
        if (dateB !== dateA) return dateB - dateA;
        return (b.id || 0) - (a.id || 0);
      });
      await RedisCache.set(cacheKey, results, 'orders');
      return results;
    } catch (err) {
      throw err;
    }
  }

  static async findByDeliveryBoyId(delvBoyId) {
    try {
      const dbid = typeof delvBoyId === 'string' && !isNaN(delvBoyId) ? parseInt(delvBoyId) : delvBoyId;
      const cacheKey = `${ORDER_BY_DELIVERY_PREFIX}${dbid}`;
      const cached = await RedisCache.get(cacheKey);
      if (cached !== null && cached !== undefined && Array.isArray(cached)) {
        return cached;
      }
      const client = getDynamoDBClient();
      
      // Try using GSI first (delv_boy_id-status-index)
      try {
        const queryCommand = new QueryCommand({
          TableName: TABLE_NAME,
          IndexName: 'delv_boy_id-status-index',
          KeyConditionExpression: 'delv_boy_id = :dbid',
          ExpressionAttributeValues: { ':dbid': dbid },
          ScanIndexForward: false // Sort descending by created_at
        });
        
        const queryResponse = await client.send(queryCommand);
        let results = queryResponse.Items || [];
        
        // Handle pagination if LastEvaluatedKey exists
        let lastKey = queryResponse.LastEvaluatedKey;
        while (lastKey) {
          queryCommand.input.ExclusiveStartKey = lastKey;
          const nextResponse = await client.send(queryCommand);
          if (nextResponse.Items) {
            results.push(...nextResponse.Items);
          }
          lastKey = nextResponse.LastEvaluatedKey;
        }
        
        // Also check delv_id (fallback field) using Scan if needed
        // Note: This is a limitation - we'd need another GSI for delv_id
        const scanCommand = new ScanCommand({
          TableName: TABLE_NAME,
          FilterExpression: 'delv_id = :dbid AND (attribute_not_exists(delv_boy_id) OR delv_boy_id <> :dbid)',
          ExpressionAttributeValues: { ':dbid': dbid }
        });
        const scanResponse = await client.send(scanCommand);
        if (scanResponse.Items && scanResponse.Items.length > 0) {
          // Merge results, avoiding duplicates
          const existingIds = new Set(results.map(r => r.id));
          scanResponse.Items.forEach(item => {
            if (!existingIds.has(item.id)) {
              results.push(item);
            }
          });
        }
        
        results.sort((a, b) => {

          const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
          const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
          if (dateB !== dateA) return dateB - dateA;
          return (b.id || 0) - (a.id || 0);
        });
        
        await RedisCache.set(cacheKey, results, 'orders');
        return results;
      } catch (gsiError) {
        // GSI might not exist yet, fall back to Scan
        console.warn('⚠️  GSI delv_boy_id-status-index not available, using Scan fallback:', gsiError.message);
      }
      
      // Fallback to Scan if GSI doesn't exist
      const command = new ScanCommand({
        TableName: TABLE_NAME,
        FilterExpression: 'delv_boy_id = :dbid OR delv_id = :dbid',
        ExpressionAttributeValues: { ':dbid': dbid }
      });
      const response = await client.send(command);
      let results = response.Items || [];
      results.sort((a, b) => {
        const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
        if (dateB !== dateA) return dateB - dateA;
        return (b.id || 0) - (a.id || 0);
      });
      await RedisCache.set(cacheKey, results, 'orders');
      return results;
    } catch (err) {
      throw err;
    }
  }

  static async findCompletedByDeliveryBoyId(delvBoyId) {
    try {
      const dbid = typeof delvBoyId === 'string' && !isNaN(delvBoyId) ? parseInt(delvBoyId) : delvBoyId;
      const orders = await this.findByDeliveryBoyId(dbid);
      const results = orders.filter(o => o.status === 4 || o.status === 5);
      results.sort((a, b) => (b.id || 0) - (a.id || 0));
      return results;
    } catch (err) {
      throw err;
    }
  }

  static async findPendingByCustomerId(customerId) {
    try {
      const cid = typeof customerId === 'string' && !isNaN(customerId) ? parseInt(customerId) : customerId;
      const today = new Date().toISOString().split('T')[0];
      const orders = await this.findByCustomerId(cid);
      const results = orders.filter(order => {
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
        customer_id: typeof data.customer_id === 'string' && !isNaN(data.customer_id) ? parseInt(data.customer_id) : data.customer_id,
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
      
      // Only include GSI key attributes if they have values (GSI cannot have NULL key attributes)
      if (data.shop_id != null && data.shop_id !== undefined) {
        order.shop_id = typeof data.shop_id === 'string' && !isNaN(data.shop_id) ? parseInt(data.shop_id) : data.shop_id;
      }
      if (data.delv_id != null && data.delv_id !== undefined) {
        order.delv_id = typeof data.delv_id === 'string' && !isNaN(data.delv_id) ? parseInt(data.delv_id) : data.delv_id;
      }
      if (data.delv_boy_id != null && data.delv_boy_id !== undefined) {
        order.delv_boy_id = typeof data.delv_boy_id === 'string' && !isNaN(data.delv_boy_id) ? parseInt(data.delv_boy_id) : data.delv_boy_id;
      }

      const command = new PutCommand({
        TableName: TABLE_NAME,
        Item: order
      });

      await client.send(command);
      Order.invalidateCustomerOrdersCache(order.customer_id).catch(() => {});
      if (order.shop_id != null) Order.invalidateOrdersByShopCache(order.shop_id).catch(() => {});
      if (order.delv_boy_id != null) Order.invalidateOrdersByDeliveryCache(order.delv_boy_id).catch(() => {});
      if (order.delv_id != null) Order.invalidateOrdersByDeliveryCache(order.delv_id).catch(() => {});
      const ono = order.order_no || order.order_number;
      if (ono != null) Order.invalidateOrderByOrderNoCache(ono).catch(() => {});
      if (order.order_number != null && order.order_number !== ono) Order.invalidateOrderByOrderNoCache(order.order_number).catch(() => {});
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
      if (order.customer_id != null) Order.invalidateCustomerOrdersCache(order.customer_id).catch(() => {});
      if (order.shop_id != null) Order.invalidateOrdersByShopCache(order.shop_id).catch(() => {});
      if (order.delv_boy_id != null) Order.invalidateOrdersByDeliveryCache(order.delv_boy_id).catch(() => {});
      if (order.delv_id != null) Order.invalidateOrdersByDeliveryCache(order.delv_id).catch(() => {});
      const ono = order.order_no || order.order_number;
      if (ono != null) Order.invalidateOrderByOrderNoCache(ono).catch(() => {});
      const onum = order.order_number;
      if (onum != null && onum !== ono) Order.invalidateOrderByOrderNoCache(onum).catch(() => {});
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
      
      const setExpressions = [];
      const removeExpressions = [];
      const expressionAttributeValues = {};
      const expressionAttributeNames = {};
      
      // GSI key attributes that cannot be set to null - must be removed instead
      const gsiKeyAttributes = ['shop_id', 'delv_boy_id', 'delv_id'];
      
      Object.keys(updateData).forEach((key, index) => {
        if (updateData[key] !== undefined && key !== 'updated_at') {
          const attrName = `#attr${index}`;
          expressionAttributeNames[attrName] = key;
          
          // Check if this is a GSI key attribute being set to null
          if (gsiKeyAttributes.includes(key) && updateData[key] === null) {
            // Use REMOVE for GSI key attributes set to null
            console.log(`🗑️  Order.updateById: Using REMOVE for GSI key ${key}`);
            removeExpressions.push(attrName);
          } else {
            // Use SET for normal attributes
            const attrValue = `:val${index}`;
            setExpressions.push(`${attrName} = ${attrValue}`);
            expressionAttributeValues[attrValue] = updateData[key];
            console.log(`✏️  Order.updateById: Using SET for ${key} = ${JSON.stringify(updateData[key])}`);
          }
        }
      });
      
      if (setExpressions.length === 0 && removeExpressions.length === 0) {
        return { affectedRows: 0 };
      }
      
      // Build the update expression
      let updateExpression = '';
      if (setExpressions.length > 0) {
        setExpressions.push('#updated = :updated');
        expressionAttributeNames['#updated'] = 'updated_at';
        expressionAttributeValues[':updated'] = new Date().toISOString();
        updateExpression += `SET ${setExpressions.join(', ')}`;
      }
      if (removeExpressions.length > 0) {
        if (updateExpression) updateExpression += ' ';
        updateExpression += `REMOVE ${removeExpressions.join(', ')}`;
        // Also need to update updated_at when removing
        if (setExpressions.length === 0) {
          // If no SET expressions, we need to add one for updated_at
          expressionAttributeNames['#updated'] = 'updated_at';
          expressionAttributeValues[':updated'] = new Date().toISOString();
          updateExpression = `SET #updated = :updated ${updateExpression}`;
        }
      }
      
      // Debug logging for GSI key issues
      console.log(`🔧 Order.updateById Debug:`, {
        orderId: id,
        updateExpression,
        setExpressions,
        removeExpressions,
        expressionAttributeNames,
        expressionAttributeValues: Object.keys(expressionAttributeValues).reduce((acc, key) => {
          acc[key] = typeof expressionAttributeValues[key];
          return acc;
        }, {})
      });

      const command = new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { id: id },
        UpdateExpression: updateExpression,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        ReturnValues: 'ALL_OLD'
      });

      const response = await client.send(command);
      const attrs = response.Attributes;
      if (attrs) {
        if (attrs.customer_id != null) Order.invalidateCustomerOrdersCache(attrs.customer_id).catch(() => {});
        if (attrs.shop_id != null) Order.invalidateOrdersByShopCache(attrs.shop_id).catch(() => {});
        if (attrs.delv_boy_id != null) Order.invalidateOrdersByDeliveryCache(attrs.delv_boy_id).catch(() => {});
        if (attrs.delv_id != null) Order.invalidateOrdersByDeliveryCache(attrs.delv_id).catch(() => {});
        const ono = attrs.order_no || attrs.order_number;
        if (ono != null) Order.invalidateOrderByOrderNoCache(ono).catch(() => {});
        if (attrs.order_number != null && attrs.order_number !== ono) Order.invalidateOrderByOrderNoCache(attrs.order_number).catch(() => {});
      }
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
  // SIMPLIFIED: Direct scan approach for reliability (no GSIs required)
  static async countCustomerAppOrdersV2() {
    try {
      const client = getDynamoDBClient();
      
      console.log('📊 [countCustomerAppOrdersV2] Starting count of orders from v2 customer_app users');

      // Step 1: Get all v2 customer_app user IDs
      const v2CustomerAppUsers = new Set();
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
        if (userLastKey) userParams.ExclusiveStartKey = userLastKey;
        
        const userResponse = await client.send(new ScanCommand(userParams));
        if (userResponse.Items) {
          userResponse.Items.forEach(u => {
            // Store multiple type variations to handle type mismatches
            const id = u.id;
            v2CustomerAppUsers.add(id);
            v2CustomerAppUsers.add(String(id));
            v2CustomerAppUsers.add(typeof id === 'string' && !isNaN(id) ? parseInt(id) : id);
          });
        }
        userLastKey = userResponse.LastEvaluatedKey;
      } while (userLastKey);

      console.log(`📊 [countCustomerAppOrdersV2] Found ${v2CustomerAppUsers.size / 3} unique v2 customer_app users`);

      if (v2CustomerAppUsers.size === 0) {
        console.log(`⚠️ [countCustomerAppOrdersV2] No v2 customer_app users found, returning 0`);
        return 0;
      }

      // Step 2: Scan all orders and count those from v2 customer_app users (excluding bulk orders)
      let count = 0;
      let lastKey = null;
      let scannedOrders = 0;
      
      do {
        const orderParams = {
          TableName: TABLE_NAME,
          ProjectionExpression: 'customer_id, bulk_request_id',
          Limit: 1000
        };
        if (lastKey) orderParams.ExclusiveStartKey = lastKey;
        
        const orderResponse = await client.send(new ScanCommand(orderParams));
        
        if (orderResponse.Items) {
          scannedOrders += orderResponse.Items.length;
          
          for (const order of orderResponse.Items) {
            // Check if this order belongs to a v2 customer_app user
            const customerId = order.customer_id;
            if (customerId && v2CustomerAppUsers.has(customerId)) {
              // Exclude bulk orders (orders with bulk_request_id)
              if (!order.bulk_request_id) {
                count++;
              }
            }
          }
        }
        
        lastKey = orderResponse.LastEvaluatedKey;
      } while (lastKey);

      console.log(`✅ [countCustomerAppOrdersV2] Completed: scanned ${scannedOrders} orders, found ${count} customer app orders (v2)`);
      return count;
    } catch (err) {
      console.error('❌ [countCustomerAppOrdersV2] Error:', err);
      // Return 0 on error to prevent dashboard from crashing
      return 0;
    }
  }

  // Count all orders that are NOT from customer_app users (includes vendor orders, bulk orders, etc.)
  // This shows all "other" orders that should appear in bulk orders section
  // OPTIMIZED: Uses count() and countCustomerAppOrdersV2() which are now optimized
  static async countBulkOrders() {
    try {
      console.log('📊 [countBulkOrders] Starting optimized count of all non-customer_app orders');

      // Get total count of all orders (already optimized with Select: COUNT)
      const totalOrders = await this.count();

      // Get count of customer_app orders (now optimized with GSIs)
      const customerAppOrdersCount = await this.countCustomerAppOrdersV2();

      // Bulk orders = Total orders - Customer app orders
      const count = totalOrders - customerAppOrdersCount;

      console.log(`✅ [countBulkOrders] Completed: total_orders=${totalOrders}, customer_app_orders=${customerAppOrdersCount}, bulk_orders=${count}`);
      return count;
    } catch (err) {
      console.error('❌ [countBulkOrders] Error:', err);
      throw err;
    }
  }

  // Get recent orders from v2 customer_app users with details (excluding bulk orders)
  // Bulk orders are identified by having bulk_request_id attribute
  // SIMPLIFIED: Uses direct scan for reliability (no GSIs required)
  static async getCustomerAppOrdersV2(limit = 10) {
    try {
      const client = getDynamoDBClient();
      
      console.log('📊 [getCustomerAppOrdersV2] Starting to get orders from v2 customer_app users');

      // Step 1: Get all v2 customer_app user IDs
      const v2CustomerAppUsers = new Set();
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
        if (userLastKey) userParams.ExclusiveStartKey = userLastKey;
        
        const userResponse = await client.send(new ScanCommand(userParams));
        if (userResponse.Items) {
          userResponse.Items.forEach(u => {
            // Store multiple type variations to handle type mismatches
            const id = u.id;
            v2CustomerAppUsers.add(id);
            v2CustomerAppUsers.add(String(id));
            v2CustomerAppUsers.add(typeof id === 'string' && !isNaN(id) ? parseInt(id) : id);
          });
        }
        userLastKey = userResponse.LastEvaluatedKey;
      } while (userLastKey);

      console.log(`📊 [getCustomerAppOrdersV2] Found ${v2CustomerAppUsers.size / 3} unique v2 customer_app users`);

      if (v2CustomerAppUsers.size === 0) {
        console.log(`⚠️ [getCustomerAppOrdersV2] No v2 customer_app users found, returning empty array`);
        return [];
      }

      // Step 2: Scan all orders and collect those from v2 customer_app users (excluding bulk orders)
      const allOrders = [];
      let lastKey = null;
      let scannedOrders = 0;
      
      do {
        const orderParams = {
          TableName: TABLE_NAME,
          Limit: 1000
        };
        if (lastKey) orderParams.ExclusiveStartKey = lastKey;
        
        const orderResponse = await client.send(new ScanCommand(orderParams));
        
        if (orderResponse.Items) {
          scannedOrders += orderResponse.Items.length;
          
          for (const order of orderResponse.Items) {
            // Check if this order belongs to a v2 customer_app user
            const customerId = order.customer_id;
            if (customerId && v2CustomerAppUsers.has(customerId)) {
              // Exclude bulk orders (orders with bulk_request_id)
              if (!order.bulk_request_id) {
                allOrders.push(order);
              }
            }
          }
        }
        
        lastKey = orderResponse.LastEvaluatedKey;
      } while (lastKey);

      console.log(`📊 [getCustomerAppOrdersV2] Scanned ${scannedOrders} orders, found ${allOrders.length} customer app orders`);
      
      // Sort by created_at DESC (newest first), then by id DESC
      allOrders.sort((a, b) => {
        const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
        if (dateB !== dateA) return dateB - dateA;
        return (b.id || 0) - (a.id || 0);
      });
      
      const result = allOrders.slice(0, limit);
      console.log(`✅ [getCustomerAppOrdersV2] Returning ${result.length} customer app orders`);
      return result;
    } catch (err) {
      console.error('❌ [getCustomerAppOrdersV2] Error:', err);
      return []; // Return empty array on error
    }
  }

  // Get customer app orders v2 with pagination support
  static async getCustomerAppOrdersV2Paginated(page = 1, limit = 10, search = '') {
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

      console.log(`📊 [getCustomerAppOrdersV2Paginated] Found ${v2CustomerAppUsers.length} v2 customer_app users`);

      if (v2CustomerAppUsers.length === 0) {
        console.log(`⚠️ [getCustomerAppOrdersV2Paginated] No v2 customer_app users found, returning empty array`);
        return {
          orders: [],
          total: 0,
          page: page,
          limit: limit,
          totalPages: 0
        };
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
            allOrders.push(...response.Items);
          }

          batchLastKey = response.LastEvaluatedKey;
        } while (batchLastKey);
      }

      // Filter out orders with bulk_request_id
      let filteredOrders = allOrders.filter(order => !order.bulk_request_id);
      
      // Apply search filter if provided
      if (search && search.trim()) {
        const searchLower = search.toLowerCase().trim();
        filteredOrders = filteredOrders.filter(order => {
          const orderNo = String(order.order_no || order.order_number || '').toLowerCase();
          const orderId = String(order.id || '').toLowerCase();
          const customerId = String(order.customer_id || '').toLowerCase();
          const shopId = String(order.shop_id || '').toLowerCase();
          return orderNo.includes(searchLower) || 
                 orderId.includes(searchLower) || 
                 customerId.includes(searchLower) || 
                 shopId.includes(searchLower);
        });
      }

      // Sort by id DESC (newest first)
      filteredOrders.sort((a, b) => (b.id || 0) - (a.id || 0));
      
      // Calculate pagination
      const total = filteredOrders.length;
      const totalPages = Math.ceil(total / limit);
      const offset = (page - 1) * limit;
      const paginatedOrders = filteredOrders.slice(offset, offset + limit);
      
      console.log(`✅ [getCustomerAppOrdersV2Paginated] Returning ${paginatedOrders.length} orders (page ${page}/${totalPages}, total: ${total})`);
      
      return {
        orders: paginatedOrders,
        total: total,
        page: page,
        limit: limit,
        totalPages: totalPages
      };
    } catch (err) {
      console.error('❌ [getCustomerAppOrdersV2Paginated] Error:', err);
      throw err;
    }
  }

  // Get recent orders that are NOT from customer_app users (includes vendor orders, bulk orders, etc.)
  // This shows all "other" orders that should appear in bulk orders section
  // SIMPLIFIED: Uses direct scan for reliability (no GSIs required)
  static async getBulkOrders(limit = 10) {
    try {
      const client = getDynamoDBClient();
      
      console.log('📊 [getBulkOrders] Starting to get bulk orders (non-customer_app orders)');

      // Step 1: Get all v2 customer_app user IDs to exclude
      const v2CustomerAppUsers = new Set();
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
        if (userLastKey) userParams.ExclusiveStartKey = userLastKey;
        
        const userResponse = await client.send(new ScanCommand(userParams));
        if (userResponse.Items) {
          userResponse.Items.forEach(u => {
            // Store multiple type variations to handle type mismatches
            const id = u.id;
            v2CustomerAppUsers.add(id);
            v2CustomerAppUsers.add(String(id));
            v2CustomerAppUsers.add(typeof id === 'string' && !isNaN(id) ? parseInt(id) : id);
          });
        }
        userLastKey = userResponse.LastEvaluatedKey;
      } while (userLastKey);

      console.log(`📊 [getBulkOrders] Found ${v2CustomerAppUsers.size / 3} unique v2 customer_app users to exclude`);

      // Step 2: Scan all orders and filter out customer_app orders
      const bulkOrders = [];
      let lastKey = null;
      let scannedOrders = 0;
      
      do {
        const orderParams = {
          TableName: TABLE_NAME,
          Limit: 1000
        };
        if (lastKey) orderParams.ExclusiveStartKey = lastKey;
        
        const orderResponse = await client.send(new ScanCommand(orderParams));
        
        if (orderResponse.Items) {
          scannedOrders += orderResponse.Items.length;
          
          for (const order of orderResponse.Items) {
            // Check if this order belongs to a v2 customer_app user
            const customerId = order.customer_id;
            const isCustomerAppOrder = customerId && v2CustomerAppUsers.has(customerId) && !order.bulk_request_id;
            
            // If it's NOT a customer_app order, it's a bulk order
            if (!isCustomerAppOrder) {
              bulkOrders.push(order);
            }
          }
        }
        
        lastKey = orderResponse.LastEvaluatedKey;
      } while (lastKey);

      console.log(`📊 [getBulkOrders] Scanned ${scannedOrders} orders, found ${bulkOrders.length} bulk orders`);

      // Sort by created_at DESC (newest first), then by id DESC
      bulkOrders.sort((a, b) => {
        const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
        if (dateB !== dateA) return dateB - dateA;
        return (b.id || 0) - (a.id || 0);
      });
      
      console.log(`✅ [getBulkOrders] Returning ${Math.min(bulkOrders.length, limit)} bulk orders`);
      return bulkOrders.slice(0, limit);
    } catch (err) {
      console.error('❌ [getBulkOrders] Error:', err);
      return []; // Return empty array on error
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

  /**
   * Find orders by status using GSI (optimized for getAvailablePickupRequests)
   * @param {number} status - Order status
   * @param {number} limit - Maximum number of orders to return
   * @param {string} lastEvaluatedKey - For pagination
   * @returns {Promise<{items: Array, lastEvaluatedKey: string|null}>}
   */
  static async findByStatus(status, limit = 100, lastEvaluatedKey = null) {
    try {
      const client = getDynamoDBClient();
      
      // Try using GSI first (status-created_at-index)
      try {
        const queryCommand = new QueryCommand({
          TableName: TABLE_NAME,
          IndexName: 'status-created_at-index',
          KeyConditionExpression: '#status = :status',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: { ':status': status },
          ScanIndexForward: false, // Sort descending by created_at (newest first)
          Limit: limit
        });
        
        if (lastEvaluatedKey) {
          queryCommand.input.ExclusiveStartKey = lastEvaluatedKey;
        }
        
        const queryResponse = await client.send(queryCommand);
        return {
          items: queryResponse.Items || [],
          lastEvaluatedKey: queryResponse.LastEvaluatedKey || null
        };
      } catch (gsiError) {
        // GSI might not exist yet, fall back to Scan
        console.warn('⚠️  GSI status-created_at-index not available, using Scan fallback:', gsiError.message);
      }
      
      // Fallback to Scan if GSI doesn't exist
      const params = {
        TableName: TABLE_NAME,
        FilterExpression: '#status = :status',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: { ':status': status },
        Limit: limit
      };
      
      if (lastEvaluatedKey) {
        params.ExclusiveStartKey = lastEvaluatedKey;
      }
      
      const command = new ScanCommand(params);
      const response = await client.send(command);
      
      let items = response.Items || [];
      items.sort((a, b) => {
        const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
        if (dateB !== dateA) return dateB - dateA;
        return (b.id || 0) - (a.id || 0);
      });
      
      return {
        items: items.slice(0, limit),
        lastEvaluatedKey: response.LastEvaluatedKey || null
      };
    } catch (err) {
      throw err;
    }
  }

  static async getAll(status = null) {
    try {
      const cacheKey = `${ORDER_ALL_CACHE_PREFIX}${status === null ? 'all' : status}`;
      const cached = await RedisCache.get(cacheKey);
      if (cached && Array.isArray(cached)) {
        return cached;
      }

      const client = getDynamoDBClient();
      let lastKey = null;
      const allOrders = [];

      // If status is provided, use optimized findByStatus method
      if (status !== null) {
        do {
          const result = await this.findByStatus(status, 1000, lastKey);
          if (result.items) {
            allOrders.push(...result.items);
          }
          lastKey = result.lastEvaluatedKey;
        } while (lastKey);
        
        await RedisCache.set(cacheKey, allOrders, 'orders');
        return allOrders;
      }

      // For all orders, use Scan (no GSI for this case)
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

      allOrders.sort((a, b) => {
        const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
        if (dateB !== dateA) return dateB - dateA;
        return (b.id || 0) - (a.id || 0);
      });
      await RedisCache.set(cacheKey, allOrders, 'orders');
      return allOrders;
    } catch (err) {
      throw err;
    }
  }

  /** Invalidate Redis cache for customer orders (call after create/update). */
  static async invalidateCustomerOrdersCache(customerId) {
    const cid = customerId == null ? null : (typeof customerId === 'string' && !isNaN(customerId) ? parseInt(customerId) : customerId);
    if (cid == null) return false;
    try {
      await RedisCache.delete(`${ORDER_BY_CUSTOMER_CACHE_PREFIX}${cid}`);
      return true;
    } catch (e) {
      return false;
    }
  }

  /** Invalidate Redis cache for orders by shop (call after create/update). */
  static async invalidateOrdersByShopCache(shopId) {
    const sid = shopId == null ? null : (typeof shopId === 'string' && !isNaN(shopId) ? parseInt(shopId) : shopId);
    if (sid == null) return false;
    try {
      await RedisCache.delete(`${ORDER_BY_SHOP_CACHE_PREFIX}${sid}`);
      return true;
    } catch (e) {
      return false;
    }
  }

  /** Invalidate Redis cache for orders by delivery boy (call after create/update). */
  static async invalidateOrdersByDeliveryCache(delvBoyId) {
    const dbid = delvBoyId == null ? null : (typeof delvBoyId === 'string' && !isNaN(delvBoyId) ? parseInt(delvBoyId) : delvBoyId);
    if (dbid == null) return false;
    try {
      await RedisCache.delete(`${ORDER_BY_DELIVERY_PREFIX}${dbid}`);
      return true;
    } catch (e) {
      return false;
    }
  }

  /** Invalidate Redis cache for order by order_no (call after update). */
  static async invalidateOrderByOrderNoCache(orderNo) {
    const key = orderNo == null ? null : String(orderNo).trim();
    if (!key) return false;
    try {
      await RedisCache.delete(`${ORDER_BY_ORDER_NO_PREFIX}${key}`);
      return true;
    } catch (e) {
      return false;
    }
  }
}

module.exports = Order;
