const Package = require('../models/Package');
const Invoice = require('../models/Invoice');
const RedisCache = require('../utils/redisCache');

class AccountsPanelController {
  static async subPackages(req, res) {
    try {
      console.log('🟢 AccountsPanelController.subPackages called');
      
      // Check Redis cache first
      const cacheKey = RedisCache.listKey('sub_packages');
      try {
        const cached = await RedisCache.get(cacheKey);
        if (cached) {
          console.log('⚡ Sub packages cache hit');
          return res.json({
            status: 'success',
            msg: 'Sub packages retrieved',
            data: cached
          });
        }
      } catch (err) {
        console.error('Redis get error:', err);
      }
      
      // Use Package model to get all packages (excluding status 3)
      const packages = await Package.getAll();
      console.log(`✅ subPackages: Found ${packages.length} packages`);
      if (packages.length > 0) {
        console.log('   Sample package:', {
          id: packages[0].id,
          name: packages[0].name,
          type: packages[0].type,
          status: packages[0].status
        });
      }
      
      // Cache packages for 1 hour
      try {
        await RedisCache.set(cacheKey, packages, '30days');
        console.log('💾 Sub packages cached');
      } catch (err) {
        console.error('Redis cache set error:', err);
      }
      
      res.json({
        status: 'success',
        msg: 'Sub packages retrieved',
        data: packages
      });
    } catch (error) {
      console.error('❌ subPackages error:', error);
      console.error('   Error stack:', error.stack);
      res.status(500).json({
        status: 'error',
        msg: 'Error fetching packages',
        data: []
      });
    }
  }

  static async getSubPackageById(req, res) {
    try {
      const { id } = req.params;
      
      // Check Redis cache first
      const cacheKey = RedisCache.listKey('sub_package', { id });
      try {
        const cached = await RedisCache.get(cacheKey);
        if (cached) {
          console.log('⚡ Sub package cache hit:', cacheKey);
          return res.json(cached);
        }
      } catch (err) {
        console.error('Redis get error:', err);
      }
      
      // Use Package model
      const packageData = await Package.findById(id);
      
      if (!packageData) {
        return res.status(404).json({
          status: 'error',
          msg: 'Package not found',
          data: null
        });
      }
      
      const response = {
        status: 'success',
        msg: 'Sub package retrieved',
        data: packageData
      };
      
      // Cache package for 1 hour
      try {
        await RedisCache.set(cacheKey, response, '30days');
        console.log('💾 Sub package cached:', cacheKey);
      } catch (err) {
        console.error('Redis cache set error:', err);
      }
      
      res.json(response);
    } catch (error) {
      console.error('Get sub package error:', error);
      res.status(500).json({
        status: 'error',
        msg: 'Error fetching package',
        data: null
      });
    }
  }

  static async subscribersList(req, res) {
    try {
      console.log('🟢 AccountsPanelController.subscribersList called');
      res.json({
        status: 'success',
        msg: 'Subscribers list page',
        data: { pagename: 'Subcribers List' }
      });
    } catch (error) {
      console.error('❌ subscribersList error:', error);
      res.status(500).json({
        status: 'error',
        msg: 'Error loading subscribers page',
        data: { pagename: 'Subcribers List' }
      });
    }
  }

  static async viewSubscribersList(req, res) {
    try {
      console.log('🟢 AccountsPanelController.viewSubscribersList called');
      
      // Check Redis cache first
      const cacheKey = RedisCache.listKey('subscribers_list');
      try {
        const cached = await RedisCache.get(cacheKey);
        if (cached) {
          console.log('⚡ Subscribers list cache hit');
          return res.json(cached);
        }
      } catch (err) {
        console.error('Redis get error:', err);
      }
      
      // Use Invoice model to get all invoices, then join with Shop model
      const Shop = require('../models/Shop');
      const allInvoices = await Invoice.getAll();
      
      // Get unique user_ids and fetch shops
      const userIds = [...new Set(allInvoices.map(i => i.user_id).filter(Boolean))];
      const shops = await Shop.findByUserIds(userIds);
      const shopMap = {};
      shops.forEach(s => { shopMap[s.user_id] = s; });
      
      // Combine invoices with shop names
      const invoices = allInvoices.map(invoice => ({
        ...invoice,
        shopname: invoice.user_id && shopMap[invoice.user_id] ? shopMap[invoice.user_id].shopname : null
      }));
      
      console.log('🟢 Fetched invoices with shop names');
      
      console.log(`✅ viewSubscribersList: Found ${invoices.length} invoices`);
      if (invoices.length > 0) {
        console.log('   Sample invoice:', {
          id: invoices[0].id,
          user_id: invoices[0].user_id,
          name: invoices[0].name,
          shopname: invoices[0].shopname || 'N/A',
          from_date: invoices[0].from_date,
          to_date: invoices[0].to_date,
          from_date_type: typeof invoices[0].from_date,
          to_date_type: typeof invoices[0].to_date
        });
        
        // Format dates to ensure Y-m-d format (in case they come as datetime objects)
        invoices.forEach(invoice => {
          if (invoice.from_date) {
            // If it's a Date object, format it; otherwise keep as is if already string
            if (invoice.from_date instanceof Date) {
              invoice.from_date = invoice.from_date.toISOString().split('T')[0];
            } else if (typeof invoice.from_date === 'string' && invoice.from_date.includes(' ')) {
              // If it's a datetime string, extract just the date part
              invoice.from_date = invoice.from_date.split(' ')[0];
            }
          }
          if (invoice.to_date) {
            if (invoice.to_date instanceof Date) {
              invoice.to_date = invoice.to_date.toISOString().split('T')[0];
            } else if (typeof invoice.to_date === 'string' && invoice.to_date.includes(' ')) {
              invoice.to_date = invoice.to_date.split(' ')[0];
            }
          }
        });
      }
      
      const response = {
        status: 'success',
        msg: 'Subscribers list retrieved',
        data: invoices
      };
      
      // Cache subscribers list for 10 minutes
      try {
        await RedisCache.set(cacheKey, response, '30days');
        console.log('💾 Subscribers list cached');
      } catch (err) {
        console.error('Redis cache set error:', err);
      }
      
      res.json(response);
    } catch (error) {
      console.error('❌ viewSubscribersList error:', error);
      console.error('   Error stack:', error.stack);
      res.json({
        status: 'error',
        msg: 'Error fetching subscribers list',
        data: []
      });
    }
  }

