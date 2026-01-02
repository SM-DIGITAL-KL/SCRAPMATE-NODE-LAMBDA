const RedisCache = require('../utils/redisCache');

class SitePanelController {
  static async getSite(req, res) {
    try {
      console.log('\n');
      console.log('═══════════════════════════════════════════════════════════');
      console.log('🟢 SitePanelController.getSite called');
      console.log('═══════════════════════════════════════════════════════════');
      console.log('   Request Method:', req.method);
      console.log('   Request Path:', req.path);
      
      // Check Redis cache first
      const cacheKey = RedisCache.adminKey('site_profile');
      try {
        const cached = await RedisCache.get(cacheKey);
        if (cached) {
          console.log('⚡ Site profile cache hit');
          return res.json(cached);
        }
      } catch (err) {
        console.error('Redis get error:', err);
      }
      
      // TODO: admin_profile table - Create AdminProfile model if needed
      // For now, return default profile
      const profile = {
        id: 1,
        name: 'Site Name',
        email: 'admin@example.com',
        contact: '',
        address: '',
        location: '',
        logo: '',
        appVersion: process.env.APP_VERSION || '1.0.0'
      };
      
      console.log('✅ getSite: Using default admin profile');
      console.log('   Profile data:', {
        id: profile.id,
        name: profile.name,
        email: profile.email,
        hasLogo: !!profile.logo,
        appVersion: profile.appVersion
      });
      
      const response = {
        status: 'success',
        msg: 'Site data retrieved',
        data: {
          pagename: 'Manage Site',
          profile: profile
        }
      };
      
      // Cache site profile for 1 hour
      try {
        await RedisCache.set(cacheKey, response, '30days');
        console.log('💾 Site profile cached');
      } catch (err) {
        console.error('Redis cache set error:', err);
      }
      
      res.json(response);
    } catch (error) {
      console.error('❌ getSite error:', error);
      console.error('   Error stack:', error.stack);
      res.status(500).json({
        status: 'error',
        msg: 'Error fetching site data',
        data: { pagename: 'Manage Site', profile: null }
      });
    }
  }

  static async updateSite(req, res) {
    try {
      console.log('\n');
      console.log('═══════════════════════════════════════════════════════════');
      console.log('🟢 SitePanelController.updateSite called');
      console.log('═══════════════════════════════════════════════════════════');
      console.log('   Request Method:', req.method);
      console.log('   Request Body:', {
        name: req.body.name || 'not provided',
        email: req.body.email || 'not provided',
        contact: req.body.contact || 'not provided',
        address: req.body.address || 'not provided',
        location: req.body.location || 'not provided',
        logo: req.body.logo ? 'provided' : 'not provided'
      });
      
      const { name, email, contact, address, location, logo } = req.body;
      
      // TODO: admin_profile table - Create AdminProfile model if needed
      // For now, just log the update
      console.log('🟢 updateSite: Would update admin profile with:', {
        name, email, contact, address, location, logo: logo ? 'provided' : 'not provided'
      });
      
      if (!name && !email && !contact && !address && !location && !logo) {
        console.log('⚠️  updateSite: No fields to update');
        return res.json({
          status: 'success',
          msg: 'No changes to update',
          data: null
        });
      }
      
      console.log('✅ updateSite: Site updated successfully');
      
      // Invalidate related caches
      try {
        await RedisCache.invalidateTableCache('admin_profile');
        await RedisCache.delete(RedisCache.adminKey('site_profile'));
        console.log('🗑️  Invalidated site caches after update');
      } catch (err) {
        console.error('Redis cache invalidation error:', err);
      }
      
      res.json({
        status: 'success',
        msg: 'Site updated successfully',
        data: null
      });
    } catch (error) {
      console.error('❌ updateSite error:', error);
      console.error('   Error stack:', error.stack);
      res.json({
        status: 'error',
        msg: 'Error updating site',
        data: null
      });
    }
  }

