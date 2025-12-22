const Shop = require('../models/Shop');
const DeliveryBoy = require('../models/DeliveryBoy');
const ProductCategory = require('../models/ProductCategory');
const Product = require('../models/Product');
const User = require('../models/User');
const RedisCache = require('../utils/redisCache');

class AgentPanelController {
  static async agents(req, res) {
    try {
      console.log('✅ AgentPanelController.agents called - fetching shop_types');
      
      // Check Redis cache first
      const cacheKey = RedisCache.listKey('agent_shop_types');
      try {
        const cached = await RedisCache.get(cacheKey);
        if (cached) {
          console.log('⚡ Agents cache hit');
          return res.json({ 
            status: 'success', 
            msg: 'Agents page data', 
            data: { pagename: 'Vendor List', shoptype: cached } 
          });
        }
      } catch (err) {
        console.error('Redis get error:', err);
      }
      
      // TODO: shop_types table - Create ShopType model if needed
      // For now, return empty array
      const results = [];
      console.log(`✅ Found ${results.length} shop_types`);
      
      // Cache shop types for 1 hour
      try {
        await RedisCache.set(cacheKey, results, '30days');
        console.log('💾 Shop types cached');
      } catch (err) {
        console.error('Redis cache set error:', err);
      }
      
      res.json({ 
        status: 'success', 
        msg: 'Agents page data', 
        data: { pagename: 'Vendor List', shoptype: results } 
      });
    } catch (error) {
      console.error('agents error:', error);
      res.status(500).json({ 
        status: 'error', 
        msg: 'Error loading agents page', 
        data: { pagename: 'Vendor List', shoptype: [] } 
      });
    }
  }

  static async getAgentById(req, res) {
    try {
      const { id } = req.params;
      console.log('🟢 AgentPanelController.getAgentById called', { id });
      
      // Check Redis cache first
      const cacheKey = RedisCache.shopKey(id, 'agent');
      try {
        const cached = await RedisCache.get(cacheKey);
        if (cached) {
          console.log('⚡ Agent cache hit:', cacheKey);
          return res.json({ status: 'success', msg: 'Agent retrieved', data: cached });
        }
      } catch (err) {
        console.error('Redis get error:', err);
      }
      
      // Use Shop model to get agent
      const agentData = await Shop.findById(id);
      console.log(`✅ getAgentById: Found agent:`, agentData ? 'Yes' : 'No');
      
      // Cache agent data for 30 minutes
      if (agentData) {
        try {
          await RedisCache.set(cacheKey, agentData, '30days');
          console.log('💾 Agent data cached:', cacheKey);
        } catch (err) {
          console.error('Redis cache set error:', err);
        }
      }
      
      res.json({ status: 'success', msg: 'Agent retrieved', data: agentData });
    } catch (error) {
      console.error('❌ getAgentById error:', error);
      res.status(500).json({ status: 'error', msg: 'Error fetching agent', data: null });
    }
  }

  static async agentsLeads(req, res) {
    res.json({ status: 'success', msg: 'Agents leads page', data: { pagename: 'Agent List' } });
  }

