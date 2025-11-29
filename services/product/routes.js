const express = require('express');
const router = express.Router();
const { apiKeyCheck } = require('../../middleware/apiKeyMiddleware');
const { categoryImageUpload: categoryImageUploadMulter } = require('../../utils/fileUpload');
const ProductController = require('../../controllers/productController');

const categoryImageUpload = categoryImageUploadMulter.single('cat_img');

router.use(apiKeyCheck);

// ==================== PRODUCT/CATEGORY ROUTES ====================
router.post('/shop_cat_create', ProductController.shopCatCreate);
router.post('/shop_cat_edit', categoryImageUpload, ProductController.shopCatEdit);
router.get('/shop_cat_delete/:id', ProductController.shopCatDelete);
router.get('/all_pro_category', ProductController.allProCategory);
router.get('/category_img_list', ProductController.categoryImgList);
router.post('/shop_item_create', ProductController.shopItemCreate);
router.post('/shop_item_edit/:id', ProductController.shopItemEdit);
router.get('/shop_item_delete/:id', ProductController.shopItemDelete);
router.post('/items_list_for_sale', ProductController.itemsListForSale);

module.exports = router;

