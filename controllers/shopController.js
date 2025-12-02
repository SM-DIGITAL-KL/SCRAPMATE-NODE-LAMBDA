const Shop = require('../models/Shop');
const ShopImages = require('../models/ShopImages');
const ProductCategory = require('../models/ProductCategory');
const Product = require('../models/Product');
const Order = require('../models/Order');
const OrderRatings = require('../models/OrderRatings');
const path = require('path');
const fs = require('fs');
const { getFileSize, deleteFile } = require('../utils/fileUpload');
const RedisCache = require('../utils/redisCache');

class ShopController {
  // Shop image upload
  static async shopImageUpload(req, res) {
    try {
      const { shop_id } = req.body;
      const shopImg = req.file;

      if (!shopImg || !shop_id) {
        return res.status(201).json({
          status: 'error',
          msg: 'empty param',
          data: ''
        });
      }

      const uploadPath = path.join(__dirname, '../public/assets/images/shopimages');
      const filename = shopImg.filename;
      const filePath = path.join(uploadPath, filename);
      const fileSize = getFileSize(filePath);

      const shopImage = await ShopImages.create({
        shop_id: shop_id,
        shop_img: filename,
        filesize: fileSize
      });

      const uploadedFile = {
        id: shopImage.id,
        filename: `${req.protocol}://${req.get('host')}/assets/images/shopimages/${filename}`,
        fileSize: fileSize
      };

      // Invalidate shop images cache
      await RedisCache.delete(RedisCache.shopKey(shop_id, 'images'));

      res.json({
        status: 'success',
        msg: 'Image Upload Successfully',
        data: uploadedFile
      });
    } catch (err) {
      console.error('Shop image upload error:', err);
      res.status(201).json({
        status: 'error',
        msg: 'Upload failed',
        data: ''
      });
    }
  }

  // Shop image delete
  static async shopImageDelete(req, res) {
    try {
      const { id } = req.params;

      const shopImage = await ShopImages.findById(id);
      if (!shopImage) {
        return res.status(201).json({
          status: 'error',
          msg: 'Image Not Found',
          data: ''
        });
      }

      const imagePath = path.join(__dirname, '../public/assets/images/shopimages', shopImage.shop_img);
      deleteFile(imagePath);

      await ShopImages.delete(id);

      // Invalidate shop images cache
      try {
        if (shopImage.shop_id) {
          await RedisCache.delete(RedisCache.shopKey(shopImage.shop_id, 'images'));
          console.log(`🗑️  Invalidated shop images cache for shop_id: ${shopImage.shop_id}`);
        }
      } catch (redisErr) {
        console.error('Redis cache invalidation error:', redisErr);
      }

      res.json({
        status: 'success',
        msg: 'Image Delete Successfully',
        data: ''
      });
    } catch (err) {
      console.error('Shop image delete error:', err);
      res.status(201).json({
        status: 'error',
        msg: 'Delete failed',
        data: ''
      });
    }
  }

  // Shop image list
  static async shopImageList(req, res) {
    try {
      const { id } = req.params;

      if (!id) {
        return res.status(201).json({
          status: 'error',
          msg: 'empty param',
          data: ''
        });
      }

      // Check Redis cache first
      const cacheKey = RedisCache.shopKey(id, 'images');
      const cached = await RedisCache.get(cacheKey);
      if (cached) {
        return res.json({
          status: 'success',
          msg: 'Shop images',
          data: cached
        });
      }

      const images = await ShopImages.findByShopId(id);
      if (images.length === 0) {
        return res.status(201).json({
          status: 'error',
          msg: 'Shop Image Not Found',
          data: ''
        });
      }

      const imageList = images.map(img => ({
        ...img,
        shop_img: `${req.protocol}://${req.get('host')}/assets/images/shopimages/${img.shop_img}`
      }));

      // Cache for 1 hour
      await RedisCache.set(cacheKey, imageList, '365days');

      res.json({
        status: 'success',
        msg: 'Shop Image List',
        data: imageList
      });
    } catch (err) {
      console.error('Shop image list error:', err);
      res.status(201).json({
        status: 'error',
        msg: 'Failed to fetch images',
        data: ''
      });
    }
  }

