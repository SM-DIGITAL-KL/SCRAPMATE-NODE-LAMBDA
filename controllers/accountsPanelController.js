const Package = require('../models/Package');
const Invoice = require('../models/Invoice');
const Address = require('../models/Address');
const RedisCache = require('../utils/redisCache');

class AccountsPanelController {
  static normalizeNumericId(value) {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'number') return Number.isNaN(value) ? null : value;
    const parsed = parseInt(String(value), 10);
    return Number.isNaN(parsed) ? null : parsed;
  }

  static getEnforcedZoneFromRequest(req) {
    const email = String(
      (req?.user && req.user.email) ||
      req?.headers?.['x-user-email'] ||
      ''
    ).trim().toLowerCase();

    const match = email.match(/^zone(\d{1,2})@scrapmate\.co\.in$/i);
    if (!match) return '';

    const zoneNumber = parseInt(match[1], 10);
    if (Number.isNaN(zoneNumber) || zoneNumber < 1 || zoneNumber > 48) return '';

    return `zone${zoneNumber}`;
  }

  static async getZoneUserScope(req) {
    const enforcedZone = AccountsPanelController.getEnforcedZoneFromRequest(req);
    if (!enforcedZone) return null;

    const zoneUserIds = await Address.findCustomerIdsByZone(enforcedZone);
    const zoneUserSet = new Set(
      (zoneUserIds || [])
        .map((id) => AccountsPanelController.normalizeNumericId(id))
        .filter((id) => id !== null)
    );

    return {
      enforcedZone: Address.normalizeZone(enforcedZone),
      zoneUserSet
    };
  }

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
      const zoneScope = await AccountsPanelController.getZoneUserScope(req);
      const zoneKey = zoneScope ? zoneScope.enforcedZone : 'ALL';
      
      // Check Redis cache first
      const cacheKey = RedisCache.listKey('subscribers_list', { zone: zoneKey });
      try {
        const cached = await RedisCache.get(cacheKey);
        if (cached) {
          console.log('⚡ Subscribers list cache hit');
          return res.json(cached);
        }
      } catch (err) {
        console.error('Redis get error:', err);
      }
      
      // Use Invoice model to get all invoices, then join with Shop and User models
      const Shop = require('../models/Shop');
      const User = require('../models/User');
      let allInvoices = await Invoice.getAll();
      if (zoneScope) {
        allInvoices = allInvoices.filter((invoice) => {
          const invoiceUserId = AccountsPanelController.normalizeNumericId(invoice.user_id);
          return invoiceUserId !== null && zoneScope.zoneUserSet.has(invoiceUserId);
        });
        console.log(`🧭 viewSubscribersList scope: ${zoneScope.enforcedZone} (${allInvoices.length} invoices)`);
      }
      
      // Get unique user_ids and fetch shops and users
      const userIds = [...new Set(allInvoices.map(i => i.user_id).filter(Boolean))];
      const shops = await Shop.findByUserIds(userIds);
      const shopMap = {};
      shops.forEach(s => { shopMap[s.user_id] = s; });
      
      // Fetch users for user names
      const userMap = {};
      for (const userId of userIds) {
        try {
          const user = await User.findById(userId);
          if (user) {
            userMap[userId] = user;
          }
        } catch (err) {
          console.warn(`⚠️  Could not fetch user ${userId}:`, err.message);
        }
      }
      
      // Combine invoices with shop names and user names
      const invoices = allInvoices.map(invoice => {
        const user = invoice.user_id ? userMap[invoice.user_id] : null;
        const shop = invoice.user_id && shopMap[invoice.user_id] ? shopMap[invoice.user_id] : null;
        return {
          ...invoice,
          shopname: shop ? shop.shopname : null,
          username: user ? user.name : null,
          user_type: user ? user.user_type : null,
          mob_num: user ? user.mob_num : null
        };
      });
      
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
      const zoneScope = await AccountsPanelController.getZoneUserScope(req);
      const zoneKey = zoneScope ? zoneScope.enforcedZone : 'ALL';
      
      // Check Redis cache first (but allow bypass via query param for debugging)
      const cacheKey = RedisCache.listKey('paid_subscriptions', { zone: zoneKey });
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
        // Clear the cache to ensure fresh data
        try {
          await RedisCache.delete(cacheKey);
          console.log('🗑️  Cache cleared for paid_subscriptions');
        } catch (err) {
          console.error('Error clearing cache:', err);
        }
      }
      
      // Get all invoices with type='Paid'
      const allInvoices = await Invoice.getAll();
      console.log(`📊 Total invoices in database: ${allInvoices.length}`);
      
      let paidInvoices = allInvoices.filter(inv => inv.type === 'Paid' || inv.type === 'paid');
      if (zoneScope) {
        paidInvoices = paidInvoices.filter((invoice) => {
          const invoiceUserId = AccountsPanelController.normalizeNumericId(invoice.user_id);
          return invoiceUserId !== null && zoneScope.zoneUserSet.has(invoiceUserId);
        });
        console.log(`🧭 getPaidSubscriptions scope: ${zoneScope.enforcedZone} (${paidInvoices.length} invoices)`);
      }
      
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
      // Use SAME approach as viewSubscribersList which works correctly
      const User = require('../models/User');
      const Shop = require('../models/Shop');
      
      const userIds = [...new Set(paidInvoices.map(i => i.user_id).filter(Boolean))];
      
      // Fetch shops using SAME method as viewSubscribersList
      const shops = await Shop.findByUserIds(userIds);
      const shopMap = {};
      shops.forEach(s => { shopMap[String(s.user_id)] = s; });
      
      // Fetch users for user names using SAME method as viewSubscribersList
      const userMap = {};
      for (const userId of userIds) {
        try {
          const user = await User.findById(userId);
          if (user) {
            userMap[String(userId)] = user;
          }
        } catch (err) {
          console.warn(`⚠️  Could not fetch user ${userId}:`, err.message);
        }
      }
      
      console.log(`📊 getPaidSubscriptions: ${userIds.length} user IDs, ${shops.length} shops found, ${Object.keys(userMap).length} users found`);
      
      // Combine invoices with user and shop information
      // Use SAME approach as viewSubscribersList but normalize user_id to STRING
      const subscriptions = paidInvoices.map(invoice => {
        const userIdStr = invoice.user_id ? String(invoice.user_id) : null;
        const user = userIdStr ? userMap[userIdStr] : null;
        const shop = userIdStr && shopMap[userIdStr] ? shopMap[userIdStr] : null;
        
        // Determine user type based on user mode or shop type
        let userType = 'Unknown';
        if (user) {
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
        
        // If still unknown, try to infer from package ID pattern
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
          username: user ? user.name : null,
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
      
      // Cache for 1 minute only (very short cache since names and approval status change frequently)
      try {
        await RedisCache.set(cacheKey, subscriptions, 60);
        console.log('💾 Paid subscriptions cached for 1 minute');
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
        const User = require('../models/User');
        
        // Get updated invoice with dates
        let updatedInvoice = { ...invoice, ...updateData };
        let approvedPackageData = null;
        const marketplacePackageFallbackById = String(updatedInvoice.package_id || '').toLowerCase();
        
        // Ensure from_date and to_date are set if not already
        if (!updatedInvoice.from_date || !updatedInvoice.to_date) {
          const packageData = updatedInvoice.package_id
            ? await SubscriptionPackage.getById(updatedInvoice.package_id)
            : null;
          approvedPackageData = packageData;
        
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

        if (!approvedPackageData && updatedInvoice.package_id) {
          approvedPackageData = await SubscriptionPackage.getById(updatedInvoice.package_id);
        }
        const approvedPackageUserType = String(approvedPackageData?.userType || '').trim().toUpperCase();
        const isMarketplacePackage =
          approvedPackageUserType === 'M' ||
          marketplacePackageFallbackById.includes('marketplace') ||
          marketplacePackageFallbackById.includes('market_place');
        
        if (isMarketplacePackage) {
          // Marketplace subscription is independent from B2C/B2B shop subscriptions.
          try {
            await User.updateProfile(invoice.user_id, {
              isMarketPlaceSubscribed: true
            });
            console.log(`✅ Activated marketplace subscription for user ${invoice.user_id}`);
          } catch (marketplaceUpdateErr) {
            console.error('Error activating marketplace subscription:', marketplaceUpdateErr);
          }
        } else {
          // Activate B2B/B2C shop subscription
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
          user_type: user ? (user.user_type || null) : null,
          user_email: user ? (user.email || null) : null,
          user_profile_image: user ? (user.profile_image || null) : null,
          user_phone: user ? (user.mob_num || null) : null,
          shop_id: shop ? (shop.id || null) : null,
          shop_documents: shop ? {
            aadhar_card: shop.aadhar_card || null,
            driving_license: shop.driving_license || null,
            business_license_url: shop.business_license_url || null,
            gst_certificate_url: shop.gst_certificate_url || null,
            address_proof_url: shop.address_proof_url || null,
            kyc_owner_url: shop.kyc_owner_url || null
          } : {},
          shopname: shop ? shop.shopname : null,
          payment_status: invoice ? (invoice.approval_status || 'pending') : 'pending',
          payment_approval_notes: invoice ? invoice.approval_notes : null,
          review_status: order.review_status || 'pending',
          review_reason: order.review_reason || null,
          reviewed_at: order.reviewed_at || null
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
      console.log('🟢 AccountsPanelController.updatePendingBulkBuyOrderApproval called');
      console.log('   Request body:', JSON.stringify(req.body, null, 2));
      console.log('   Request params:', JSON.stringify(req.params, null, 2));
      console.log('   Request query:', JSON.stringify(req.query, null, 2));
      
      const { order_id, action, notes } = req.body;
      
      if (!order_id || !action) {
        console.error('❌ Missing required parameters:', { order_id, action });
        return res.status(400).json({
          status: 'error',
          msg: 'order_id and action are required',
          data: null
        });
      }
      
      if (!['approve', 'reject'].includes(action)) {
        console.error('❌ Invalid action:', action);
        return res.status(400).json({
          status: 'error',
          msg: 'action must be "approve" or "reject"',
          data: null
        });
      }
      
      console.log('🟢 Processing approval request:', {
        order_id,
        action,
        notes: notes || '(no notes provided)'
      });
      
      const PendingBulkBuyOrder = require('../models/PendingBulkBuyOrder');
      const Invoice = require('../models/Invoice');
      
      // Get the pending order
      console.log('🔍 Fetching pending order:', order_id);
      const order = await PendingBulkBuyOrder.findById(order_id);
      if (!order) {
        console.error('❌ Pending bulk buy order not found:', order_id);
        return res.status(404).json({
          status: 'error',
          msg: 'Pending bulk buy order not found',
          data: null
        });
      }
      
      console.log('📋 Found order:', {
        id: order.id,
        current_status: order.status,
        transaction_id: order.transaction_id,
        user_id: order.user_id
      });
      
      // Update the invoice approval status if transaction_id exists
      if (order.transaction_id) {
        console.log('🔍 Looking for invoice with transaction_id:', order.transaction_id);
        // Find invoice by transaction ID
        const invoices = await Invoice.findByTransactionIds([order.transaction_id]);
        const invoice = invoices.length > 0 ? invoices[0] : null;
        
        if (invoice) {
          const updateData = {
            approval_status: action === 'approve' ? 'approved' : 'rejected',
            approval_notes: action === 'approve' ? null : (notes || null),
            approved_at: new Date().toISOString()
          };
          
          console.log('📝 Updating invoice:', invoice.id, 'with data:', updateData);
          await Invoice.update(invoice.id, updateData);
          console.log('✅ Invoice updated successfully:', invoice.id, updateData.approval_status);
        } else {
          console.warn('⚠️ Invoice not found for transaction_id:', order.transaction_id);
        }
      } else {
        console.log('ℹ️ No transaction_id found in order, skipping invoice update');
      }
      
      // Update pending order status
      const newStatus = action === 'approve' ? 'payment_approved' : 'pending_payment';
      console.log('📝 Updating order status from', order.status, 'to', newStatus);
      
      const updatedOrder = await PendingBulkBuyOrder.updateStatus(order_id, newStatus);
      
      console.log('✅ Pending bulk buy order updated successfully:', {
        order_id,
        old_status: order.status,
        new_status: updatedOrder?.status || newStatus,
        updated_at: updatedOrder?.updated_at
      });
      
      // Verify the update by fetching the order again
      const verifyOrder = await PendingBulkBuyOrder.findById(order_id);
      console.log('🔍 Verification - Order status after update:', {
        order_id,
        status: verifyOrder?.status,
        updated_at: verifyOrder?.updated_at
      });
      
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
          status: verifyOrder?.status || newStatus,
          action,
          verified: true
        }
      });
    } catch (error) {
      console.error('❌ updatePendingBulkBuyOrderApproval error:', error);
      console.error('   Error name:', error.name);
      console.error('   Error message:', error.message);
      console.error('   Error stack:', error.stack);
      res.status(500).json({
        status: 'error',
        msg: 'Error updating pending bulk buy order approval: ' + (error.message || 'Unknown error'),
        data: null
      });
    }
  }

  /**
   * Get pending bulk sell orders for admin panel
   * GET /accounts/pending-bulk-sell-orders
   */
  static async getPendingBulkSellOrders(req, res) {
    try {
      console.log('🟢 AccountsPanelController.getPendingBulkSellOrders called');
      
      const BulkSellRequest = require('../models/BulkSellRequest');
      const User = require('../models/User');
      const Shop = require('../models/Shop');
      
      // Get all bulk sell requests using the model's findBySellerId with no filter (get all)
      const { ScanCommand } = require('@aws-sdk/lib-dynamodb');
      const { getDynamoDBClient } = require('../config/dynamodb');
      const client = getDynamoDBClient();
      
      const allRequests = [];
      let lastKey = null;
      
      do {
        const params = {
          TableName: 'bulk_sell_requests'
        };
        
        if (lastKey) {
          params.ExclusiveStartKey = lastKey;
        }
        
        const command = new ScanCommand(params);
        const response = await client.send(command);
        
        if (response.Items) {
          allRequests.push(...response.Items);
        }
        
        lastKey = response.LastEvaluatedKey;
      } while (lastKey);
      
      console.log(`📊 Found ${allRequests.length} total bulk sell requests in database`);
      
      // Get unique seller IDs
      const sellerIds = [...new Set(allRequests.map(r => r.seller_id).filter(Boolean))];
      
      // Fetch users and shops
      let users = [];
      let shops = [];
      if (sellerIds.length > 0) {
        users = await User.findByIds(sellerIds);
        shops = await Shop.findByUserIds(sellerIds);
      }
      
      // Create maps for quick lookup
      const userMap = {};
      users.forEach(u => { userMap[u.id] = u; });
      
      const shopMap = {};
      shops.forEach(s => { shopMap[s.user_id] = s; });
      
      // Combine requests with user and shop information
      const requestsWithDetails = allRequests.map(request => {
        const user = request.seller_id ? userMap[request.seller_id] : null;
        const shop = request.seller_id ? shopMap[request.seller_id] : null;
        
        // Parse subcategories if it's a string
        let subcategories = [];
        if (request.subcategories) {
          try {
            subcategories = typeof request.subcategories === 'string' 
              ? JSON.parse(request.subcategories) 
              : request.subcategories;
          } catch (e) {
            console.error('Error parsing subcategories:', e);
          }
        }
        
        // Parse accepted buyers if it's a string
        let acceptedBuyers = [];
        if (request.accepted_buyers) {
          try {
            acceptedBuyers = typeof request.accepted_buyers === 'string'
              ? JSON.parse(request.accepted_buyers)
              : request.accepted_buyers;
          } catch (e) {
            console.error('Error parsing accepted_buyers:', e);
          }
        }
        
        // Parse documents if it's a string
        let documents = [];
        if (request.documents) {
          try {
            documents = typeof request.documents === 'string'
              ? JSON.parse(request.documents)
              : request.documents;
          } catch (e) {
            console.error('Error parsing documents:', e);
          }
        }
        
        return {
          id: request.id,
          seller_id: request.seller_id,
          seller_name: request.seller_name || (user ? (user.name || user.username) : `Seller ${request.seller_id}`),
          quantity: request.quantity,
          asking_price: request.asking_price,
          scrap_type: request.scrap_type,
          subcategories: subcategories,
          location: request.location,
          preferred_distance: request.preferred_distance,
          when_available: request.when_available,
          additional_notes: request.additional_notes,
          status: request.status || 'active',
          accepted_buyers: acceptedBuyers,
          total_committed_quantity: request.total_committed_quantity || 0,
          documents: documents,
          created_at: request.created_at,
          updated_at: request.updated_at,
          username: user ? (user.name || user.username || `User ${request.seller_id}`) : `User ${request.seller_id}`,
          user_type: user ? (user.user_type || null) : null,
          user_email: user ? (user.email || null) : null,
          user_profile_image: user ? (user.profile_image || null) : null,
          shopname: shop ? shop.shopname : null,
          user_phone: user ? user.mob_num : null,
          shop_id: shop ? (shop.id || null) : null,
          shop_documents: shop ? {
            aadhar_card: shop.aadhar_card || null,
            driving_license: shop.driving_license || null,
            business_license_url: shop.business_license_url || null,
            gst_certificate_url: shop.gst_certificate_url || null,
            address_proof_url: shop.address_proof_url || null,
            kyc_owner_url: shop.kyc_owner_url || null
          } : {},
          // Payment fields
          payment_status: request.payment_status || 'pending',
          payment_amount: request.payment_amount,
          payment_moj_id: request.payment_moj_id,
          payment_req_id: request.payment_req_id,
          invoice_id: request.invoice_id,
          order_value: request.order_value,
          review_status: request.review_status || 'pending',
          review_reason: request.review_reason || null,
          reviewed_at: request.reviewed_at || null
        };
      });
      
      // Sort by created_at descending (newest first)
      requestsWithDetails.sort((a, b) => {
        const dateA = new Date(a.created_at || 0);
        const dateB = new Date(b.created_at || 0);
        return dateB - dateA;
      });
      
      res.json({
        status: 'success',
        msg: 'Bulk sell orders retrieved',
        data: requestsWithDetails,
        total: requestsWithDetails.length
      });
    } catch (error) {
      console.error('❌ getPendingBulkSellOrders error:', error);
      console.error('   Error stack:', error.stack);
      res.status(500).json({
        status: 'error',
        msg: 'Error fetching bulk sell orders: ' + (error.message || 'Unknown error'),
        data: []
      });
    }
  }

  /**
   * Update marketplace post review status.
   * Body: { post_id, post_type: 'sell'|'buy', action: 'approve'|'reject'|'pending', reason?: string }
   */
  static async updateMarketplacePostReview(req, res) {
    try {
      const { post_id, post_type, action, reason } = req.body || {};

      if (!post_id || !post_type || !action) {
        return res.status(400).json({
          status: 'error',
          msg: 'post_id, post_type and action are required',
          data: null
        });
      }

      const normalizedType = String(post_type).trim().toLowerCase();
      const normalizedAction = String(action).trim().toLowerCase();
      if (!['sell', 'buy'].includes(normalizedType)) {
        return res.status(400).json({
          status: 'error',
          msg: 'post_type must be sell or buy',
          data: null
        });
      }
      if (!['approve', 'reject', 'pending'].includes(normalizedAction)) {
        return res.status(400).json({
          status: 'error',
          msg: 'action must be approve, reject or pending',
          data: null
        });
      }
      if (normalizedAction === 'reject' && (!reason || !String(reason).trim())) {
        return res.status(400).json({
          status: 'error',
          msg: 'reject reason is required',
          data: null
        });
      }

      const { getDynamoDBClient } = require('../config/dynamodb');
      const { UpdateCommand } = require('@aws-sdk/lib-dynamodb');
      const client = getDynamoDBClient();
      const now = new Date().toISOString();
      const tableName = normalizedType === 'sell' ? 'bulk_sell_requests' : 'bulk_scrap_requests';
      const postIdNum = typeof post_id === 'string' && !isNaN(post_id) ? parseInt(post_id, 10) : post_id;
      const mappedReviewStatus = normalizedAction === 'approve'
        ? 'approved'
        : normalizedAction === 'reject'
          ? 'rejected'
          : 'pending';
      const mappedPostStatus = normalizedAction === 'approve'
        ? 'active'
        : normalizedAction === 'reject'
          ? 'cancelled'
          : 'pending';

      const command = new UpdateCommand({
        TableName: tableName,
        Key: { id: postIdNum },
        ConditionExpression: 'attribute_exists(id)',
        UpdateExpression: 'SET review_status = :reviewStatus, review_reason = :reviewReason, reviewed_at = :reviewedAt, #status = :postStatus, status_created_at = :statusCreatedAt, updated_at = :updatedAt',
        ExpressionAttributeNames: {
          '#status': 'status'
        },
        ExpressionAttributeValues: {
          ':reviewStatus': mappedReviewStatus,
          ':reviewReason': normalizedAction === 'reject' ? String(reason).trim() : null,
          ':postStatus': mappedPostStatus,
          ':statusCreatedAt': `${mappedPostStatus}#${now}`,
          ':reviewedAt': now,
          ':updatedAt': now
        },
        ReturnValues: 'ALL_NEW'
      });

      const response = await client.send(command);
      return res.json({
        status: 'success',
        msg: 'Marketplace post review updated successfully',
        data: response.Attributes || null
      });
    } catch (error) {
      if (error && error.name === 'ConditionalCheckFailedException') {
        return res.status(404).json({
          status: 'error',
          msg: 'Marketplace post not found',
          data: null
        });
      }
      console.error('❌ updateMarketplacePostReview error:', error);
      return res.status(500).json({
        status: 'error',
        msg: 'Error updating marketplace review status',
        data: null
      });
    }
  }

  /**
   * Fetch Kerala scrap tenders (page 0, size 10), save in DynamoDB, and return JSON.
   * GET /accounts/tenders-fetch-kerala-scraps
   */
  static async fetchKeralaScrapTenders(req, res) {
    try {
      const axios = require('axios');
      const crypto = require('crypto');
      const { getDynamoDBClient } = require('../config/dynamodb');
      const { PutCommand, GetCommand } = require('@aws-sdk/lib-dynamodb');
      const { getTableName } = require('../utils/dynamodbTableNames');
      const { uploadBufferToS3 } = require('../utils/s3Upload');

      const sourceListUrl = 'https://bidassist.com/all-tenders/active?filter=KEYWORD:scrap&filter=CATEGORY:Scraps&filter=LOCATION_STRING:Kerala&sort=RELEVANCE:DESC&pageNumber=0&pageSize=10&tenderType=ACTIVE&tenderEntity=TENDER_LISTING&year=2026&removeUnavailableTenderAmountCards=false&removeUnavailableEmdCards=false';
      const sourceCandidates = [
        sourceListUrl,
        'https://bidassist.com/all-tenders/active?filter=CATEGORY:Scraps&filter=LOCATION_STRING:Kerala&sort=RELEVANCE:DESC&pageNumber=0&pageSize=10&tenderType=ACTIVE&tenderEntity=TENDER_LISTING&year=2026&removeUnavailableTenderAmountCards=false&removeUnavailableEmdCards=false',
        'https://bidassist.com/all-tenders/active/tender-page-5?filter=KEYWORD:scrap&filter=CATEGORY:Scraps&sort=RELEVANCE:DESC&pageNumber=0&pageSize=10&tenderType=ACTIVE&tenderEntity=TENDER_LISTING&year=2026&removeUnavailableTenderAmountCards=false&removeUnavailableEmdCards=false'
      ];
      const client = getDynamoDBClient();
      const tendersTable = getTableName('scraped_tenders');
      const docsTable = getTableName('scraped_tender_documents');
      const now = new Date().toISOString();

      const looksLikeTenderList = (arr) => {
        if (!Array.isArray(arr) || arr.length === 0 || typeof arr[0] !== 'object') return false;
        const first = arr[0] || {};
        const known = ['title', 'tender_title', 'tenderTitle', 'reference_no', 'referenceNo', 'tenderNo', 'authority', 'organisation', 'organization', 'submission_end_date', 'closing_date', 'closingDate'];
        return known.some((k) => Object.prototype.hasOwnProperty.call(first, k));
      };

      const findTenderItemsInTree = (node) => {
        if (!node || typeof node !== 'object') return [];
        const directKeys = ['tenders', 'tenderList', 'tender_listing', 'results', 'items', 'data'];
        for (const key of directKeys) {
          if (Array.isArray(node[key]) && looksLikeTenderList(node[key])) return node[key];
        }
        for (const value of Object.values(node)) {
          if (value && typeof value === 'object') {
            if (Array.isArray(value) && looksLikeTenderList(value)) return value;
            const nested = findTenderItemsInTree(value);
            if (nested.length > 0) return nested;
          }
        }
        return [];
      };

      const normalizeTender = (item, serial) => {
        const pick = (...keys) => {
          for (const k of keys) {
            const v = item[k];
            if (v !== undefined && v !== null && v !== '') return String(v);
          }
          return '';
        };
        return {
          sl_no: serial,
          title: pick('title', 'tender_title', 'tenderTitle', 'name'),
          reference_no: pick('reference_no', 'referenceNo', 'tenderNo', 'tender_no'),
          authority: pick('authority', 'organisation', 'organization', 'department'),
          location: pick('location', 'city', 'state'),
          closing_date: pick('submission_end_date', 'closing_date', 'closingDate', 'bid_end_date'),
          closing_label: pick('closing_label', 'closing_type'),
          emd: pick('emd_amount', 'emd', 'earnest_money'),
          tender_value: pick('tender_value', 'value', 'estimate_value'),
          type: pick('type', 'tender_type', 'procurement_type'),
          category: pick('category', 'tender_category'),
          platform: pick('platform', 'source'),
          description: pick('description', 'brief', 'tender_description'),
          url: pick('url', 'detail_url', 'link'),
          raw: item
        };
      };

      const parseJinaMarkdownTenders = (markdown) => {
        const lines = String(markdown || '').split(/\r\n|\r|\n/).map((l) => l.trim());
        const tenders = [];
        let current = null;
        let sl = 1;

        const pushCurrent = () => {
          if (!current) return;
          if (current.title) {
            current.sl_no = sl++;
            tenders.push(current);
          }
          current = null;
        };

        for (const line of lines) {
          if (!line || line.startsWith('![Image')) continue;

          const m = line.match(/^\[(.+?)\]\((https?:\/\/[^\s)]+)(?:\s+"([^"]*)")?\)$/);
          if (m) {
            const title = String(m[1] || '').trim();
            const url = String(m[2] || '').trim();
            const hint = String(m[3] || '').trim();
            if (url.includes('/detail-') && (title.includes('Tender') || title.toLowerCase().includes('kerala'))) {
              pushCurrent();
              current = {
                sl_no: null,
                title,
                reference_no: hint || '',
                authority: title.replace(/\s*-\s*.*Tender$/i, '').trim(),
                location: '',
                closing_date: '',
                closing_label: '',
                emd: '',
                tender_value: '',
                type: '',
                category: '',
                platform: '',
                description: '',
                url,
                raw: { hint }
              };
              continue;
            }
          }

          if (!current) continue;
          if (['Auction', 'Goods', 'Works', 'Services'].includes(line) && !current.type) {
            current.type = line;
            continue;
          }
          if (['MSTC', 'Eprocure', 'GeM', 'CPPP'].includes(line) && !current.platform) {
            current.platform = line;
            continue;
          }
          if (/^Description:/i.test(line)) {
            current.description = line.replace(/^Description:/i, '').trim();
            continue;
          }
          const closeM = line.match(/^(Closing Soon|Closing Date)\s+(.+)$/i);
          if (closeM) {
            current.closing_label = closeM[1];
            current.closing_date = closeM[2].trim();
            continue;
          }
          const amountM = line.match(/^Tender Amount\s+(.+)$/i);
          if (amountM) {
            current.tender_value = amountM[1].trim();
            continue;
          }
          if (line.startsWith('[')) {
            continue;
          }
          if (!current.location && (line.includes('Kerala') || line === 'India' || line.includes(', '))) {
            current.location = line;
          }
        }

        pushCurrent();
        return tenders;
      };

      const parseRawTenderText = (rawText) => {
        const lines = String(rawText || '')
          .split(/\r\n|\r|\n/)
          .map((l) => l.trim())
          .filter(Boolean);
        const tendersRaw = [];
        let current = null;
        let sl = 1;

        const skipSet = new Set([
          'Indian Tenders', 'Tender Results', 'Global Tenders', 'Global Tender Results',
          'Saved FiltersKeywordAuthorityCategory (1)State (1)CityTender AmountMore Filters',
          'Home/Indian Tenders/Active Tenders', 'Reset All', 'Scraps', 'Category', 'Kerala',
          'State', 'Scraps Tenders in Kerala', 'Active(243)', 'Archived', 'Followed', 'search',
          'Did not find the tender you are looking for?', 'location', 'Tender Amount'
        ]);

        const pushCurrent = () => {
          if (!current) return;
          if (current.title) {
            current.sl_no = sl++;
            tendersRaw.push(current);
          }
          current = null;
        };

        for (const line of lines) {
          if (skipSet.has(line)) continue;

          if (/Tender\s*-\s*Kerala Tender$/i.test(line)) {
            pushCurrent();
            current = {
              title: line,
              authority: line.replace(/\s*Tender\s*-\s*Kerala Tender$/i, '').trim(),
              type: '',
              category: 'Scraps',
              platform: '',
              location: '',
              description: '',
              closing_label: '',
              closing_date: '',
              tender_amount: 'Refer Documents',
              url: ''
            };
            continue;
          }

          if (!current) continue;
          if (['Auction', 'Goods', 'Works', 'Services'].includes(line) && !current.type) {
            current.type = line;
            continue;
          }
          if (['MSTC', 'Eprocure', 'GeM', 'CPPP'].includes(line) && !current.platform) {
            current.platform = line;
            continue;
          }
          if (line.startsWith('Description:')) {
            current.description = line.replace(/^Description:\s*/i, '').trim();
            continue;
          }
          const closeM = line.match(/^(Closing Soon|Closing Date)\s+(.+)$/i);
          if (closeM) {
            current.closing_label = closeM[1];
            current.closing_date = closeM[2].trim();
            continue;
          }
          if (!current.location && /,\s*Kerala$/i.test(line)) {
            current.location = line;
            continue;
          }
          if ((!current.tender_amount || current.tender_amount === 'Refer Documents') && (line === 'Refer Documents' || line.startsWith('₹') || line.startsWith('INR '))) {
            current.tender_amount = line;
          }
        }

        pushCurrent();
        return tendersRaw;
      };

      const parseLooseTenderCards = (rawText) => {
        const lines = String(rawText || '')
          .split(/\r\n|\r|\n/)
          .map((l) => l.trim())
          .filter(Boolean);
        const out = [];
        let current = null;

        const push = () => {
          if (!current) return;
          if (String(current.title || '').trim() !== '') out.push(current);
          current = null;
        };

        for (const line of lines) {
          const linkM = line.match(/^\[(.+?)\]\((https?:\/\/[^\s)]+)\)/);
          if (linkM && /tender/i.test(linkM[1])) {
            push();
            current = {
              title: String(linkM[1] || '').trim(),
              authority: String(linkM[1] || '').replace(/\s*-\s*.*Tender$/i, '').trim(),
              type: '',
              category: 'Scraps',
              platform: '',
              location: '',
              description: '',
              closing_label: '',
              closing_date: '',
              tender_amount: 'Refer Documents',
              url: String(linkM[2] || '').trim()
            };
            continue;
          }

          if (!current && /Tender/i.test(line) && /-\s*.*Tender/i.test(line)) {
            push();
            current = {
              title: line,
              authority: line.replace(/\s*-\s*.*Tender$/i, '').trim(),
              type: '',
              category: 'Scraps',
              platform: '',
              location: '',
              description: '',
              closing_label: '',
              closing_date: '',
              tender_amount: 'Refer Documents',
              url: ''
            };
            continue;
          }

          if (!current) continue;
          if (['Auction', 'Goods', 'Works', 'Services'].includes(line) && !current.type) {
            current.type = line;
            continue;
          }
          if (['MSTC', 'Eprocure', 'GeM', 'CPPP'].includes(line) && !current.platform) {
            current.platform = line;
            continue;
          }
          if (!current.location && /,\s*[A-Za-z ]+$/.test(line)) {
            current.location = line;
            continue;
          }
          const closeM = line.match(/^(Closing Soon|Closing Date)\s+(.+)$/i);
          if (closeM) {
            current.closing_label = closeM[1];
            current.closing_date = closeM[2].trim();
            continue;
          }
          if (line.startsWith('Description:') && !current.description) {
            current.description = line.replace(/^Description:\s*/i, '').trim();
            continue;
          }
          if ((line === 'Refer Documents' || line.startsWith('₹') || line.startsWith('INR ')) && (!current.tender_amount || current.tender_amount === 'Refer Documents')) {
            current.tender_amount = line;
          }
        }
        push();
        return out;
      };

      const parseTenderDetailMarkdown = (markdown, base) => {
        const detail = { ...base, documents: [] };
        const text = String(markdown || '');

        const withMatch = (regex) => {
          const m = text.match(regex);
          return m && m[1] ? String(m[1]).trim() : '';
        };

        const openDate = withMatch(/Opening Date\s+([0-9]{1,2}\s+[A-Za-z]{3}\s+[0-9]{4})/i);
        if (openDate) detail.opening_date = openDate;

        const closeM = text.match(/(Closing Soon|Closing Date)\s+([0-9]{1,2}\s+[A-Za-z]{3}\s+[0-9]{4})/i);
        if (closeM) {
          detail.closing_label = closeM[1].trim();
          detail.closing_date = closeM[2].trim();
        }

        const amount = withMatch(/Tender Amount\s+([^\n\r]+)/i);
        if (amount) detail.tender_amount = amount;

        const emd = withMatch(/###\s*EMD[\s\S]*?\n([^\n\r]+)/i);
        if (emd) detail.emd = emd;

        const tenderId = withMatch(/###\s*Tender Id\s*\n+([^\n\r]+)/i);
        if (tenderId) detail.tender_id = tenderId;

        const tenderNo = withMatch(/###\s*Tender No\s*\n+([^\n\r]+)/i);
        if (tenderNo) detail.tender_no = tenderNo;

        const tenderAuthority = withMatch(/###\s*Tender Authority[\s\S]*?\n+([^\n\r]+)/i);
        if (tenderAuthority) detail.tender_authority = tenderAuthority.replace(/<[^>]*>/g, '').trim();

        const purchaserAddress = withMatch(/###\s*Purchaser Address\s*\n+([^\n\r]+)/i);
        if (purchaserAddress) detail.purchaser_address = purchaserAddress;

        const phoneMatch = text.match(/(?:\+91[\s-]?)?[6-9]\d{9}/);
        if (phoneMatch && phoneMatch[0]) {
          detail.phone_number = phoneMatch[0].replace(/\s|-/g, '');
        }

        const websiteM = text.match(/###\s*Website[\s\S]*?\((https?:\/\/[^\s)]+)\)/i);
        if (websiteM && websiteM[1]) detail.website = websiteM[1].trim();

        const description = withMatch(/###\s*Description\s*[\s\S]*?\n([^\n\r]+)/i);
        if (description && !description.toLowerCase().includes('unlock the tender details')) {
          detail.description = description;
        }

        const docsBlockM = text.match(/Documents([\s\S]*?)Report Missing Document/i);
        if (docsBlockM && docsBlockM[1]) {
          const block = docsBlockM[1];
          const linkRegex = /\[(.*?)\]\((https?:\/\/[^\s)]+)(?:\s+"[^"]*")?\)/g;
          let lm = linkRegex.exec(block);
          while (lm) {
            const labelRaw = String(lm[1] || '').trim();
            const url = String(lm[2] || '').trim();
            if (labelRaw && !labelRaw.toLowerCase().includes('download all')) {
              let fileName = labelRaw;
              let fileSize = '';
              const sz = labelRaw.match(/\b([0-9]+(?:\.[0-9]+)?\s*(?:kB|MB|GB))\b/i);
              if (sz) fileSize = sz[1];
              const fn = labelRaw.match(/([A-Za-z0-9_\- .]+\.(?:pdf|docx?|xlsx?|zip|html))/i);
              if (fn) fileName = fn[1];
              detail.documents.push({
                doc_label: labelRaw,
                file_name: fileName,
                file_size: fileSize,
                doc_url: url
              });
            }
            lm = linkRegex.exec(block);
          }
        }

        return detail;
      };

      const fetchViaJina = async (url) => {
        const jinaUrl = `https://r.jina.ai/http://${String(url).replace(/^https?:\/\//, '')}`;
        const r = await axios.get(jinaUrl, {
          timeout: 12000,
          headers: {
            Accept: 'text/plain,text/markdown,*/*',
            'User-Agent': 'Mozilla/5.0 (compatible; ScrapmateAdmin/1.0)'
          }
        });
        return String(r?.data || '');
      };

      const uniqueByKey = (arr) => {
        const out = [];
        const seen = new Set();
        for (const t of arr || []) {
          const key = `${String(t?.title || '').trim()}|${String(t?.closing_date || '').trim()}|${String(t?.url || '').trim()}`;
          if (!seen.has(key)) {
            seen.add(key);
            out.push(t);
          }
        }
        return out;
      };

      const collectFromSource = async (sourceUrl) => {
        let local = [];
        let proxyBody = '';
        let body = '';
        try {
          const response = await axios.get(sourceUrl, {
            timeout: 12000,
            headers: {
              Accept: 'application/json,text/html;q=0.9,*/*;q=0.8',
              'User-Agent': 'Mozilla/5.0 (compatible; ScrapmateAdmin/1.0)'
            }
          });
          body = String(response?.data || '');
        } catch (error) {
          body = '';
          console.warn('⚠️ collectFromSource direct fetch failed:', sourceUrl, error?.message || error);
        }

        if (body) {
          let items = [];
          try {
            const decoded = JSON.parse(body);
            items = findTenderItemsInTree(decoded);
          } catch (_e) {
            const m = body.match(/<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/s);
            if (m && m[1]) {
              try {
                const nextData = JSON.parse(m[1]);
                items = findTenderItemsInTree(nextData);
              } catch (_e2) {
                items = [];
              }
            }
          }
          if (Array.isArray(items) && items.length) {
            local.push(...items.map((x, i) => normalizeTender(x, i + 1)));
          }
        }

        if (local.length < 10) {
          try {
            proxyBody = await fetchViaJina(sourceUrl);
          } catch (_e) {
            proxyBody = '';
          }
          if (proxyBody) {
            local.push(...parseJinaMarkdownTenders(proxyBody));
            local.push(...parseRawTenderText(proxyBody));
          }
        }

        return {
          tenders: uniqueByKey(local),
          proxyBody
        };
      };

      let tenders = [];
      let proxyBodyCache = '';
      for (const candidate of sourceCandidates) {
        const result = await collectFromSource(candidate);
        if (result.proxyBody && !proxyBodyCache) {
          proxyBodyCache = result.proxyBody;
        }
        tenders = uniqueByKey([...tenders, ...result.tenders]);
        if (tenders.length >= 10) {
          break;
        }
      }

      const keralaFiltered = tenders
        .filter((t) => {
          const title = String(t.title || '').toLowerCase();
          const location = String(t.location || '').toLowerCase();
          const description = String(t.description || '').toLowerCase();
          return (title.includes('kerala') || location.includes('kerala') || description.includes('kerala'))
            && !title.includes('global')
            && !location.includes('global')
            && !String(t.url || '').toLowerCase().includes('/global-tenders/');
        })
        .filter((t) => String(t.title || '').trim() !== '');

      let finalTenders = uniqueByKey(keralaFiltered);

      if (finalTenders.length < 10) {
        if (!proxyBodyCache) {
          try {
            proxyBodyCache = await fetchViaJina(sourceListUrl);
          } catch (_e) {
            proxyBodyCache = '';
          }
        }
        if (proxyBodyCache) {
          const parsedMarkdown = parseJinaMarkdownTenders(proxyBodyCache);
          const parsedRaw = parseRawTenderText(proxyBodyCache);
          const parsedLoose = parseLooseTenderCards(proxyBodyCache);
          finalTenders = uniqueByKey([...finalTenders, ...parsedMarkdown, ...parsedRaw, ...parsedLoose]);
          finalTenders = finalTenders.filter((t) => {
            const title = String(t.title || '').toLowerCase();
            const location = String(t.location || '').toLowerCase();
            return !title.includes('global')
              && !location.includes('global')
              && !String(t.url || '').toLowerCase().includes('/global-tenders/')
              && String(t.title || '').trim() !== '';
          });
        }
      }

      if (finalTenders.length === 0 && tenders.length > 0) {
        finalTenders = uniqueByKey(tenders).filter((t) => {
          const title = String(t.title || '').toLowerCase();
          const location = String(t.location || '').toLowerCase();
          return !title.includes('global')
            && !location.includes('global')
            && !String(t.url || '').toLowerCase().includes('/global-tenders/')
            && String(t.title || '').trim() !== '';
        });
      }

      tenders = finalTenders
        .slice(0, 10)
        .map((t, index) => ({ ...t, sl_no: index + 1 }));

      const savedTenders = [];
      let skippedTenders = 0;
      let savedDocs = 0;
      let saveError = null;
      let saveEnabled = true;

      for (let i = 0; i < tenders.length; i++) {
        const tender = tenders[i];
        const sourceUrl = String(tender.url || tender.source_url || '').trim();
        const title = String(tender.title || '').trim();
        const authority = String(tender.authority || tender.tender_authority || '').trim();
        const uniqueHash = crypto
          .createHash('md5')
          .update(`${sourceUrl}|${title}|${authority}|${tender.closing_date || ''}`)
          .digest('hex');

        let tenderId = parseInt(uniqueHash.substring(0, 12), 16);
        if (!Number.isFinite(tenderId) || tenderId <= 0) tenderId = Date.now() + i;

        let existing = null;
        if (saveEnabled) {
          try {
            existing = await client.send(new GetCommand({
              TableName: tendersTable,
              Key: { id: tenderId }
            }));
          } catch (e) {
            if (e && e.name === 'ResourceNotFoundException') {
              saveEnabled = false;
              saveError = `DynamoDB table not found (${tendersTable} or ${docsTable})`;
            } else {
              saveEnabled = false;
              saveError = `DynamoDB read failed: ${e?.message || 'Unknown error'}`;
            }
          }
        }
        if (existing && existing.Item) {
          skippedTenders++;
          continue;
        }

        let enriched = { ...tender, documents: [] };
        let rawPayload = '';
        if (sourceUrl) {
          try {
            rawPayload = await fetchViaJina(sourceUrl);
            enriched = parseTenderDetailMarkdown(rawPayload, enriched);
          } catch (e) {
            console.warn('⚠️ detail fetch failed for tender:', sourceUrl, e?.message || e);
          }
        }
        if (!rawPayload) rawPayload = JSON.stringify(enriched);

        let rawS3Key = null;
        let rawS3Url = null;
        try {
          const keyName = `tenders/raw/${new Date().toISOString().slice(0, 10)}/tender-${tenderId}-${uniqueHash}.md`;
          const uploaded = await uploadBufferToS3(
            Buffer.from(String(rawPayload), 'utf-8'),
            keyName.split('/').pop(),
            keyName.substring(0, keyName.lastIndexOf('/'))
          );
          rawS3Key = uploaded?.s3Key || null;
          rawS3Url = uploaded?.s3Url || null;
        } catch (e) {
          console.warn('⚠️ raw payload upload failed:', e?.message || e);
        }

        if (saveEnabled) {
          try {
            await client.send(new PutCommand({
              TableName: tendersTable,
              Item: {
                id: tenderId,
                source_hash: uniqueHash,
                source_url: sourceUrl,
                source_list_url: sourceListUrl,
                title: title || null,
                authority: authority || null,
                location: enriched.location || null,
                description: enriched.description || null,
                type: enriched.type || null,
                category: enriched.category || null,
                platform: enriched.platform || null,
                opening_date: enriched.opening_date || null,
                closing_date: enriched.closing_date || null,
                closing_label: enriched.closing_label || null,
                tender_amount: enriched.tender_value || enriched.tender_amount || null,
                emd: enriched.emd || null,
                tender_id: enriched.tender_id || null,
                tender_no: enriched.tender_no || null,
                tender_authority: enriched.tender_authority || null,
                purchaser_address: enriched.purchaser_address || null,
                website: enriched.website || null,
                tender_url: enriched.tender_url || sourceUrl || null,
                raw_payload_s3_key: rawS3Key,
                raw_payload_s3_url: rawS3Url,
                created_at: now,
                updated_at: now
              },
              ConditionExpression: 'attribute_not_exists(id)'
            }));
          } catch (e) {
            if (e && e.name === 'ResourceNotFoundException') {
              saveEnabled = false;
              saveError = `DynamoDB table not found (${tendersTable} or ${docsTable})`;
            } else {
              saveEnabled = false;
              saveError = `DynamoDB write failed: ${e?.message || 'Unknown error'}`;
            }
          }
        }

        if (saveEnabled) {
          const docs = Array.isArray(enriched.documents) ? enriched.documents : [];
          for (let d = 0; d < docs.length; d++) {
            const doc = docs[d] || {};
            let docId = parseInt(
              crypto.createHash('md5')
                .update(`${uniqueHash}|${doc.doc_url || ''}|${doc.file_name || ''}|${d}`)
                .digest('hex')
                .substring(0, 12),
              16
            );
            if (!Number.isFinite(docId) || docId <= 0) docId = Date.now() + i + d + 10000;

            try {
              await client.send(new PutCommand({
                TableName: docsTable,
                Item: {
                  id: docId,
                  tender_id: tenderId,
                  doc_label: doc.doc_label || null,
                  file_name: doc.file_name || null,
                  file_size: doc.file_size || null,
                  doc_url: doc.doc_url || null,
                  created_at: now,
                  updated_at: now
                },
                ConditionExpression: 'attribute_not_exists(id)'
              }));
              savedDocs++;
            } catch (e) {
              if (e && e.name === 'ResourceNotFoundException') {
                saveEnabled = false;
                saveError = `DynamoDB table not found (${tendersTable} or ${docsTable})`;
                break;
              }
              saveEnabled = false;
              saveError = `DynamoDB doc write failed: ${e?.message || 'Unknown error'}`;
              break;
            }
          }
        }

        savedTenders.push({
          id: tenderId,
          ...enriched
        });
      }

      return res.json({
        status: 'success',
        msg: 'Kerala scraps tenders fetched',
        data: {
          listing: {
            title: 'Indian Tenders',
            section: 'Home/Indian Tenders/Active Tenders',
            category: 'Scraps',
            state: 'Kerala',
            label: 'Scraps Tenders in Kerala',
            tabs: ['Active', 'Archived', 'Followed'],
            source_url: sourceListUrl,
            page_number: 0,
            page_size: 10
          },
          stats: {
            total_fetched: tenders.length,
            saved_tenders: savedTenders.length,
            skipped_tenders: skippedTenders,
            saved_docs: savedDocs,
            save_enabled: saveEnabled,
            save_error: saveError
          },
          tenders: tenders.map((t, i) => ({
            sl_no: i + 1,
            title: t.title || '',
            authority: t.authority || '',
            type: t.type || '',
            services: t.type || '',
            keyword: t.platform || t.type || '',
            category: t.category || 'Scraps',
            state: 'Kerala',
            location: t.location || '',
            description: t.description || '',
            closing_label: t.closing_label || '',
            closing_date: t.closing_date || '',
            pricing: t.tender_amount || t.tender_value || 'Refer Documents',
            phone_number: t.phone_number || '',
            url: t.url || ''
          }))
        }
      });
    } catch (error) {
      console.error('❌ fetchKeralaScrapTenders error:', error);
      return res.status(500).json({
        status: 'error',
        msg: 'Error fetching Kerala scrap tenders',
        data: null
      });
    }
  }

  /**
   * Fetch all saved scraped tenders (and docs) from DynamoDB.
   * GET /accounts/tenders-saved
   */
  static async getSavedTenders(req, res) {
    try {
      const { getDynamoDBClient } = require('../config/dynamodb');
      const { ScanCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');
      const { getTableName } = require('../utils/dynamodbTableNames');

      const client = getDynamoDBClient();
      const tendersTable = getTableName('scraped_tenders');
      const docsTable = getTableName('scraped_tender_documents');
      const requestedStateRaw = String(req?.query?.state || '').trim();
      const requestedStateNormalized = requestedStateRaw
        ? requestedStateRaw.replace(/\s+/g, ' ').trim().toUpperCase()
        : '';

      const normalizeState = (value) =>
        String(value || '')
          .replace(/\s+/g, ' ')
          .trim()
          .toUpperCase();

      const deriveStateFromLocation = (locationValue) => {
        const location = String(locationValue || '').trim();
        if (!location) return '';
        const segments = location.split(',').map((seg) => seg.trim()).filter(Boolean);
        if (segments.length === 0) return '';
        const last = segments[segments.length - 1];
        if (normalizeState(last) === 'INDIA' && segments.length > 1) {
          return segments[segments.length - 2];
        }
        return last;
      };

      const resolveTenderState = (tender = {}) => {
        const explicitState = String(
          tender?.state || tender?.state_name || tender?.location_state || ''
        ).trim();
        if (explicitState) return explicitState;
        return deriveStateFromLocation(tender?.location);
      };

      const scanAll = async (tableName) => {
        const items = [];
        let lastEvaluatedKey = undefined;
        do {
          const response = await client.send(new ScanCommand({
            TableName: tableName,
            ExclusiveStartKey: lastEvaluatedKey
          }));
          if (Array.isArray(response.Items)) {
            items.push(...response.Items);
          }
          lastEvaluatedKey = response.LastEvaluatedKey;
        } while (lastEvaluatedKey);
        return items;
      };

      const queryAllByStateFromGsi = async (tableName, stateRaw, stateNormalized) => {
        const configuredIndexName = String(process.env.SCRAPED_TENDERS_STATE_GSI || '').trim();
        const configuredKeyName = String(process.env.SCRAPED_TENDERS_STATE_KEY || '').trim();
        const candidates = [];
        if (configuredIndexName && configuredKeyName) {
          candidates.push({ indexName: configuredIndexName, keyName: configuredKeyName });
        }
        candidates.push(
          { indexName: 'state_normalized-created_at-index', keyName: 'state_normalized' },
          { indexName: 'state_normalized-index', keyName: 'state_normalized' },
          { indexName: 'state-created_at-index', keyName: 'state' },
          { indexName: 'state-index', keyName: 'state' }
        );

        const uniqueCandidates = [];
        const seen = new Set();
        for (const candidate of candidates) {
          const key = `${candidate.indexName}::${candidate.keyName}`;
          if (seen.has(key)) continue;
          seen.add(key);
          uniqueCandidates.push(candidate);
        }

        let lastError = null;
        for (const candidate of uniqueCandidates) {
          const stateValues =
            candidate.keyName === 'state_normalized'
              ? [stateNormalized]
              : [stateRaw, stateNormalized].filter(Boolean);
          const uniqueValues = Array.from(new Set(stateValues.map((v) => String(v || '').trim()).filter(Boolean)));

          for (const stateValue of uniqueValues) {
            try {
              const items = [];
              let lastEvaluatedKey = undefined;
              do {
                const response = await client.send(
                  new QueryCommand({
                    TableName: tableName,
                    IndexName: candidate.indexName,
                    KeyConditionExpression: '#stateKey = :stateValue',
                    ExpressionAttributeNames: {
                      '#stateKey': candidate.keyName,
                    },
                    ExpressionAttributeValues: {
                      ':stateValue': stateValue,
                    },
                    ExclusiveStartKey: lastEvaluatedKey,
                  })
                );
                if (Array.isArray(response.Items)) {
                  items.push(...response.Items);
                }
                lastEvaluatedKey = response.LastEvaluatedKey;
              } while (lastEvaluatedKey);

              return {
                items,
                mode: 'gsi',
                index_name: candidate.indexName,
                index_key: candidate.keyName,
                query_value: stateValue,
              };
            } catch (error) {
              lastError = error;
              const errorName = String(error?.name || '');
              if (
                errorName !== 'ValidationException' &&
                errorName !== 'ResourceNotFoundException'
              ) {
                throw error;
              }
            }
          }
        }

        if (lastError) {
          console.warn('⚠️ getSavedTenders: State GSI query unavailable, using scan fallback:', lastError.message);
        }
        return null;
      };

      let tenders = [];
      let docs = [];
      let stateQueryMeta = {
        mode: requestedStateNormalized ? 'scan' : 'none',
        index_name: null,
        index_key: null,
        query_value: null,
      };
      try {
        if (requestedStateNormalized) {
          const gsiQueryResult = await queryAllByStateFromGsi(
            tendersTable,
            requestedStateRaw,
            requestedStateNormalized
          );
          if (gsiQueryResult && Array.isArray(gsiQueryResult.items)) {
            tenders = gsiQueryResult.items;
            stateQueryMeta = {
              mode: gsiQueryResult.mode,
              index_name: gsiQueryResult.index_name || null,
              index_key: gsiQueryResult.index_key || null,
              query_value: gsiQueryResult.query_value || null,
            };
          } else {
            tenders = await scanAll(tendersTable);
          }
        } else {
          tenders = await scanAll(tendersTable);
        }
      } catch (e) {
        if (e && e.name === 'ResourceNotFoundException') {
          return res.json({
            status: 'success',
            msg: 'No saved tenders table found',
            data: {
              table: tendersTable,
              total: 0,
              tenders: []
            }
          });
        }
        throw e;
      }

      if (requestedStateNormalized) {
        tenders = tenders.filter((t) => normalizeState(resolveTenderState(t)) === requestedStateNormalized);
      }

      try {
        docs = await scanAll(docsTable);
      } catch (e) {
        if (!(e && e.name === 'ResourceNotFoundException')) {
          throw e;
        }
      }

      const docsByTenderId = new Map();
      for (const doc of docs) {
        const tenderId = doc?.tender_id;
        if (tenderId === undefined || tenderId === null) continue;
        const key = String(tenderId);
        if (!docsByTenderId.has(key)) docsByTenderId.set(key, []);
        docsByTenderId.get(key).push(doc);
      }

      const sanitizeText = (value) => String(value || '').trim();
      const hasValue = (value) => {
        const text = sanitizeText(value);
        return !!text && text !== '-' && text.toLowerCase() !== 'null' && text.toLowerCase() !== 'undefined';
      };
      const isBidAssistUrl = (value) => sanitizeText(value).toLowerCase().includes('bidassist.com');
      const makeTenderDedupKey = (tender) =>
        sanitizeText(tender?.tender_id) ||
        sanitizeText(tender?.source_tender_id) ||
        sanitizeText(tender?.tender_no) ||
        `${sanitizeText(tender?.title)}|${sanitizeText(tender?.location)}|${sanitizeText(tender?.closing_date)}`;
      const tenderQualityScore = (tender) => {
        let score = 0;
        if (hasValue(tender?.website)) score += 5;
        if (hasValue(tender?.tender_url) && !isBidAssistUrl(tender?.tender_url)) score += 4;
        if (hasValue(tender?.source_url) && !isBidAssistUrl(tender?.source_url)) score += 3;
        if (Array.isArray(tender?.documents) && tender.documents.length > 0) score += 1;
        return score;
      };

      const merged = tenders.map((t) => ({
        ...t,
        documents: docsByTenderId.get(String(t.id)) || []
      }));

      const byKey = new Map();
      for (const tender of merged) {
        const key = makeTenderDedupKey(tender);
        if (!key) {
          byKey.set(`id:${sanitizeText(tender?.id)}`, tender);
          continue;
        }
        const existing = byKey.get(key);
        if (!existing) {
          byKey.set(key, tender);
          continue;
        }
        const existingScore = tenderQualityScore(existing);
        const currentScore = tenderQualityScore(tender);
        if (currentScore > existingScore) {
          byKey.set(key, tender);
          continue;
        }
        if (currentScore === existingScore) {
          const existingTime = new Date(existing?.created_at || 0).getTime();
          const currentTime = new Date(tender?.created_at || 0).getTime();
          if (currentTime > existingTime) {
            byKey.set(key, tender);
          }
        }
      }

      const normalized = Array.from(byKey.values()).sort((a, b) => {
        const aTime = new Date(a?.created_at || 0).getTime();
        const bTime = new Date(b?.created_at || 0).getTime();
        return bTime - aTime;
      });

      return res.json({
        status: 'success',
        msg: 'Saved tenders fetched successfully',
        data: {
          tenders_table: tendersTable,
          docs_table: docsTable,
          state_filter: requestedStateRaw || null,
          state_filter_normalized: requestedStateNormalized || null,
          state_query_mode: stateQueryMeta.mode,
          state_query_index_name: stateQueryMeta.index_name,
          state_query_index_key: stateQueryMeta.index_key,
          state_query_value: stateQueryMeta.query_value,
          total: normalized.length,
          tenders: normalized
        }
      });
    } catch (error) {
      console.error('❌ getSavedTenders error:', error);
      return res.status(500).json({
        status: 'error',
        msg: 'Error fetching saved tenders',
        data: null
      });
    }
  }

  /**
   * Persist scraped tenders in DynamoDB + S3.
   * Body: { source_list_url?: string, tenders: [{...}] }
   */
  static async syncTendersToAws(req, res) {
    try {
      const { source_list_url, tenders } = req.body || {};
      if (!Array.isArray(tenders) || tenders.length === 0) {
        return res.status(400).json({
          status: 'error',
          msg: 'tenders array is required',
          data: null
        });
      }

      const { getDynamoDBClient } = require('../config/dynamodb');
      const { PutCommand, GetCommand } = require('@aws-sdk/lib-dynamodb');
      const { getTableName } = require('../utils/dynamodbTableNames');
      const { uploadBufferToS3 } = require('../utils/s3Upload');
      const crypto = require('crypto');

      const client = getDynamoDBClient();
      const tendersTable = getTableName('scraped_tenders');
      const docsTable = getTableName('scraped_tender_documents');
      const now = new Date().toISOString();
      const normalizeState = (value) =>
        String(value || '')
          .replace(/\s+/g, ' ')
          .trim();
      const deriveStateFromLocation = (locationValue) => {
        const location = String(locationValue || '').trim();
        if (!location) return '';
        const segments = location.split(',').map((seg) => seg.trim()).filter(Boolean);
        if (segments.length === 0) return '';
        const last = segments[segments.length - 1];
        if (last.toUpperCase() === 'INDIA' && segments.length > 1) {
          return segments[segments.length - 2];
        }
        return last;
      };

      let savedTenders = 0;
      let savedDocs = 0;
      let skippedTenders = 0;
      const errors = [];

      for (let i = 0; i < tenders.length; i++) {
        const t = tenders[i] || {};
        try {
          const sourceUrl = String(t.url || t.source_url || '').trim();
          const title = String(t.title || '').trim();
          const authority = String(t.authority || t.tender_authority || '').trim();
          const uniqueHash = crypto
            .createHash('md5')
            .update(`${sourceUrl}|${title}|${authority}|${t.closing_date || ''}`)
            .digest('hex');
          // Deterministic ID so same tender is not inserted again
          let tenderId = parseInt(uniqueHash.substring(0, 12), 16);
          if (!Number.isFinite(tenderId) || tenderId <= 0) {
            tenderId = Date.now() + i;
          }

          // Skip if already stored
          const existing = await client.send(new GetCommand({
            TableName: tendersTable,
            Key: { id: tenderId },
          }));
          if (existing && existing.Item) {
            skippedTenders++;
            continue;
          }

          let rawS3Key = null;
          let rawS3Url = null;
          if (t.raw_payload && String(t.raw_payload).trim() !== '') {
            const keyName = `tenders/raw/${new Date().toISOString().slice(0, 10)}/tender-${tenderId}-${uniqueHash}.md`;
            const uploaded = await uploadBufferToS3(
              Buffer.from(String(t.raw_payload), 'utf-8'),
              keyName.split('/').pop(),
              keyName.substring(0, keyName.lastIndexOf('/'))
            );
            rawS3Key = uploaded?.s3Key || null;
            rawS3Url = uploaded?.s3Url || null;
          }
          const resolvedState = normalizeState(t.state || t.state_name || deriveStateFromLocation(t.location));
          const resolvedStateNormalized = resolvedState ? resolvedState.toUpperCase() : null;

          await client.send(new PutCommand({
            TableName: tendersTable,
            Item: {
              id: tenderId,
              source_hash: uniqueHash,
              source_url: sourceUrl,
              source_list_url: source_list_url || null,
              title: title || null,
              authority: authority || null,
              location: t.location || null,
              description: t.description || null,
              type: t.type || null,
              category: t.category || null,
              platform: t.platform || null,
              opening_date: t.opening_date || null,
              closing_date: t.closing_date || null,
              closing_label: t.closing_label || null,
              tender_amount: t.tender_value || t.tender_amount || null,
              emd: t.emd || null,
              tender_id: t.tender_id || null,
              tender_no: t.tender_no || null,
              tender_authority: t.tender_authority || null,
              purchaser_address: t.purchaser_address || null,
              website: t.website || null,
              tender_url: t.tender_url || sourceUrl || null,
              state: resolvedState || null,
              state_normalized: resolvedStateNormalized,
              raw_payload: t.raw_payload || null,
              raw_payload_s3_key: rawS3Key,
              raw_payload_s3_url: rawS3Url,
              created_at: now,
              updated_at: now,
            },
            ConditionExpression: 'attribute_not_exists(id)',
          }));
          savedTenders++;

          const docs = Array.isArray(t.documents) ? t.documents : [];
          for (let d = 0; d < docs.length; d++) {
            const doc = docs[d] || {};
            let docId = parseInt(
              crypto.createHash('md5')
                .update(`${uniqueHash}|${doc.doc_url || ''}|${doc.file_name || ''}|${d}`)
                .digest('hex')
                .substring(0, 12),
              16
            );
            if (!Number.isFinite(docId) || docId <= 0) {
              docId = Date.now() + i + d + 10000;
            }
            await client.send(new PutCommand({
              TableName: docsTable,
              Item: {
                id: docId,
                tender_id: tenderId,
                doc_label: doc.doc_label || null,
                file_name: doc.file_name || null,
                file_size: doc.file_size || null,
                doc_url: doc.doc_url || null,
                created_at: now,
                updated_at: now,
              },
              ConditionExpression: 'attribute_not_exists(id)',
            }));
            savedDocs++;
          }
        } catch (err) {
          if (err && err.name === 'ConditionalCheckFailedException') {
            skippedTenders++;
            continue;
          }
          errors.push({
            index: i,
            message: err.message || 'Unknown tender sync error',
          });
        }
      }

      return res.json({
        status: 'success',
        msg: 'Tenders synced to AWS',
        data: {
          saved_tenders: savedTenders,
          saved_docs: savedDocs,
          skipped_tenders: skippedTenders,
          errors,
          tenders_table: tendersTable,
          docs_table: docsTable,
        }
      });
    } catch (error) {
      console.error('❌ syncTendersToAws error:', error);
      return res.status(500).json({
        status: 'error',
        msg: 'Error syncing tenders to AWS',
        data: null
      });
    }
  }

  /**
   * Check which tenders are already saved in DynamoDB.
   * Body: { tenders: [{ url, title, authority, closing_date }] }
   */
  static async checkExistingTenders(req, res) {
    try {
      const { tenders } = req.body || {};
      if (!Array.isArray(tenders) || tenders.length === 0) {
        return res.status(400).json({
          status: 'error',
          msg: 'tenders array is required',
          data: null
        });
      }

      const { getDynamoDBClient } = require('../config/dynamodb');
      const { GetCommand } = require('@aws-sdk/lib-dynamodb');
      const { getTableName } = require('../utils/dynamodbTableNames');
      const crypto = require('crypto');
      const client = getDynamoDBClient();
      const tendersTable = getTableName('scraped_tenders');

      const existingHashes = [];
      const checked = [];

      for (let i = 0; i < tenders.length; i++) {
        const t = tenders[i] || {};
        const sourceUrl = String(t.url || t.source_url || '').trim();
        const title = String(t.title || '').trim();
        const authority = String(t.authority || t.tender_authority || '').trim();
        const uniqueHash = crypto
          .createHash('md5')
          .update(`${sourceUrl}|${title}|${authority}|${t.closing_date || ''}`)
          .digest('hex');

        let tenderId = parseInt(uniqueHash.substring(0, 12), 16);
        if (!Number.isFinite(tenderId) || tenderId <= 0) {
          tenderId = Date.now() + i;
        }

        const existing = await client.send(new GetCommand({
          TableName: tendersTable,
          Key: { id: tenderId },
        }));

        checked.push({
          id: tenderId,
          hash: uniqueHash,
          exists: !!(existing && existing.Item),
          url: sourceUrl,
        });
        if (existing && existing.Item) {
          existingHashes.push(uniqueHash);
        }
      }

      return res.json({
        status: 'success',
        msg: 'Existing tenders checked',
        data: {
          existing_hashes: existingHashes,
          checked,
          tenders_table: tendersTable,
        }
      });
    } catch (error) {
      console.error('❌ checkExistingTenders error:', error);
      return res.status(500).json({
        status: 'error',
        msg: 'Error checking existing tenders',
        data: null
      });
    }
  }

  /**
   * Cancel a pending bulk sell order
   * POST /accounts/pending-bulk-sell-order-cancel
   */
  static async cancelPendingBulkSellOrder(req, res) {
    try {
      console.log('🟢 AccountsPanelController.cancelPendingBulkSellOrder called');
      console.log('   Request body:', JSON.stringify(req.body, null, 2));
      
      const { request_id } = req.body;
      
      if (!request_id) {
        return res.status(400).json({
          status: 'error',
          msg: 'request_id is required',
          data: null
        });
      }
      
      const { getDynamoDBClient } = require('../config/dynamodb');
      const { UpdateCommand } = require('@aws-sdk/lib-dynamodb');
      const client = getDynamoDBClient();
      
      // Update the request status to cancelled
      const updateCommand = new UpdateCommand({
        TableName: 'bulk_sell_requests',
        Key: { id: request_id },
        UpdateExpression: 'SET #status = :status, updated_at = :updatedAt',
        ExpressionAttributeNames: {
          '#status': 'status'
        },
        ExpressionAttributeValues: {
          ':status': 'cancelled',
          ':updatedAt': new Date().toISOString()
        }
      });
      
      await client.send(updateCommand);
      
      console.log('✅ Bulk sell request cancelled successfully:', request_id);
      
      res.json({
        status: 'success',
        msg: 'Request cancelled successfully',
        data: { request_id, status: 'cancelled' }
      });
    } catch (error) {
      console.error('❌ cancelPendingBulkSellOrder error:', error);
      res.status(500).json({
        status: 'error',
        msg: 'Error cancelling request: ' + (error.message || 'Unknown error'),
        data: null
      });
    }
  }

  /**
   * Update pending bulk sell order status
   * POST /accounts/pending-bulk-sell-order-status
   */
  static async updatePendingBulkSellOrderStatus(req, res) {
    try {
      console.log('🟢 AccountsPanelController.updatePendingBulkSellOrderStatus called');
      console.log('   Request body:', JSON.stringify(req.body, null, 2));
      
      const { request_id, status } = req.body;
      
      if (!request_id || !status) {
        return res.status(400).json({
          status: 'error',
          msg: 'request_id and status are required',
          data: null
        });
      }
      
      if (!['active', 'sold', 'cancelled'].includes(status)) {
        return res.status(400).json({
          status: 'error',
          msg: 'status must be "active", "sold", or "cancelled"',
          data: null
        });
      }
      
      const { getDynamoDBClient } = require('../config/dynamodb');
      const { UpdateCommand } = require('@aws-sdk/lib-dynamodb');
      const client = getDynamoDBClient();
      
      // Update the request status
      const updateCommand = new UpdateCommand({
        TableName: 'bulk_sell_requests',
        Key: { id: request_id },
        UpdateExpression: 'SET #status = :status, updated_at = :updatedAt',
        ExpressionAttributeNames: {
          '#status': 'status'
        },
        ExpressionAttributeValues: {
          ':status': status,
          ':updatedAt': new Date().toISOString()
        }
      });
      
      await client.send(updateCommand);
      
      console.log('✅ Bulk sell request status updated successfully:', request_id, status);
      
      res.json({
        status: 'success',
        msg: 'Status updated successfully',
        data: { request_id, status }
      });
    } catch (error) {
      console.error('❌ updatePendingBulkSellOrderStatus error:', error);
      res.status(500).json({
        status: 'error',
        msg: 'Error updating status: ' + (error.message || 'Unknown error'),
        data: null
      });
    }
  }
}

module.exports = AccountsPanelController;