  static async createSubPackage(req, res) {
    try {
      const { name, displayname, type, orders, price, duration } = req.body;
      
      if (!name || !displayname || type === undefined || !orders || price === undefined || !duration) {
        return res.status(400).json({
          status: 'error',
          msg: 'Missing required fields',
          data: null
        });
      }
      
      // Check if free package already exists
      if (type == 1) {
        const existing = await Package.findByType(1);
        if (existing) {
          return res.status(400).json({
            status: 'error',
            msg: 'Free Package Already Exists',
            data: null
          });
        }
      }
      
      // Use Package model to create
      const packageData = await Package.create({
        name,
        displayname,
        type,
        orders,
        price,
        duration,
        status: 1
      });
      
      // Invalidate related caches
      try {
        await RedisCache.invalidateTableCache('packages');
        await RedisCache.delete(RedisCache.listKey('sub_packages'));
        console.log('🗑️  Invalidated package caches after create');
      } catch (err) {
        console.error('Redis cache invalidation error:', err);
      }
      
      res.json({
        status: 'success',
        msg: 'Package created successfully',
        data: { id: packageData.id }
      });
    } catch (error) {
      console.error('Create sub package error:', error);
      res.status(500).json({
        status: 'error',
        msg: 'Error creating package',
        data: null
      });
    }
  }

  static async updateSubPackage(req, res) {
    try {
      const { id } = req.params;
      const { name, displayname, type, orders, price, duration } = req.body;
      
      // Get existing package
      const existing = await Package.findById(id);
      if (!existing) {
        return res.status(404).json({
          status: 'error',
          msg: 'Package not found',
          data: null
        });
      }
      
      // Update package using Package model
      await Package.update(id, {
        name: name || existing.name,
        displayname: displayname || existing.displayname,
        type: type !== undefined ? type : existing.type,
        orders: orders || existing.orders,
        price: price !== undefined ? price : existing.price,
        duration: duration || existing.duration
      });
      
      // Invalidate related caches
      try {
        await RedisCache.invalidateTableCache('packages');
        await RedisCache.delete(RedisCache.listKey('sub_packages'));
        await RedisCache.delete(RedisCache.listKey('sub_package', { id }));
        console.log('🗑️  Invalidated package caches after update');
      } catch (err) {
        console.error('Redis cache invalidation error:', err);
      }
      
      res.json({
        status: 'success',
        msg: 'Package updated successfully',
        data: null
      });
    } catch (error) {
      console.error('Update sub package error:', error);
      res.status(500).json({
        status: 'error',
        msg: 'Error updating package',
        data: null
      });
    }
  }

  static async deleteSubPackage(req, res) {
    try {
      const { id } = req.params;
      
      // Check if package exists
      const existing = await Package.findById(id);
      if (!existing) {
        return res.status(404).json({
          status: 'error',
          msg: 'Package not found',
          data: null
        });
      }
      
      // Delete package using Package model
      await Package.delete(id);
      
      // Invalidate related caches
      try {
        await RedisCache.invalidateTableCache('packages');
        await RedisCache.delete(RedisCache.listKey('sub_packages'));
        await RedisCache.delete(RedisCache.listKey('sub_package', { id }));
        console.log('🗑️  Invalidated package caches after delete');
      } catch (err) {
        console.error('Redis cache invalidation error:', err);
      }
      
      res.json({
        status: 'success',
        msg: 'Package deleted successfully',
        data: null
      });
    } catch (error) {
      console.error('Delete sub package error:', error);
      res.status(500).json({
        status: 'error',
        msg: 'Error deleting package',
        data: null
      });
    }
  }

  static async updateSubPackageStatus(req, res) {
    try {
      const { planId } = req.body;
      
      if (!planId) {
        return res.status(400).json({
          status: 'error',
          msg: 'Plan ID is required',
          data: null
        });
      }
      
      // Get current status using Package model
      const packageData = await Package.findById(planId);
      if (!packageData) {
        return res.status(404).json({
          status: 'error',
          msg: 'Package not found',
          data: null
        });
      }
      
      // Toggle status (1 to 2, 2 to 1)
      const newStatus = packageData.status == 1 ? 2 : 1;
      await Package.update(planId, { status: newStatus });
      
      // Invalidate related caches
      try {
        await RedisCache.invalidateTableCache('packages');
        await RedisCache.delete(RedisCache.listKey('sub_packages'));
        await RedisCache.delete(RedisCache.listKey('sub_package', { id: planId }));
        console.log('🗑️  Invalidated package caches after status update');
      } catch (err) {
        console.error('Redis cache invalidation error:', err);
      }
      
      res.json({
        status: 'success',
        msg: 'Package status updated successfully',
        data: { status: newStatus }
      });
    } catch (error) {
      console.error('Update sub package status error:', error);
      res.status(500).json({
        status: 'error',
        msg: 'Error updating package status',
        data: null
      });
    }
  }
}

module.exports = AccountsPanelController;