  // Shop category list
  static async shopCatList(req, res) {
    try {
      const { id } = req.params;

      if (!id) {
        return res.status(201).json({
          status: 'error',
          msg: 'empty param',
          data: ''
        });
      }

      // Check Redis cache first (only if previously successful)
      const cacheKey = RedisCache.listKey('shop_categories', { shop_id: id });
      const cached = await RedisCache.get(cacheKey);
      if (cached) {
        return res.json({
          status: 'success',
          msg: 'Shop category list',
          data: cached
        });
      }

      const categories = await ProductCategory.findByShopId(id);
      
      // Add item count for each category
      const categoriesWithCount = await Promise.all(
        categories.map(async (cat) => {
          const itemCount = await Product.countByCategoryId(cat.id);
          return {
            ...cat,
            items_count: itemCount
          };
        })
      );

      // Cache the result only on success (1 hour TTL)
      try {
        await RedisCache.set(cacheKey, categoriesWithCount, '365days');
        console.log(`💾 Redis cache set for shop categories: ${cacheKey}`);
      } catch (redisErr) {
        console.error('Redis cache error:', redisErr);
        // Continue even if Redis fails
      }

      res.json({
        status: 'success',
        msg: 'Shop Category List',
        data: categoriesWithCount
      });
    } catch (err) {
      console.error('Shop category list error:', err);
      res.status(201).json({
        status: 'error',
        msg: 'Failed to fetch categories',
        data: ''
      });
    }
  }

  // Shop item list
  static async shopItemList(req, res) {
    try {
      const { shop_id, cat_id } = req.params;

      if (!shop_id || !cat_id) {
        return res.status(201).json({
          status: 'error',
          msg: 'empty param',
          data: ''
        });
      }

      const items = await Product.findByShopId(shop_id, cat_id);

      res.json({
        status: 'success',
        msg: items.length > 0 ? 'Successfull' : 'Empty List',
        data: items
      });
    } catch (err) {
      console.error('Shop item list error:', err);
      res.status(201).json({
        status: 'error',
        msg: 'Failed to fetch items',
        data: ''
      });
    }
  }

  // Shop orders
  static async shopOrders(req, res) {
    try {
      const { shop_id, status, offset } = req.params;
      const offsetValue = offset ? parseInt(offset) : 0;

      if (!shop_id) {
        return res.status(400).json({
          status: 'error',
          msg: 'empty param',
          data: ''
        });
      }

      // Check Redis cache first
      const cacheKey = RedisCache.listKey('shop_orders', { shop_id, status: status || 'all', offset });
      const cached = await RedisCache.get(cacheKey);
      if (cached) {
        return res.json({
          status: 'success',
          msg: 'Successful',
          data: cached
        });
      }

      const orders = await Order.findByShopId(shop_id, status || null, offsetValue, 10);

      if (orders.length === 0) {
        return res.status(200).json({
          status: 'error',
          msg: 'Not found',
          data: ''
        });
      }

      // Format image URLs - use getImageUrl helper to handle S3 URLs properly
      const { getImageUrl } = require('../utils/imageHelper');
      const formattedOrders = await Promise.all(orders.map(async (order) => {
        const formatted = { ...order };
        for (let i = 1; i <= 6; i++) {
          const imageField = `image${i}`;
          if (formatted[imageField]) {
            // Check if already a full URL (S3 or external)
            if (formatted[imageField].startsWith('http://') || formatted[imageField].startsWith('https://')) {
              // If it's an S3 URL, convert to presigned URL, otherwise use as-is
              formatted[imageField] = await getImageUrl(formatted[imageField], 'order');
            } else {
              // Local path - prepend base URL (legacy support)
              formatted[imageField] = `${req.protocol}://${req.get('host')}/assets/images/order/${formatted[imageField]}`;
            }
          } else {
            formatted[imageField] = null;
          }
        }
        return formatted;
      }));

      // Cache for 2 minutes (orders change frequently)
      await RedisCache.set(cacheKey, formattedOrders, '365days');

      res.json({
        status: 'success',
        msg: 'Successful',
        data: formattedOrders
      });
    } catch (err) {
      console.error('Shop orders error:', err);
      res.status(201).json({
        status: 'error',
        msg: 'Failed to fetch orders',
        data: ''
      });
    }
  }