  static async viewShops(req, res) {
    try {
      console.log('🟢 AgentPanelController.viewShops called', { shop_type_id: req.query.shop_type_id });
      const shop_type_id = req.query.shop_type_id;
      
      // Check Redis cache first
      const cacheKey = RedisCache.listKey('agent_shops', { shop_type_id: shop_type_id || 'all' });
      try {
        const cached = await RedisCache.get(cacheKey);
        if (cached) {
          console.log('⚡ View shops cache hit');
          return res.json({ status: 'success', msg: 'Shops retrieved', data: cached });
        }
      } catch (err) {
        console.error('Redis get error:', err);
      }
      
      // Use Shop model to get all shops with del_status = 1
      const allShops = await Shop.getAll();
      
      // Filter by del_status and shop_type
      let results = allShops.filter(shop => shop.del_status === 1);
      
      if (shop_type_id) {
        results = results.filter(shop => shop.shop_type === shop_type_id);
      }
      
      // Sort by id DESC
      results.sort((a, b) => (b.id || 0) - (a.id || 0));
      
      console.log(`✅ viewShops: Found ${results.length} shops`);
      
      // Get shop IDs for batch count fetching
      const shopIds = results.map(shop => shop.id).filter(id => id != null);
      
      // Fetch counts in batch for all shops
      const ShopImages = require('../models/ShopImages');
      const imageCounts = shopIds.length > 0 ? await ShopImages.getCountsByShopIds(shopIds) : {};
      const deliveryBoyCounts = shopIds.length > 0 ? await DeliveryBoy.getCountsByShopIds(shopIds) : {};
      
      // Add counts to each shop
      results = results.map(shop => ({
        ...shop,
        image_count: imageCounts[shop.id] || 0,
        delivery_boys_count: deliveryBoyCounts[shop.id] || 0
      }));
      
      // Cache shops list for 10 minutes
      try {
        await RedisCache.set(cacheKey, results, '30days');
        console.log('💾 Shops list cached');
      } catch (err) {
        console.error('Redis cache set error:', err);
      }
      
      res.json({ status: 'success', msg: 'Shops retrieved', data: results });
    } catch (error) {
      console.error('❌ viewShops error:', error);
      res.json({ status: 'error', msg: 'Error fetching shops', data: [] });
    }
  }

  static async shopViewById(req, res) {
    try {
      const { id } = req.params;
      console.log('🟢 AgentPanelController.shopViewById called', { id });
      
      // Check Redis cache first
      const cacheKey = RedisCache.shopKey(id, 'view');
      try {
        const cached = await RedisCache.get(cacheKey);
        if (cached) {
          console.log('⚡ Shop view cache hit:', cacheKey);
          return res.json(cached);
        }
      } catch (err) {
        console.error('Redis get error:', err);
      }
      
      // Use models to get shop data
      const shop = await Shop.findById(id);
      if (!shop) {
        return res.json({ status: 'error', msg: 'Shop not found', data: null });
      }
      console.log(`✅ shopViewById: Found shop`);
      
      // Get delivery boys and categories in parallel
      const [delBoyResults, catResults] = await Promise.all([
        DeliveryBoy.findByShopId(id),
        ProductCategory.findByShopId(id)
      ]);
      
      console.log(`✅ shopViewById: Found ${delBoyResults.length} delivery boy(s) and ${catResults.length} category(ies)`);
      
      const response = {
        status: 'success',
        msg: 'Shop data retrieved',
        data: {
          shop: shop,
          delivery_boy: delBoyResults || [],
          category: catResults || []
        }
      };
      
      // Cache shop view data for 15 minutes
      try {
        await RedisCache.set(cacheKey, response, '30days');
        console.log('💾 Shop view data cached:', cacheKey);
      } catch (err) {
        console.error('Redis cache set error:', err);
      }
      
      res.json(response);
    } catch (error) {
      console.error('❌ shopViewById error:', error);
      res.status(500).json({ status: 'error', msg: 'Error fetching shop data', data: null });
    }
  }

  static async viewDeliveryBoy(req, res) {
    try {
      const { id } = req.params;
      console.log('🟢 AgentPanelController.viewDeliveryBoy called', { id });
      
      // Check Redis cache first
      const cacheKey = RedisCache.deliveryBoyKey(id);
      try {
        const cached = await RedisCache.get(cacheKey);
        if (cached) {
          console.log('⚡ Delivery boy cache hit:', cacheKey);
          return res.json({ status: 'success', msg: 'Delivery boy retrieved', data: cached });
        }
      } catch (err) {
        console.error('Redis get error:', err);
      }
      
      // Use DeliveryBoy model
      const delBoyData = await DeliveryBoy.findById(id);
      console.log(`✅ viewDeliveryBoy: Found delivery boy:`, delBoyData ? 'Yes' : 'No');
      
      // Cache delivery boy data for 30 minutes
      if (delBoyData) {
        try {
          await RedisCache.set(cacheKey, delBoyData, '30days');
          console.log('💾 Delivery boy data cached:', cacheKey);
        } catch (err) {
          console.error('Redis cache set error:', err);
        }
      }
      
      res.json({ status: 'success', msg: 'Delivery boy retrieved', data: delBoyData });
    } catch (error) {
      console.error('❌ viewDeliveryBoy error:', error);
      res.status(500).json({ status: 'error', msg: 'Error fetching delivery boy', data: null });
    }
  }

