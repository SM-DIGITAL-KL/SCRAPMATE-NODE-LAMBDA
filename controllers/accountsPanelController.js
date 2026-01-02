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
      console.log('🟢 AccountsPanelController.getSubPackageById called');
      console.log('   Request path:', req.path);
      console.log('   Request method:', req.method);
      console.log('   Request params:', req.params);
      console.log('   Request query:', req.query);
      
      const { id } = req.params;
      console.log('   Package ID:', id);
      
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

  /**
   * Get paid subscriptions with payment details for B2B and B2C users
   * Returns subscriptions with type='Paid' and includes user type information
   */
  static async getPaidSubscriptions(req, res) {
    try {
      console.log('🟢 AccountsPanelController.getPaidSubscriptions called');
      
      // Check Redis cache first (but allow bypass via query param for debugging)
      const cacheKey = RedisCache.listKey('paid_subscriptions');
      const bypassCache = req.query.bypassCache === 'true' || req.query.refresh === 'true';
      
      if (!bypassCache) {
        try {
          const cached = await RedisCache.get(cacheKey);
          if (cached) {
            console.log('⚡ Paid subscriptions cache hit', {
              cachedCount: Array.isArray(cached) ? cached.length : 'not array',
              cacheKey: cacheKey
            });
            // Return cached data but also log it for debugging
            // Ensure cached data is an array and return all payments
            const cachedData = Array.isArray(cached) ? cached : [];
            return res.json({
              status: 'success',
              msg: 'Paid subscriptions retrieved',
              data: cachedData,
              total: cachedData.length
            });
          } else {
            console.log('💭 Paid subscriptions cache miss - fetching from database');
          }
        } catch (err) {
          console.error('Redis get error:', err);
          // Continue to fetch from database if cache fails
        }
      } else {
        console.log('🔄 Cache bypass requested - fetching fresh data from database');
      }
      
      // Get all invoices with type='Paid'
      const allInvoices = await Invoice.getAll();
      console.log(`📊 Total invoices in database: ${allInvoices.length}`);
      
      const paidInvoices = allInvoices.filter(inv => inv.type === 'Paid' || inv.type === 'paid');
      
      console.log(`✅ Found ${paidInvoices.length} paid invoices`);
      
      // Log invoice IDs and user IDs for debugging
      if (paidInvoices.length > 0) {
        console.log('📋 Paid invoice details:', paidInvoices.map(inv => ({
          id: inv.id,
          user_id: inv.user_id,
          payment_moj_id: inv.payment_moj_id,
          created_at: inv.created_at,
          approval_status: inv.approval_status
        })));
      }
      
      // Get user information to determine B2B/B2C
      const User = require('../models/User');
      const Shop = require('../models/Shop');
      
      const userIds = [...new Set(paidInvoices.map(i => i.user_id).filter(Boolean))];
      
      // Fetch users and shops (handle errors gracefully)
      let users = [];
      let shops = [];
      try {
        if (userIds.length > 0) {
          users = await User.findByIds(userIds);
          shops = await Shop.findByUserIds(userIds);
        }
      } catch (err) {
        console.error('Error fetching users/shops:', err);
        // Continue with empty arrays if fetch fails
      }
      
      // Create maps for quick lookup
      const userMap = {};
      if (users && users.length > 0) {
        users.forEach(u => { userMap[u.id] = u; });
      }
      const shopMap = {};
      if (shops && shops.length > 0) {
        shops.forEach(s => { shopMap[s.user_id] = s; });
      }
      
      // Combine invoices with user and shop information
      const subscriptions = paidInvoices.map(invoice => {
        const user = invoice.user_id ? userMap[invoice.user_id] : null;
        const shop = invoice.user_id ? shopMap[invoice.user_id] : null;
        
        // Determine user type based on user mode or shop type
        let userType = 'Unknown';
        if (user) {
          // Check various fields that might indicate user type
          if (user.mode) {
            userType = user.mode.toUpperCase();
          } else if (user.user_type) {
            userType = user.user_type.toUpperCase();
          } else if (user.type) {
            userType = user.type.toUpperCase();
          }
        }
        
        // If still unknown, try to infer from shop type
        if (userType === 'Unknown' && shop) {
          if (shop.type === 'B' || shop.type === 'b') {
            userType = 'B2B';
          } else if (shop.type === 'C' || shop.type === 'c') {
            userType = 'B2C';
          }
        }
        
        // If still unknown, try to infer from package ID pattern (legacy support)
        if (userType === 'Unknown' && invoice.package_id) {
          if (invoice.package_id.includes('b2b')) {
            userType = 'B2B';
          } else if (invoice.package_id.includes('b2c')) {
            userType = 'B2C';
          }
        }
        
        return {
          ...invoice,
          user_type: userType,
          shopname: shop ? shop.shopname : null,
          username: user ? (user.name || user.username || `User ${invoice.user_id}`) : `User ${invoice.user_id}`,
          approval_status: invoice.approval_status || 'pending'
        };
      });
      
      // Sort by created_at descending (newest first) - but return ALL payments
      subscriptions.sort((a, b) => {
        const dateA = new Date(a.created_at || 0);
        const dateB = new Date(b.created_at || 0);
        return dateB - dateA;
      });
      
      // Return ALL payments in data array - no filtering
      const response = {
        status: 'success',
        msg: 'Paid subscriptions retrieved',
        data: subscriptions,
        total: subscriptions.length
      };
      
      // Cache for 5 minutes (shorter cache since approval status changes frequently)
      try {
        await RedisCache.set(cacheKey, subscriptions, 300);
        console.log('💾 Paid subscriptions cached');
      } catch (err) {
        console.error('Redis cache set error:', err);
      }
      
      res.json(response);
    } catch (error) {
      console.error('❌ getPaidSubscriptions error:', error);
      console.error('   Error stack:', error.stack);
      res.status(500).json({
        status: 'error',
        msg: 'Error fetching paid subscriptions',
        data: []
      });
    }
  }

  /**
   * Update subscription approval status
   * Body: { subscription_id, action: 'approve' | 'reject', notes?: string }
   */
  static async updateSubscriptionApproval(req, res) {
    try {
      const { subscription_id, action, notes } = req.body;
      
      if (!subscription_id || !action) {
        return res.status(400).json({
          status: 'error',
          msg: 'subscription_id and action are required',
          data: null
        });
      }
      
      if (!['approve', 'reject'].includes(action)) {
        return res.status(400).json({
          status: 'error',
          msg: 'action must be "approve" or "reject"',
          data: null
        });
      }
      
      console.log('🟢 AccountsPanelController.updateSubscriptionApproval called', {
        subscription_id,
        action,
        notes: notes || '(no notes provided)',
        notesType: typeof notes,
        notesLength: notes ? notes.length : 0
      });
      
      // Get the invoice
      const invoice = await Invoice.findById(subscription_id);
      if (!invoice) {
        console.error(`❌ Invoice ${subscription_id} not found`);
        return res.status(404).json({
          status: 'error',
          msg: 'Subscription not found',
          data: null
        });
      }
      
      console.log('📋 Invoice found:', {
        id: invoice.id,
        user_id: invoice.user_id,
        current_approval_status: invoice.approval_status,
        current_approval_notes: invoice.approval_notes || '(none)',
        type: invoice.type
      });
      
      // Update approval status
      // Note: Don't include updated_at here - Invoice.update() automatically adds it
      const updateData = {
        approval_status: action === 'approve' ? 'approved' : 'rejected',
        // When approving, clear any previous rejection notes
        // When rejecting, save the rejection notes
        approval_notes: action === 'approve' ? null : (notes || null),
        approved_at: new Date().toISOString()
      };
      
      console.log('📝 Update data:', {
        approval_status: updateData.approval_status,
        approval_notes: updateData.approval_notes || '(null - cleared on approval)',
        approved_at: updateData.approved_at,
        action: action === 'approve' ? 'Clearing rejection notes on approval' : 'Saving rejection notes'
      });
      
      await Invoice.update(subscription_id, updateData);
      
      // Verify the update was successful
      const updatedInvoice = await Invoice.findById(subscription_id);
      if (!updatedInvoice) {
        console.error(`❌ Failed to retrieve updated invoice ${subscription_id}`);
        return res.status(500).json({
          status: 'error',
          msg: 'Failed to verify invoice update',
          data: null
        });
      }
      
      console.log('✅ Invoice updated successfully', {
        subscription_id,
        approval_status: updatedInvoice.approval_status,
        approval_notes: updatedInvoice.approval_notes || '(null or empty)',
        approval_notes_type: typeof updatedInvoice.approval_notes,
        approved_at: updatedInvoice.approved_at,
        user_id: updatedInvoice.user_id
      });
      
      // Additional verification for rejections
      if (action === 'reject') {
        if (updatedInvoice.approval_status !== 'rejected') {
          console.error(`❌ CRITICAL: Invoice approval_status is not 'rejected' after update! Got: ${updatedInvoice.approval_status}`);
        }
        if (notes && !updatedInvoice.approval_notes) {
          console.error(`❌ CRITICAL: Rejection notes were provided but not saved! Provided: "${notes}", Saved: ${updatedInvoice.approval_notes}`);
        } else if (notes && updatedInvoice.approval_notes) {
          console.log(`✅ Rejection notes saved successfully: "${updatedInvoice.approval_notes}"`);
        }
      }
      
      // Invalidate user profile cache for both approve and reject actions
      // This ensures the frontend gets updated invoice data with rejection reasons
      try {
        await RedisCache.delete(RedisCache.userKey(String(invoice.user_id), 'profile'));
        await RedisCache.delete(RedisCache.userKey(String(invoice.user_id)));
        console.log(`🗑️  Invalidated profile cache for user ${invoice.user_id} after ${action}`);
      } catch (cacheErr) {
        console.error('Cache invalidation error:', cacheErr);
      }
      
      // If approved, activate the subscription and update shop
      if (action === 'approve') {
        const Shop = require('../models/Shop');
        const SubscriptionPackage = require('../models/SubscriptionPackage');
        
        // Get updated invoice with dates
        let updatedInvoice = { ...invoice, ...updateData };
        
        // Ensure from_date and to_date are set if not already
        if (!updatedInvoice.from_date || !updatedInvoice.to_date) {
          const packageData = updatedInvoice.package_id 
            ? await SubscriptionPackage.getById(updatedInvoice.package_id)
            : null;
        
          if (packageData) {
            const fromDate = updatedInvoice.from_date || new Date().toISOString().split('T')[0];
            const from = new Date(fromDate);
            let toDate = updatedInvoice.to_date;
            
            // Calculate to_date based on duration type
            if (!toDate && packageData.duration) {
              if (packageData.duration === 'month') {
                from.setMonth(from.getMonth() + 1);
              } else if (packageData.duration === 'year') {
                from.setFullYear(from.getFullYear() + 1);
              } else if (packageData.duration === 'order') {
                // Per-order subscriptions - set far future date
                from.setFullYear(from.getFullYear() + 100);
              } else {
                // Legacy: treat as days
                const durationDays = parseInt(packageData.duration) || 30;
                from.setDate(from.getDate() + durationDays);
              }
              toDate = from.toISOString().split('T')[0];
            }
            
            if (toDate) {
              await Invoice.update(subscription_id, {
                from_date: fromDate,
                to_date: toDate
              });
              updatedInvoice.to_date = toDate;
              updatedInvoice.from_date = fromDate;
            }
          }
        }
        
        // Activate shop subscription
        try {
          const allShops = await Shop.findAllByUserId(invoice.user_id);
          const shop = allShops.find(s => s.shop_type === 3 || s.shop_type === 1); // B2C or B2B
          
          if (shop && updatedInvoice.to_date) {
            const subscriptionEndsAt = new Date(updatedInvoice.to_date).toISOString();
            await Shop.update(shop.id, {
              is_subscribed: true,
              subscription_ends_at: subscriptionEndsAt,
              is_subscription_ends: false,
              subscribed_duration: invoice.duration || 'month'
            });
            console.log(`✅ Activated shop ${shop.id} subscription for user ${invoice.user_id}`);
          }
        } catch (shopUpdateErr) {
          console.error('Error activating shop subscription:', shopUpdateErr);
          // Don't fail the request if shop update fails
        }
      }
      
      // Invalidate cache to ensure fresh data
      try {
        await RedisCache.delete(RedisCache.listKey('paid_subscriptions'));
        // Also invalidate invoice table cache if the method exists
        if (typeof RedisCache.invalidateTableCache === 'function') {
          await RedisCache.invalidateTableCache('invoice');
        }
        console.log('🗑️  Invalidated subscription caches after approval update');
      } catch (err) {
        console.error('Redis cache invalidation error:', err);
      }
      
      res.json({
        status: 'success',
        msg: `Subscription ${action}d successfully`,
        data: { id: subscription_id, approval_status: updateData.approval_status }
      });
    } catch (error) {
      console.error('❌ updateSubscriptionApproval error:', error);
      console.error('   Error stack:', error.stack);
      res.status(500).json({
        status: 'error',
        msg: 'Error updating subscription approval status',
        data: null
      });
    }
  }

  /**
   * Get all pending bulk buy orders for admin panel
   */
  static async getPendingBulkBuyOrders(req, res) {
    try {
      console.log('🟢 AccountsPanelController.getPendingBulkBuyOrders called');
      
      const PendingBulkBuyOrder = require('../models/PendingBulkBuyOrder');
      const User = require('../models/User');
      const Shop = require('../models/Shop');
      const Invoice = require('../models/Invoice');
      
      // Get all pending bulk buy orders
      // Since we need all orders, we'll scan the table
      const allOrders = [];
      let lastKey = null;
      
      do {
        const { ScanCommand } = require('@aws-sdk/lib-dynamodb');
        const { getDynamoDBClient } = require('../config/dynamodb');
        const client = getDynamoDBClient();
        
        const params = {
          TableName: 'pending_bulk_buy_orders'
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
      
      console.log(`📊 Found ${allOrders.length} total pending bulk buy orders in database`);
      
      // Log all orders with their IDs and statuses for debugging
      console.log(`📊 All orders in database:`, allOrders.map(o => ({
        id: o.id,
        status: o.status || 'pending_payment',
        user_id: o.user_id,
        transaction_id: o.transaction_id,
        created_at: o.created_at
      })));
      
      // Log status breakdown for debugging
      const statusBreakdown = {};
      allOrders.forEach(order => {
        const status = order.status || 'pending_payment';
        statusBreakdown[status] = (statusBreakdown[status] || 0) + 1;
      });
      console.log(`📊 Status breakdown:`, statusBreakdown);
      
      // Return ALL orders directly from database (no filtering)
      const ordersToProcess = allOrders;
      
      // Get unique user IDs
      const userIds = [...new Set(ordersToProcess.map(o => o.user_id).filter(Boolean))];
      
      // Fetch users and shops
      let users = [];
      let shops = [];
      if (userIds.length > 0) {
        users = await User.findByIds(userIds);
        shops = await Shop.findByUserIds(userIds);
      }
      
      // Create maps for quick lookup
      const userMap = {};
      users.forEach(u => { userMap[u.id] = u; });
      
      const shopMap = {};
      shops.forEach(s => { shopMap[s.user_id] = s; });
      
      // Get payment status from invoices
      const transactionIds = ordersToProcess.map(o => o.transaction_id).filter(Boolean);
      const invoices = transactionIds.length > 0 
        ? await Invoice.findByTransactionIds(transactionIds)
        : [];
      
      const invoiceMap = {};
      invoices.forEach(inv => {
        const txId = inv.payment_moj_id || inv.payment_req_id;
        if (txId) {
          invoiceMap[txId] = inv;
        }
      });
      
      // Combine orders with user, shop, and invoice information
      const ordersWithDetails = ordersToProcess.map(order => {
        const user = order.user_id ? userMap[order.user_id] : null;
        const shop = order.user_id ? shopMap[order.user_id] : null;
        const invoice = order.transaction_id ? invoiceMap[order.transaction_id] : null;
        
        // Parse subcategories if it's a string
        let subcategories = [];
        if (order.subcategories) {
          try {
            subcategories = typeof order.subcategories === 'string' 
              ? JSON.parse(order.subcategories) 
              : order.subcategories;
          } catch (e) {
            console.error('Error parsing subcategories:', e);
          }
        }
        
        return {
          id: order.id,
          user_id: order.user_id,
          transaction_id: order.transaction_id,
          payment_amount: order.payment_amount,
          subscription_plan_id: order.subscription_plan_id,
          quantity: order.quantity,
          location: order.location,
          scrap_type: order.scrap_type,
          subcategories: subcategories,
          preferred_price: order.preferred_price,
          preferred_distance: order.preferred_distance,
          when_needed: order.when_needed,
          additional_notes: order.additional_notes,
          status: order.status,
          created_at: order.created_at,
          updated_at: order.updated_at,
          username: user ? (user.name || user.username || `User ${order.user_id}`) : `User ${order.user_id}`,
          shopname: shop ? shop.shopname : null,
          payment_status: invoice ? (invoice.approval_status || 'pending') : 'pending',
          payment_approval_notes: invoice ? invoice.approval_notes : null
        };
      });
      
      // Sort by created_at descending (newest first)
      ordersWithDetails.sort((a, b) => {
        const dateA = new Date(a.created_at || 0);
        const dateB = new Date(b.created_at || 0);
        return dateB - dateA;
      });
      
      res.json({
        status: 'success',
        msg: 'Pending bulk buy orders retrieved',
        data: ordersWithDetails,
        total: ordersWithDetails.length
      });
    } catch (error) {
      console.error('❌ getPendingBulkBuyOrders error:', error);
      console.error('   Error stack:', error.stack);
      res.status(500).json({
        status: 'error',
        msg: 'Error fetching pending bulk buy orders',
        data: []
      });
    }
  }

  /**
   * Update pending bulk buy order approval status
   * Body: { order_id, action: 'approve' | 'reject', notes?: string }
   */
  static async updatePendingBulkBuyOrderApproval(req, res) {
    try {
      const { order_id, action, notes } = req.body;
      
      if (!order_id || !action) {
        return res.status(400).json({
          status: 'error',
          msg: 'order_id and action are required',
          data: null
        });
      }
      
      if (!['approve', 'reject'].includes(action)) {
        return res.status(400).json({
          status: 'error',
          msg: 'action must be "approve" or "reject"',
          data: null
        });
      }
      
      console.log('🟢 AccountsPanelController.updatePendingBulkBuyOrderApproval called', {
        order_id,
        action,
        notes: notes || '(no notes provided)'
      });
      
      const PendingBulkBuyOrder = require('../models/PendingBulkBuyOrder');
      const Invoice = require('../models/Invoice');
      
      // Get the pending order
      const order = await PendingBulkBuyOrder.findById(order_id);
      if (!order) {
        return res.status(404).json({
          status: 'error',
          msg: 'Pending bulk buy order not found',
          data: null
        });
      }
      
      // Update the invoice approval status if transaction_id exists
      if (order.transaction_id) {
        // Find invoice by transaction ID
        const invoices = await Invoice.findByTransactionIds([order.transaction_id]);
        const invoice = invoices.length > 0 ? invoices[0] : null;
        
        if (invoice) {
          const updateData = {
            approval_status: action === 'approve' ? 'approved' : 'rejected',
            approval_notes: action === 'approve' ? null : (notes || null),
            approved_at: new Date().toISOString()
          };
          
          await Invoice.update(invoice.id, updateData);
          console.log('✅ Invoice updated:', invoice.id, updateData.approval_status);
        } else {
          console.warn('⚠️ Invoice not found for transaction_id:', order.transaction_id);
        }
      }
      
      // Update pending order status
      const newStatus = action === 'approve' ? 'payment_approved' : 'pending_payment';
      await PendingBulkBuyOrder.updateStatus(order_id, newStatus);
      
      console.log('✅ Pending bulk buy order updated:', order_id, newStatus);
      
      // Note: We no longer automatically create bulk purchase requests when approving payment
      // The admin only approves the payment status. The user will need to manually create 
      // the bulk purchase request after payment is approved.
      if (action === 'approve') {
        console.log('✅ Payment approved for pending bulk buy order. User can now create bulk purchase request manually.');
      }
      
      res.json({
        status: 'success',
        msg: `Order ${action === 'approve' ? 'approved' : 'rejected'} successfully`,
        data: {
          order_id,
          status: newStatus,
          action
        }
      });
    } catch (error) {
      console.error('❌ updatePendingBulkBuyOrderApproval error:', error);
      console.error('   Error stack:', error.stack);
      res.status(500).json({
        status: 'error',
        msg: 'Error updating pending bulk buy order approval',
        data: null
      });
    }
  }
}

module.exports = AccountsPanelController;

