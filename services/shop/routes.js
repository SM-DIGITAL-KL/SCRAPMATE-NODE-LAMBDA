const express = require('express');
const router = express.Router();
const { apiKeyCheck } = require('../../middleware/apiKeyMiddleware');
const { shopImageUpload: shopImageUploadMulter, documentUpload: documentUploadMulter } = require('../../utils/fileUpload');
const ShopController = require('../../controllers/shopController');
const ProductController = require('../../controllers/productController');
const ShopTypeController = require('../../controllers/shopTypeController');
const V2B2BSignupController = require('../../controllers/v2B2BSignupController');

const shopImageUpload = shopImageUploadMulter.single('shop_img');
const v2DocumentUpload = documentUploadMulter;

// Request logging middleware for shop service
router.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`\n🏪 [SHOP SERVICE] ${req.method} ${req.path || req.url} [${timestamp}]`);
  console.log(`   Query:`, req.query);
  console.log(`   Params:`, req.params);
  console.log(`   Body keys:`, req.body ? Object.keys(req.body) : 'no body');
  if (req.file) {
    console.log(`   File: ${req.file.originalname} (${req.file.size} bytes)`);
  }
  next();
});

router.use(apiKeyCheck);

// ==================== SHOP ROUTES ====================
router.post('/shop_image_upload', shopImageUpload, ShopController.shopImageUpload);
router.get('/shop_image_delete/:id', ShopController.shopImageDelete);
router.get('/shop_image_list/:id', ShopController.shopImageList);
router.get('/shop_cat_list/:id', ShopController.shopCatList);
router.get('/shop_item_list/:shop_id/:cat_id', ProductController.shopItemList);
router.get('/shop_orders/:shop_id', ShopController.shopOrders);
router.get('/shop_orders/:shop_id/:status', ShopController.shopOrders);
router.get('/shop_orders/:shop_id/:status/:offset', ShopController.shopOrders);
router.get('/shop_dash_counts/:id', ShopController.shopDashCounts);
router.get('/shopReviews/:shop_id', ShopController.shopReviews);
router.post('/shops_list_for_sale', ShopController.shopsListForSale);
router.post('/shop_ads_type_edit', ShopController.shopAdsTypeEdit);

// ==================== V2 MOBILE SHOP TYPE ROUTES ====================
/**
 * GET /api/v2/shop-types
 * Get all available shop types
 */
router.get('/v2/shop-types', ShopTypeController.getShopTypes);

/**
 * GET /api/v2/user/dashboards/:userId
 * Get user's allowed dashboards based on shop type
 */
router.get('/v2/user/dashboards/:userId', ShopTypeController.getUserDashboards);

/**
 * POST /api/v2/user/validate-dashboard
 * Validate if user can access a specific dashboard
 */
router.post('/v2/user/validate-dashboard', ShopTypeController.validateDashboard);

/**
 * POST /api/v2/user/switch-dashboard
 * Switch user's current dashboard (B2B <-> B2C)
 */
router.post('/v2/user/switch-dashboard', ShopTypeController.switchDashboard);

// ==================== V2 MOBILE B2B SIGNUP ROUTES ====================
/**
 * POST /api/v2/b2b-signup/:userId/document
 * Upload B2B signup document
 */
router.post('/v2/b2b-signup/:userId/document', v2DocumentUpload.single('file'), V2B2BSignupController.uploadDocument);

/**
 * POST /api/v2/b2b-signup/:userId
 * Submit B2B business signup data
 */
router.post('/v2/b2b-signup/:userId', V2B2BSignupController.submitSignup);

module.exports = router;