  // Shop dashboard counts
  static async shopDashCounts(req, res) {
    try {
      const { id } = req.params;

      if (!id) {
        return res.status(201).json({
          status: 'error',
          msg: 'empty param',
          data: ''
        });
      }

      // Check Redis cache first
      const cacheKey = RedisCache.dashboardKey('shop', id);
      const cached = await RedisCache.get(cacheKey);
      if (cached) {
        return res.json({
          status: 'success',
          msg: 'Successfull',
          data: cached
        });
      }

      const shop = await Shop.findById(id);
      if (!shop) {
        return res.status(201).json({
          status: 'error',
          msg: 'Shop not found',
          data: ''
        });
      }

      // Get all counts using model methods
      const ProductCategory = require('../models/ProductCategory');
      const Product = require('../models/Product');
      
      const shopCategoryCount = await ProductCategory.getCountByShopId(id);
      const shopItemCount = await Product.getCountByShopId(id);
      const totalOrders = await Order.getCountByShopId(id);
      const pendingOrders = await Order.getCountByShopIdAndStatus(id, 1);
      const shopAcceptedOrders = await Order.getCountByShopIdAndStatus(id, 2);
      const pickupmanOrders = await Order.getCountByShopIdAndStatus(id, 3);
      const completedOrders = await Order.getCountByShopIdAndStatus(id, 4);
      const cancelledOrders = await Order.getCountByShopIdAndStatus(id, 5);
      const customersCount = await Order.getDistinctCustomerCountByShopId(id);

      // Monthly orders count and amount for current year
      const monthlyOrders = await Order.getMonthlyOrdersByShopId(id, 4);

      const months = ['January', 'February', 'March', 'April', 'May', 'June', 
                     'July', 'August', 'September', 'October', 'November', 'December'];
      const monthlyOrdersCount = {};
      const monthlyOrderAmount = {};
      
      months.forEach(month => {
        monthlyOrdersCount[month] = 0;
        monthlyOrderAmount[month] = 0;
      });

      monthlyOrders.forEach(row => {
        const monthName = months[row.month - 1];
        monthlyOrdersCount[monthName] = row.count;
        monthlyOrderAmount[monthName] = parseInt(row.amount) || 0;
      });

      // Get subscription balance
      const Package = require('../models/Package');
      const Invoice = require('../models/Invoice');
      const userId = shop.user_id;
      const latestInvoice = await Invoice.findLatestByUserId(userId);

      let subscription = '0 Days';
      if (latestInvoice) {
        const today = new Date();
        const toDate = new Date(latestInvoice.to_date);
        if (toDate >= today) {
          const diffTime = toDate - today;
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          subscription = `${diffDays} Days`;
        }
      }

      // Check and set package if needed
      await Package.setPackage(userId);

      const data = {
        shop_category_count: shopCategoryCount,
        shop_item_count: shopItemCount,
        total_oders: totalOrders,
        pending_orders: pendingOrders,
        shop_accepted_orders: shopAcceptedOrders,
        pickupman_orders: pickupmanOrders,
        completed_orders: completedOrders,
        cancelled_orders: cancelledOrders,
        customers_count: customersCount,
        monthly_orders_count: monthlyOrdersCount,
        monthly_order_amount: monthlyOrderAmount,
        subscrption: subscription
      };

      // Cache for 365 days (dashboard data cached, invalidated on order changes)
      await RedisCache.set(cacheKey, data, '365days');

      res.json({
        status: 'success',
        msg: 'Successfull',
        data: data
      });
    } catch (err) {
      console.error('Shop dashboard counts error:', err);
      res.status(201).json({
        status: 'error',
        msg: 'Failed to fetch counts',
        data: ''
      });
    }
  }

  // Shop reviews
  static async shopReviews(req, res) {
    try {
      const { shop_id } = req.params;

      if (!shop_id) {
        return res.status(201).json({
          status: 'error',
          msg: 'empty param',
          data: ''
        });
      }

      // Check Redis cache first (only if previously successful)
      const cacheKey = RedisCache.shopKey(shop_id, 'reviews');
      const cached = await RedisCache.get(cacheKey);
      if (cached) {
        return res.json({
          status: 'success',
          msg: 'Shop reviews',
          data: cached
        });
      }

      const reviews = await OrderRatings.findByShopId(shop_id);

      // Cache the result only on success (1 hour TTL)
      try {
        await RedisCache.set(cacheKey, reviews, '30days');
        console.log(`💾 Redis cache set for shop reviews: ${cacheKey}`);
      } catch (redisErr) {
        console.error('Redis cache error:', redisErr);
        // Continue even if Redis fails
      }

      res.json({
        status: 'success',
        msg: 'Shop reviews',
        data: reviews
      });
    } catch (err) {
      console.error('Shop reviews error:', err);
      res.status(201).json({
        status: 'error',
        msg: 'Failed to fetch reviews',
        data: ''
      });
    }
  }