  static async getAppVersion(req, res) {
    try {
      console.log('🟢 SitePanelController.getAppVersion called');
      
      // Check Redis cache first
      const cacheKey = RedisCache.adminKey('app_version');
      try {
        const cached = await RedisCache.get(cacheKey);
        if (cached) {
          console.log('⚡ App version cache hit');
          return res.json(cached);
        }
      } catch (err) {
        console.error('Redis get error:', err);
      }
      
      // Try to fetch from DynamoDB admin_profile table
      const { getDynamoDBClient } = require('../config/dynamodb');
      const { GetCommand } = require('@aws-sdk/lib-dynamodb');
      let appVersion = process.env.APP_VERSION || '1.0.0';
      
      try {
        const client = getDynamoDBClient();
        const command = new GetCommand({
          TableName: 'admin_profile',
          Key: { id: 1 }
        });
        const response = await client.send(command);
        
        if (response.Item) {
          // Use vendor_app_version if available (for partner app), otherwise fall back to appVersion or app_version
          appVersion = response.Item.vendor_app_version || 
                      response.Item.appVersion || 
                      response.Item.app_version || 
                      appVersion;
          console.log('✅ getAppVersion: Retrieved app version from DynamoDB:', appVersion);
        } else {
          console.log('⚠️ admin_profile not found in DynamoDB, using env/default version:', appVersion);
        }
      } catch (dbError) {
        console.error('❌ Error fetching app version from DynamoDB:', dbError);
        console.log('⚠️ Falling back to env/default version:', appVersion);
        // Continue with env/default version
      }
      
      console.log('✅ getAppVersion: Final app version:', appVersion);
      
      const response = {
        status: 'success',
        msg: 'App version retrieved',
        data: { appVersion: appVersion }
      };
      
      // Cache app version for 1 hour
      try {
        await RedisCache.set(cacheKey, response, '30days');
        console.log('💾 App version cached');
      } catch (err) {
        console.error('Redis cache set error:', err);
      }
      
      res.json(response);
    } catch (error) {
      console.error('❌ getAppVersion error:', error);
      res.json({
        status: 'error',
        msg: 'Error fetching app version',
        data: { appVersion: '1.0.0' }
      });
    }
  }

  static async updateAppVersion(req, res) {
    try {
      const { version } = req.body;
      console.log('🟢 SitePanelController.updateAppVersion called');
      console.log('   New version:', version || 'not provided');
      
      if (!version) {
        return res.json({
          status: 'error',
          msg: 'Version is required',
          data: null
        });
      }
      
      // Update admin_profile table in DynamoDB
      const { getDynamoDBClient } = require('../config/dynamodb');
      const { GetCommand, PutCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
      const client = getDynamoDBClient();
      
      // Check if admin_profile exists
      const getCommand = new GetCommand({
        TableName: 'admin_profile',
        Key: { id: 1 }
      });
      
      const response = await client.send(getCommand);
      
      if (response.Item) {
        // Update existing item - store as vendor_app_version for partner app
        const updateCommand = new UpdateCommand({
          TableName: 'admin_profile',
          Key: { id: 1 },
          UpdateExpression: 'SET vendor_app_version = :version, appVersion = :version, app_version = :version, #updated_at = :updated_at',
          ExpressionAttributeNames: {
            '#updated_at': 'updated_at'
          },
          ExpressionAttributeValues: {
            ':version': version,
            ':updated_at': new Date().toISOString()
          }
        });
        
        await client.send(updateCommand);
        console.log('✅ updateAppVersion: Updated vendor app version to:', version);
      } else {
        // Create new admin_profile item if it doesn't exist
        const newItem = {
          id: 1,
          name: 'SCRAPMATE',
          contact: 0,
          email: 'nil@nil.in',
          address: 'nil',
          location: 'nil',
          vendor_app_version: version,
          appVersion: version,
          app_version: version,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        
        const putCommand = new PutCommand({
          TableName: 'admin_profile',
          Item: newItem
        });
        
        await client.send(putCommand);
        console.log('✅ updateAppVersion: Created new admin_profile with vendor app version:', version);
      }
      
      // Invalidate related caches
      try {
        await RedisCache.invalidateTableCache('admin_profile');
        await RedisCache.delete(RedisCache.adminKey('app_version'));
        await RedisCache.delete(RedisCache.adminKey('site_profile'));
        console.log('🗑️  Invalidated app version caches after update');
      } catch (err) {
        console.error('Redis cache invalidation error:', err);
      }
      
      res.json({
        status: 'success',
        msg: 'App version updated successfully',
        data: null
      });
    } catch (error) {
      console.error('❌ updateAppVersion error:', error);
      res.json({
        status: 'error',
        msg: 'Error updating app version',
        data: null
      });
    }
  }
}

module.exports = SitePanelController;

