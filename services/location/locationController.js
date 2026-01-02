/**
 * Location Tracking Controller
 * Handles location updates and retrieval from Redis cache
 */

const redis = require('../../config/redis');
const User = require('../../models/User');

class LocationController {
  /**
   * Update current location of pickup vendor
   * POST /api/v2/location/update
   */
  static async updateLocation(req, res) {
    try {
      console.log('📍 [LocationController] updateLocation called');
      console.log('📍 Request body:', JSON.stringify(req.body, null, 2));
      
      const { user_id, user_type, latitude, longitude, order_id } = req.body;

      // Validation
      if (!user_id || !user_type || latitude === undefined || longitude === undefined) {
        console.error('❌ [LocationController] Validation failed:', {
          user_id: !!user_id,
          user_type: !!user_type,
          latitude: latitude !== undefined,
          longitude: longitude !== undefined
        });
        return res.status(400).json({
          status: 'error',
          msg: 'Missing required fields: user_id, user_type, latitude, longitude',
          data: null
        });
      }

      // Validate user type
      const validTypes = ['R', 'S', 'D', 'SR'];
      if (!validTypes.includes(user_type)) {
        return res.status(400).json({
          status: 'error',
          msg: 'Invalid user_type. Must be R, S, D, or SR',
          data: null
        });
      }

      // Validate coordinates
      if (typeof latitude !== 'number' || typeof longitude !== 'number') {
        return res.status(400).json({
          status: 'error',
          msg: 'latitude and longitude must be numbers',
          data: null
        });
      }

      if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
        return res.status(400).json({
          status: 'error',
          msg: 'Invalid coordinates. Latitude must be between -90 and 90, longitude between -180 and 180',
          data: null
        });
      }

      // Verify user exists and has correct type
      const user = await User.findById(user_id);
      if (!user) {
        return res.status(404).json({
          status: 'error',
          msg: 'User not found',
          data: null
        });
      }

      if (!validTypes.includes(user.user_type)) {
        return res.status(403).json({
          status: 'error',
          msg: 'User does not have permission to update location',
          data: null
        });
      }

      const timestamp = new Date().toISOString();
      const locationData = {
        user_id: parseInt(user_id),
        user_type: user_type,
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        timestamp: timestamp,
        order_id: order_id ? parseInt(order_id) : null
      };

      // Store location in Redis with key pattern: location:user:{user_id}:type:{user_type}
      // If order_id provided, also store with key: location:order:{order_id}
      const userIdNum = parseInt(user_id);
      
      // Primary key: location by user
      const userLocationKey = `location:user:${userIdNum}:type:${user_type}`;
      
      // Store location with TTL of 1 hour (3600 seconds)
      // Location expires after 1 hour of inactivity
      // Upstash Redis uses: redis.set(key, value, { ex: ttlSeconds })
      await redis.set(
        userLocationKey,
        JSON.stringify(locationData),
        { ex: 3600 } // TTL: 1 hour
      );

      // If order_id is provided, also store location indexed by order
      if (order_id) {
        const orderLocationKey = `location:order:${order_id}`;
        await redis.set(
          orderLocationKey,
          JSON.stringify({
            order_id: parseInt(order_id),
            ...locationData
          }),
          { ex: 3600 } // TTL: 1 hour
        );
      }

      console.log(`📍 Location updated for user ${user_id} (${user_type}) at ${latitude}, ${longitude}`);

      // If order_id is provided, save location history to DynamoDB every 30 minutes
      if (order_id) {
        try {
          const OrderLocationHistory = require('../../models/OrderLocationHistory');
          const orderIdNum = parseInt(order_id);
          
          console.log(`💾 [LocationController] Checking location history for order ${orderIdNum}`);
          
          // Get last saved location for this order
          const lastLocation = await OrderLocationHistory.getLastLocation(orderIdNum);
          const now = Date.now();
          const thirtyMinutes = 30 * 60 * 1000; // 30 minutes in milliseconds
          
          console.log(`💾 [LocationController] Last location:`, lastLocation ? {
            timestamp: lastLocation.timestamp,
            timeDiff: now - (lastLocation.timestamp || 0),
            shouldSave: !lastLocation || (now - (lastLocation.timestamp || 0) > thirtyMinutes)
          } : 'No previous location');
          
          // Save if no previous location or 30 minutes have passed
          if (!lastLocation || (now - (lastLocation.timestamp || 0) > thirtyMinutes)) {
            console.log(`💾 [LocationController] Saving location history for order ${orderIdNum}`);
            await OrderLocationHistory.save({
              order_id: orderIdNum,
              user_id: userIdNum,
              user_type: user_type,
              latitude: parseFloat(latitude),
              longitude: parseFloat(longitude),
              timestamp: now,
              created_at: new Date().toISOString()
            });
            console.log(`💾 [LocationController] Location history saved to DynamoDB for order ${orderIdNum}`);
          } else {
            console.log(`💾 [LocationController] Skipping save - only ${Math.round((now - (lastLocation.timestamp || 0)) / 1000 / 60)} minutes since last save`);
          }
        } catch (historyError) {
          console.error('❌ [LocationController] Error saving location history:', historyError);
          console.error('❌ [LocationController] Error stack:', historyError.stack);
          // Don't fail the request if history save fails
        }
      }

      return res.json({
        status: 'success',
        msg: 'Location updated successfully',
        data: {
          user_id: locationData.user_id,
          user_type: locationData.user_type,
          latitude: locationData.latitude,
          longitude: locationData.longitude,
          timestamp: locationData.timestamp,
          order_id: locationData.order_id
        }
      });
    } catch (error) {
      console.error('❌ [LocationController] Error updating location:', error);
      console.error('❌ [LocationController] Error stack:', error.stack);
      console.error('❌ [LocationController] Request body was:', JSON.stringify(req.body, null, 2));
      return res.status(500).json({
        status: 'error',
        msg: 'Failed to update location',
        data: null
      });
    }
  }

  /**
   * Get current location of a pickup vendor
   * GET /api/v2/location/:userId
   */
  static async getLocation(req, res) {
    try {
      const { userId } = req.params;
      const { user_type, order_id } = req.query;

      if (!user_type) {
        return res.status(400).json({
          status: 'error',
          msg: 'Missing required query param: user_type',
          data: null
        });
      }

      const validTypes = ['R', 'S', 'D', 'SR'];
      if (!validTypes.includes(user_type)) {
        return res.status(400).json({
          status: 'error',
          msg: 'Invalid user_type. Must be R, S, D, or SR',
          data: null
        });
      }

      const userIdNum = parseInt(userId);
      let locationData = null;

      // If order_id provided, try to get location by order first
      if (order_id) {
        const orderLocationKey = `location:order:${order_id}`;
        const orderLocation = await redis.get(orderLocationKey);
        if (orderLocation) {
          try {
            locationData = JSON.parse(orderLocation);
            // Verify this location is for the requested user
            if (locationData.user_id === userIdNum && locationData.user_type === user_type) {
              return res.json({
                status: 'success',
                msg: 'Location retrieved successfully',
                data: locationData
              });
            }
          } catch (e) {
            console.error('Error parsing order location:', e);
          }
        }
      }

      // Get location by user
      const userLocationKey = `location:user:${userIdNum}:type:${user_type}`;
      const userLocation = await redis.get(userLocationKey);
      
      if (!userLocation) {
        return res.status(404).json({
          status: 'error',
          msg: 'Location not found. Vendor location not available.',
          data: null
        });
      }

      try {
        locationData = JSON.parse(userLocation);
        return res.json({
          status: 'success',
          msg: 'Location retrieved successfully',
          data: locationData
        });
      } catch (e) {
        console.error('Error parsing location data:', e);
        return res.status(500).json({
          status: 'error',
          msg: 'Failed to parse location data',
          data: null
        });
      }
    } catch (error) {
      console.error('Error getting location:', error);
      return res.status(500).json({
        status: 'error',
        msg: 'Failed to get location',
        data: null
      });
    }
  }

  /**
   * Get location of vendor assigned to specific order
   * GET /api/v2/location/order/:orderId
   */
  static async getLocationByOrder(req, res) {
    try {
      const { orderId } = req.params;
      const orderIdNum = parseInt(orderId);

      const orderLocationKey = `location:order:${orderIdNum}`;
      const orderLocation = await redis.get(orderLocationKey);

      if (!orderLocation) {
        // Return 200 with null data instead of 404 - this is expected when vendor hasn't started tracking yet
        return res.json({
          status: 'success',
          msg: 'Location not found for this order. Vendor may not have started tracking yet.',
          data: null
        });
      }

      try {
        const locationData = JSON.parse(orderLocation);
        return res.json({
          status: 'success',
          msg: 'Location retrieved successfully',
          data: {
            order_id: orderIdNum,
            vendor: {
              user_id: locationData.user_id,
              user_type: locationData.user_type,
              latitude: locationData.latitude,
              longitude: locationData.longitude,
              timestamp: locationData.timestamp
            }
          }
        });
      } catch (e) {
        console.error('Error parsing location data:', e);
        return res.status(500).json({
          status: 'error',
          msg: 'Failed to parse location data',
          data: null
        });
      }
    } catch (error) {
      console.error('Error getting location by order:', error);
      return res.status(500).json({
        status: 'error',
        msg: 'Failed to get location',
        data: null
      });
    }
  }

  /**
   * Clear location cache for a vendor
   * DELETE /api/v2/location/:userId
   */
  static async clearLocation(req, res) {
    try {
      const { userId } = req.params;
      const { user_type, order_id } = req.query;

      if (!user_type) {
        return res.status(400).json({
          status: 'error',
          msg: 'Missing required query param: user_type',
          data: null
        });
      }

      const userIdNum = parseInt(userId);
      const userLocationKey = `location:user:${userIdNum}:type:${user_type}`;
      
      // Delete user location
      await redis.del(userLocationKey);

      // If order_id provided, also delete order location
      if (order_id) {
        const orderIdNum = parseInt(order_id);
        const orderLocationKey = `location:order:${orderIdNum}`;
        await redis.del(orderLocationKey);
      }

      console.log(`🗑️  Location cleared for user ${userId} (${user_type})`);

      return res.json({
        status: 'success',
        msg: 'Location cleared successfully',
        data: null
      });
    } catch (error) {
      console.error('Error clearing location:', error);
      return res.status(500).json({
        status: 'error',
        msg: 'Failed to clear location',
        data: null
      });
    }
  }
}

module.exports = LocationController;