  // Shops list for sale (with distance calculation)
  static async shopsListForSale(req, res) {
    try {
      const { lat_log, category } = req.body;
      const matchRadius = 15; // km
      const apiKey = process.env.APP_GOOGLE_API_KEY;

      if (!lat_log) {
        return res.status(201).json({
          status: 'error',
          msg: 'empty param',
          data: ''
        });
      }

      const [refLat, refLng] = lat_log.split(',').map(Number);

      // Process category filter if provided
      let shopIds = [];
      if (category) {
        const categories = category.split(',');
        let shopCate = [];

        for (const cat of categories) {
          // Use ProductCategory model to find shops by category name
          const allCategories = await ProductCategory.getAll();
          const catShops = allCategories.filter(pc => pc.cat_name === cat);
          const catShopIds = catShops.map(s => s.shop_id);

          if (shopCate.length === 0) {
            shopCate = catShopIds;
          } else {
            shopCate = shopCate.filter(id => catShopIds.includes(id));
          }
        }

        if (shopCate.length === 0) {
          return res.status(201).json({
            status: 'error',
            msg: 'Shops Not Found in these categories',
            data: ''
          });
        }

        shopIds = shopCate;
      }

      // Get nearby shops with distance calculation using model method
      const shops = await Shop.getShopsByLocation(refLat, refLng, matchRadius, shopIds);

      console.log(`✅ Found ${shops.length} nearby shop(s)`);

      // Format shop data with full details and image URLs
      const { getImageUrl } = require('../utils/imageHelper');
      const shopList = await Promise.all(shops.map(async (shop) => {
        // Format profile image URL
        let imageUrl = '';
        const profilePhoto = shop.profile_photo || shop.shop_img || '';
        if (profilePhoto) {
          imageUrl = await getImageUrl(profilePhoto, 'shop');
        }

        // Return full shop details
        // Convert contact to string (it might be stored as number in DynamoDB)
        let contactValue = '';
        if (shop.contact !== undefined && shop.contact !== null) {
          contactValue = String(shop.contact);
        } else if (shop.mob_number !== undefined && shop.mob_number !== null) {
          contactValue = String(shop.mob_number);
        }
        
        return {
          id: shop.id,
          shopname: shop.shopname || shop.shop_name || '',
          contact: contactValue,
          address: shop.address || '',
          image: imageUrl,
          lat_log: shop.lat_log || '',
          distance: `${shop.distance.toFixed(2)} km`,
          ownername: shop.ownername || shop.owner_name || '',
          email: shop.email || '',
          location: shop.location || '',
          state: shop.state || '',
          place: shop.place || '',
          pincode: shop.pincode || '',
          shop_type: shop.shop_type || '',
          language: shop.language || 1,
          user_id: shop.user_id || null
        };
      }));

      console.log(`✅ Returning ${shopList.length} shop(s) with full details`);

      res.json({
        status: 'success',
        msg: 'Data retrieved',
        data: shopList
      });
    } catch (err) {
      console.error('Shops list error:', err);
      
      // Log failed job (DynamoDB doesn't have failed_jobs table)
      try {
        console.error('Failed job:', {
          connection: 'shops_list_for_sale',
          queue: 'default',
          payload: req.body,
          exception: err.message,
          timestamp: new Date().toISOString()
        });
      } catch (logErr) {
        console.error('Failed to log failed job:', logErr);
      }

      res.status(500).json({
        status: 'error',
        msg: 'Failed to fetch nearby shops',
        error: err.message
      });
    }
  }

  // Shop ads type edit
  static async shopAdsTypeEdit(req, res) {
    try {
      const { shop_id, address, lat_log } = req.body;

      if (!shop_id) {
        return res.status(201).json({
          status: 'error',
          msg: 'empty param',
          data: ''
        });
      }

      const shop = await Shop.findById(shop_id);
      if (!shop) {
        return res.status(201).json({
          status: 'error',
          msg: 'Shop not found',
          data: ''
        });
      }

      const updateData = {};
      if (address !== undefined) updateData.address = address;
      if (lat_log !== undefined) updateData.lat_log = lat_log;

      await Shop.update(shop_id, updateData);

      const updatedShop = await Shop.findById(shop_id);

      // Invalidate user profile cache after shop update
      try {
        if (updatedShop && updatedShop.user_id) {
          const userId = String(updatedShop.user_id);
          await RedisCache.delete(RedisCache.userKey(userId, 'profile'));
          await RedisCache.delete(RedisCache.userKey(userId));
          await RedisCache.delete(RedisCache.listKey('user_by_id', { user_id: userId, table: 'shops' }));
        }
      } catch (redisErr) {
        console.error('Redis cache invalidation error:', redisErr);
        // Continue even if Redis fails
      }

      res.status(200).json({
        status: 'success',
        msg: 'Successfull',
        data: updatedShop
      });
    } catch (err) {
      console.error('Shop ads type edit error:', err);
      res.status(201).json({
        status: 'error',
        msg: 'Update failed',
        data: ''
      });
    }
  }
}

module.exports = ShopController;

