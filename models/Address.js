const { getDynamoDBClient } = require('../config/dynamodb');
const { GetCommand, PutCommand, UpdateCommand, ScanCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');
const RedisCache = require('../utils/redisCache');

const TABLE_NAME = 'addresses';
const ADDRESS_BY_CUSTOMER_PREFIX = 'address:by_customer:';

class Address {
  // Find address by ID
  static async findById(id) {
    try {
      const client = getDynamoDBClient();
      const command = new GetCommand({
        TableName: TABLE_NAME,
        Key: { id: id }
      });

      const response = await client.send(command);
      return response.Item || null;
    } catch (err) {
      console.error('Address.findById error:', err);
      throw err;
    }
  }

  // Find addresses by customer ID
  static async findByCustomerId(customerId) {
    try {
      const cid = typeof customerId === 'string' && !isNaN(customerId) ? parseInt(customerId) : customerId;
      const cacheKey = `${ADDRESS_BY_CUSTOMER_PREFIX}${cid}`;
      const cached = await RedisCache.get(cacheKey);
      if (cached !== null && cached !== undefined && Array.isArray(cached)) {
        return cached;
      }

      const client = getDynamoDBClient();
      if (!client) {
        throw new Error('DynamoDB client is not initialized');
      }

      let activeAddresses = [];
      try {
        const command = new QueryCommand({
          TableName: TABLE_NAME,
          IndexName: 'customer_id-index',
          KeyConditionExpression: 'customer_id = :customerId',
          FilterExpression: 'attribute_not_exists(#del) OR #del <> :deleted',
          ExpressionAttributeNames: { '#del': 'del_status' },
          ExpressionAttributeValues: {
            ':customerId': cid,
            ':deleted': 0
          }
        });
        const response = await client.send(command);
        activeAddresses = (response.Items || []).filter(item => !item.del_status || item.del_status !== 0);
      } catch (gsiErr) {
        console.warn('GSI query failed, falling back to scan:', gsiErr.message);
        const scanClient = getDynamoDBClient();
        if (!scanClient) throw new Error('DynamoDB client is not initialized');
        const command = new ScanCommand({
          TableName: TABLE_NAME,
          FilterExpression: 'customer_id = :customerId AND (attribute_not_exists(#del) OR #del <> :deleted)',
          ExpressionAttributeNames: { '#del': 'del_status' },
          ExpressionAttributeValues: { ':customerId': cid, ':deleted': 0 }
        });
        const response = await scanClient.send(command);
        activeAddresses = (response.Items || []).filter(item => !item.del_status || item.del_status !== 0);
      }
      await RedisCache.set(cacheKey, activeAddresses, 'orders');
      return activeAddresses;
    } catch (err) {
      console.error('Address.findByCustomerId error:', err);
      console.error('Error stack:', err.stack);
      throw err;
    }
  }

  /**
   * Bulk fetch addresses by customer_ids (and/or user_ids as customer_id) with a single Scan (RCU-optimized).
   * Use for /admin/customers enrichment instead of N × findByCustomerId.
   * @param {Set<number>|Array<number>} ids - customer_id or user_id values to match
   * @returns {Promise<Map<number, Array>>} Map of customerId -> addresses[]
   */
  static async findByCustomerIdsBulk(ids) {
    const map = new Map();
    const idSet = new Set(Array.isArray(ids) ? ids : [...ids].map(i => typeof i === 'string' && !isNaN(i) ? parseInt(i) : i));
    if (idSet.size === 0) return map;
    const client = getDynamoDBClient();
    let lastKey = null;
    do {
      const params = {
        TableName: TABLE_NAME,
        FilterExpression: 'attribute_not_exists(#del) OR #del <> :deleted',
        ExpressionAttributeNames: { '#del': 'del_status' },
        ExpressionAttributeValues: { ':deleted': 0 }
      };
      if (lastKey) params.ExclusiveStartKey = lastKey;
      const command = new ScanCommand(params);
      const response = await client.send(command);
      for (const a of response.Items || []) {
        if (a.del_status === 0) continue;
        const cid = a.customer_id != null ? (typeof a.customer_id === 'string' && !isNaN(a.customer_id) ? parseInt(a.customer_id) : a.customer_id) : null;
        if (cid == null || !idSet.has(cid)) continue;
        if (!map.has(cid)) map.set(cid, []);
        map.get(cid).push(a);
      }
      lastKey = response.LastEvaluatedKey;
    } while (lastKey);
    for (const arr of map.values()) {
      arr.sort((x, y) => new Date(y.created_at || y.updated_at || 0).getTime() - new Date(x.created_at || x.updated_at || 0).getTime());
    }
    return map;
  }

  // Create a new address
  static async create(data) {
    try {
      const client = getDynamoDBClient();
      const id = data.id || (Date.now() + Math.floor(Math.random() * 1000));
      
      // Parse latitude and longitude - prioritize separate fields over lat_log
      let latitude = data.latitude;
      let longitude = data.longitude;
      let lat_log = data.lat_log || '';
      
      // Convert to numbers if they're strings
      if (latitude !== undefined && latitude !== null) {
        latitude = typeof latitude === 'string' ? parseFloat(latitude) : latitude;
      }
      if (longitude !== undefined && longitude !== null) {
        longitude = typeof longitude === 'string' ? parseFloat(longitude) : longitude;
      }
      
      // If latitude/longitude are provided, use them (even if lat_log is also provided)
      // This ensures we use the most accurate values
      if (latitude !== undefined && latitude !== null && !isNaN(latitude) &&
          longitude !== undefined && longitude !== null && !isNaN(longitude)) {
        // Use the provided latitude/longitude and create/update lat_log
        lat_log = `${latitude},${longitude}`;
      } else if (lat_log && lat_log.includes(',')) {
      // If lat_log is provided but latitude/longitude are not, parse from lat_log
        const parts = lat_log.split(',');
        if (parts.length >= 2) {
          latitude = parseFloat(parts[0].trim());
          longitude = parseFloat(parts[1].trim());
          // Validate parsed values
          if (isNaN(latitude) || isNaN(longitude)) {
            latitude = null;
            longitude = null;
            lat_log = '';
          }
        }
      } else {
        // No valid location data
        latitude = null;
        longitude = null;
        lat_log = '';
      }
      
      const address = {
        id: id,
        customer_id: typeof data.customer_id === 'string' && !isNaN(data.customer_id) ? parseInt(data.customer_id) : data.customer_id,
        address: data.address || '',
        addres_type: data.addres_type || 'Home',
        building_no: data.building_no || '',
        landmark: data.landmark || '',
        lat_log: lat_log || '',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      
      // Only add latitude and longitude if they have valid values
      // DynamoDB will store these as numbers
      if (latitude !== null && latitude !== undefined && !isNaN(latitude)) {
        address.latitude = latitude;
      }
      if (longitude !== null && longitude !== undefined && !isNaN(longitude)) {
        address.longitude = longitude;
      }
      
      console.log('📍 Address.create - Final address data:', JSON.stringify(address, null, 2));
      console.log('📍 Location fields:', {
        lat_log: address.lat_log,
        latitude: address.latitude,
        longitude: address.longitude,
        hasLatitude: 'latitude' in address,
        hasLongitude: 'longitude' in address
      });

      const command = new PutCommand({
        TableName: TABLE_NAME,
        Item: address
      });

      await client.send(command);
      if (address.customer_id != null) Address.invalidateAddressCache(address.customer_id).catch(() => {});
      return address;
    } catch (err) {
      console.error('Address.create error:', err);
      throw err;
    }
  }

  /** Invalidate Redis cache for addresses by customer (call after create/update/delete). */
  static async invalidateAddressCache(customerId) {
    const cid = customerId == null ? null : (typeof customerId === 'string' && !isNaN(customerId) ? parseInt(customerId) : customerId);
    if (cid == null) return false;
    try {
      await RedisCache.delete(`${ADDRESS_BY_CUSTOMER_PREFIX}${cid}`);
      return true;
    } catch (e) {
      return false;
    }
  }

  // Update an address
  static async update(id, data) {
    try {
      const client = getDynamoDBClient();
      
      const updateExpression = [];
      const expressionAttributeNames = {};
      const expressionAttributeValues = {};

      // Build update expression dynamically
      if (data.address !== undefined) {
        updateExpression.push('#address = :address');
        expressionAttributeNames['#address'] = 'address';
        expressionAttributeValues[':address'] = data.address;
      }
      if (data.addres_type !== undefined) {
        updateExpression.push('#addres_type = :addres_type');
        expressionAttributeNames['#addres_type'] = 'addres_type';
        expressionAttributeValues[':addres_type'] = data.addres_type;
      }
      if (data.building_no !== undefined) {
        updateExpression.push('#building_no = :building_no');
        expressionAttributeNames['#building_no'] = 'building_no';
        expressionAttributeValues[':building_no'] = data.building_no;
      }
      if (data.landmark !== undefined) {
        updateExpression.push('#landmark = :landmark');
        expressionAttributeNames['#landmark'] = 'landmark';
        expressionAttributeValues[':landmark'] = data.landmark;
      }
      if (data.lat_log !== undefined) {
        updateExpression.push('#lat_log = :lat_log');
        expressionAttributeNames['#lat_log'] = 'lat_log';
        expressionAttributeValues[':lat_log'] = data.lat_log;
      }
      if (data.latitude !== undefined) {
        updateExpression.push('#latitude = :latitude');
        expressionAttributeNames['#latitude'] = 'latitude';
        expressionAttributeValues[':latitude'] = typeof data.latitude === 'string' ? parseFloat(data.latitude) : data.latitude;
      }
      if (data.longitude !== undefined) {
        updateExpression.push('#longitude = :longitude');
        expressionAttributeNames['#longitude'] = 'longitude';
        expressionAttributeValues[':longitude'] = typeof data.longitude === 'string' ? parseFloat(data.longitude) : data.longitude;
      }

      // Always update updated_at
      updateExpression.push('#updated_at = :updated_at');
      expressionAttributeNames['#updated_at'] = 'updated_at';
      expressionAttributeValues[':updated_at'] = new Date().toISOString();

      if (updateExpression.length === 0) {
        throw new Error('No fields to update');
      }

      const command = new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { id: id },
        UpdateExpression: `SET ${updateExpression.join(', ')}`,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        ReturnValues: 'ALL_NEW'
      });

      const response = await client.send(command);
      const attrs = response.Attributes;
      if (attrs && attrs.customer_id != null) Address.invalidateAddressCache(attrs.customer_id).catch(() => {});
      return attrs;
    } catch (err) {
      console.error('Address.update error:', err);
      throw err;
    }
  }

  // Delete an address
  static async delete(id) {
    try {
      const client = getDynamoDBClient();
      const command = new GetCommand({
        TableName: TABLE_NAME,
        Key: { id: id }
      });

      const response = await client.send(command);
      if (!response.Item) {
        throw new Error('Address not found');
      }
      const customerId = response.Item.customer_id;

      // For soft delete, you might want to add a del_status field
      // For now, we'll do a hard delete
      const deleteCommand = new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { id: id },
        UpdateExpression: 'SET #updated_at = :updated_at, #del_status = :del_status',
        ExpressionAttributeNames: {
          '#updated_at': 'updated_at',
          '#del_status': 'del_status'
        },
        ExpressionAttributeValues: {
          ':updated_at': new Date().toISOString(),
          ':del_status': 0
        },
        ReturnValues: 'ALL_NEW'
      });

      const deleteResponse = await client.send(deleteCommand);
      if (customerId != null) Address.invalidateAddressCache(customerId).catch(() => {});
      return deleteResponse.Attributes;
    } catch (err) {
      console.error('Address.delete error:', err);
      throw err;
    }
  }
}

module.exports = Address;