  static async agentReport(req, res) {
    res.json({ status: 'success', msg: 'Agent report page', data: { pagename: 'Agent Report' } });
  }

  static async commissionTrack(req, res) {
    res.json({ status: 'success', msg: 'Commission track page', data: { pagename: 'Agent Commison Traking' } });
  }

  static async createAgent(req, res) {
    try {
      console.log('🟢 AgentPanelController.createAgent called', { body: { ...req.body, password: '***' } });
      const { shopname, email, password, ownername, contact, address } = req.body;

      if (!email || !password || !shopname) {
        console.error('❌ createAgent: Missing required fields');
        return res.json({ status: 'error', msg: 'Email, password, and shop name are required', data: null });
      }

      // Check if email already exists
      console.log('🟢 createAgent: Checking if email exists:', email);
      const emailExists = await User.emailExists(email);
      if (emailExists) {
        console.error('❌ createAgent: Email already exists');
        return res.json({ status: 'error', msg: 'Email already exists', data: null });
      }

      // Create user using User model
      console.log('🟢 createAgent: Creating user');
      const user = await User.create(shopname, email, null, 'S', password);
      const userId = user.id;
      console.log(`✅ createAgent: User created with ID: ${userId}`);

      // Create shop using Shop model
      console.log('🟢 createAgent: Creating shop');
      await Shop.create({
        email: email,
        user_id: userId,
        shopname: shopname,
        ownername: ownername || '',
        contact: contact || '',
        address: address || ''
      });
      console.log('✅ createAgent: Shop created successfully');

      // Invalidate related caches
      try {
        await RedisCache.invalidateTableCache('shops');
        await RedisCache.invalidateTableCache('users');
        await RedisCache.delete(RedisCache.listKey('agent_shops'));
        console.log('🗑️  Invalidated agent caches after create');
      } catch (err) {
        console.error('Redis cache invalidation error:', err);
      }

      res.json({ status: 'success', msg: 'Agent created successfully', data: null });
    } catch (error) {
      console.error('❌ createAgent error:', error);
      res.status(500).json({ status: 'error', msg: 'Error creating agent', data: null });
    }
  }

  static async updateAgent(req, res) {
    try {
      console.log('🟢 AgentPanelController.updateAgent called', { id: req.params.id, body: req.body });
      const { id } = req.params;
      const { shopname, ownername, contact, address } = req.body;

      // Get shop to find user_id
      console.log('🟢 updateAgent: Finding shop');
      const shop = await Shop.findById(id);
      if (!shop) {
        console.error('❌ updateAgent: Shop not found');
        return res.json({ status: 'error', msg: 'Shop not found', data: null });
      }

      const userId = shop.user_id;
      console.log(`✅ updateAgent: Found shop with user_id: ${userId}`);

      // Update user name
      if (shopname) {
        console.log('🟢 updateAgent: Updating user name');
        await User.updateProfile(userId, { name: shopname });
      }

      // Update shop
      const updateData = {};
      if (shopname) updateData.shopname = shopname;
      if (ownername !== undefined) updateData.ownername = ownername;
      if (contact !== undefined) updateData.contact = contact;
      if (address !== undefined) updateData.address = address;

      if (Object.keys(updateData).length > 0) {
        console.log('🟢 updateAgent: Updating shop fields:', Object.keys(updateData));
        await Shop.update(id, updateData);
        console.log('✅ updateAgent: Shop updated successfully');
      }

      // Invalidate related caches
      try {
        await RedisCache.invalidateTableCache('shops');
        await RedisCache.invalidateTableCache('users');
        await RedisCache.delete(RedisCache.shopKey(id, 'agent'));
        await RedisCache.delete(RedisCache.shopKey(id, 'view'));
        await RedisCache.delete(RedisCache.listKey('agent_shops'));
        console.log('🗑️  Invalidated agent caches after update');
      } catch (err) {
        console.error('Redis cache invalidation error:', err);
      }

      res.json({ status: 'success', msg: 'Agent updated successfully', data: null });
    } catch (error) {
      console.error('❌ updateAgent error:', error);
      res.status(500).json({ status: 'error', msg: 'Error updating agent', data: null });
    }
  }

  static async getCategoriesForShop(req, res) {
    try {
      console.log('🟢 AgentPanelController.getCategoriesForShop called', { id: req.params.id });
      const { id } = req.params;
      
      // Check Redis cache first
      const cacheKey = RedisCache.listKey('shop_categories', { shop_id: id });
      try {
        const cached = await RedisCache.get(cacheKey);
        if (cached) {
          console.log('⚡ Categories cache hit:', cacheKey);
          return res.json(cached);
        }
      } catch (err) {
        console.error('Redis get error:', err);
      }

      // TODO: category_img_keywords table - Create CategoryImgKeywords model if needed
      // For now, return empty array
      const categories = [];
      console.log(`✅ getCategoriesForShop: Found ${categories.length} categories`);
      
      // Get already added categories for this shop using ProductCategory model
      console.log('🟢 getCategoriesForShop: Fetching added categories for shop');
      const addedCategories = await ProductCategory.findByShopId(id);
      const addedCatNames = addedCategories.map(cat => cat.cat_name);
      console.log(`✅ getCategoriesForShop: Found ${addedCatNames.length} added categories`);

      const response = {
        status: 'success',
        msg: 'Categories retrieved',
        data: {
          categories: categories,
          added_cat: addedCatNames
        }
      };
      
      // Cache categories for 1 hour
      try {
        await RedisCache.set(cacheKey, response, '30days');
        console.log('💾 Categories cached:', cacheKey);
      } catch (err) {
        console.error('Redis cache set error:', err);
      }

      res.json(response);
    } catch (error) {
      console.error('❌ getCategoriesForShop error:', error);
      res.status(500).json({ status: 'error', msg: 'Error fetching categories', data: null });
    }
  }

  static async createCategory(req, res) {
    try {
      console.log('🟢 AgentPanelController.createCategory called', { id: req.params.id, category: req.body.category });
      const { id } = req.params;
      const { category } = req.body;

      if (!category) {
        console.error('❌ createCategory: Category is required');
        return res.json({ status: 'error', msg: 'Category is required', data: null });
      }

      // TODO: category_img_keywords table - Create CategoryImgKeywords model if needed
      // For now, use the category ID as the category name
      const categoryName = `Category ${category}`;
      const categoryImg = '';

      // Check if category already added for this shop
      console.log('🟢 createCategory: Checking if category already added');
      const existingCategories = await ProductCategory.findByShopId(id);
      const existing = existingCategories.find(cat => cat.cat_name === categoryName);
      if (existing) {
        console.error('❌ createCategory: Category already added');
        return res.json({ status: 'error', msg: 'Category already added', data: null });
      }

      // Insert category using ProductCategory model
      console.log('🟢 createCategory: Inserting category');
      await ProductCategory.create({
        shop_id: id,
        cat_name: categoryName,
        cat_img: categoryImg
      });
      console.log('✅ createCategory: Category added successfully');

      // Invalidate related caches
      try {
        await RedisCache.invalidateTableCache('product_category');
        await RedisCache.delete(RedisCache.listKey('shop_categories', { shop_id: id }));
        await RedisCache.delete(RedisCache.shopKey(id, 'view'));
        console.log('🗑️  Invalidated category caches after create');
      } catch (err) {
        console.error('Redis cache invalidation error:', err);
      }

      res.json({ status: 'success', msg: 'Category added successfully', data: null });
    } catch (error) {
      console.error('❌ createCategory error:', error);
      res.status(500).json({ status: 'error', msg: 'Error creating category', data: null });
    }
  }

  static async createItem(req, res) {
    try {
      console.log('🟢 AgentPanelController.createItem called', { shopid: req.params.shopid, catid: req.params.catid, body: req.body });
      const { shopid, catid } = req.params;
      const { item, amount } = req.body;

      if (!item || !amount) {
        console.error('❌ createItem: Item name and amount are required');
        return res.json({ status: 'error', msg: 'Item name and amount are required', data: null });
      }

      console.log('🟢 createItem: Inserting item');
      await Product.create({
        shop_id: shopid,
        cat_id: catid,
        name: item,
        price: amount // Note: SQL uses 'amout' but Product model uses 'price'
      });
      console.log('✅ createItem: Item added successfully');

      // Invalidate related caches
      try {
        await RedisCache.invalidateTableCache('products');
        await RedisCache.delete(RedisCache.listKey('shop_items', { shop_id: shopid }));
        console.log('🗑️  Invalidated product caches after create');
      } catch (err) {
        console.error('Redis cache invalidation error:', err);
      }

      res.json({ status: 'success', msg: 'Item added successfully', data: null });
    } catch (error) {
      console.error('❌ createItem error:', error);
      res.status(500).json({ status: 'error', msg: 'Error creating item', data: null });
    }
  }

  static async shopStatusChange(req, res) {
    try {
      console.log('🟢 AgentPanelController.shopStatusChange called', { id: req.params.id });
      const { id } = req.params;

      console.log('🟢 shopStatusChange: Updating shop status to 2');
      await Shop.update(id, { status: 2 });
      console.log('✅ shopStatusChange: Shop status changed successfully');

      // Invalidate related caches
      try {
        await RedisCache.invalidateTableCache('shops');
        await RedisCache.delete(RedisCache.shopKey(id, 'agent'));
        await RedisCache.delete(RedisCache.shopKey(id, 'view'));
        await RedisCache.delete(RedisCache.listKey('agent_shops'));
        // Invalidate shops cache (used for B2B/B2C availability in categories)
        await RedisCache.invalidateV2ApiCache('shops', null, {});
        console.log('🗑️  Invalidated shop caches after status change');
      } catch (err) {
        console.error('Redis cache invalidation error:', err);
      }

      res.json({ status: 'success', msg: 'Shop status changed successfully', data: null });
    } catch (error) {
      console.error('❌ shopStatusChange error:', error);
      res.status(500).json({ status: 'error', msg: 'Error changing shop status', data: null });
    }
  }

  static async deleteShop(req, res) {
    try {
      console.log('🟢 AgentPanelController.deleteShop called', { id: req.params.id });
      const { id } = req.params;

      // Get shop to find user_id
      console.log('🟢 deleteShop: Finding shop');
      const shop = await Shop.findById(id);
      if (!shop) {
        console.error('❌ deleteShop: Shop not found');
        return res.json({ status: 'error', msg: 'Shop not found', data: null });
      }

      const userId = shop.user_id;
      console.log(`✅ deleteShop: Found shop with user_id: ${userId}`);

      // TODO: Delete user - User model doesn't have delete method yet
      // For now, just soft delete the shop
      console.log('🟢 deleteShop: Soft deleting shop');
      await Shop.update(id, { del_status: 2 });
      console.log('✅ deleteShop: Shop deleted successfully');

      // Invalidate related caches
      try {
        await RedisCache.invalidateTableCache('shops');
        await RedisCache.invalidateTableCache('users');
        await RedisCache.delete(RedisCache.shopKey(id, 'agent'));
        await RedisCache.delete(RedisCache.shopKey(id, 'view'));
        await RedisCache.delete(RedisCache.listKey('agent_shops'));
        // Invalidate shops cache (used for B2B/B2C availability in categories)
        await RedisCache.invalidateV2ApiCache('shops', null, {});
        console.log('🗑️  Invalidated shop caches after delete');
      } catch (err) {
        console.error('Redis cache invalidation error:', err);
      }

      res.json({ status: 'success', msg: 'Shop deleted successfully', data: null });
    } catch (error) {
      console.error('❌ deleteShop error:', error);
      res.status(500).json({ status: 'error', msg: 'Error deleting shop', data: null });
    }
  }
}

module.exports = AgentPanelController;
