const express = require('express');
const router = express.Router();
const { apiKeyCheck } = require('../../middleware/apiKeyMiddleware');
const { orderImageUpload } = require('../../utils/fileUpload');
const OrderController = require('../../controllers/orderController');

router.use(apiKeyCheck);

// ==================== ORDER ROUTES ====================
router.get('/order_details/:order_no', OrderController.orderDetails);
router.get('/customer_orders/:customer_id', OrderController.customerOrders);
router.get('/customer_pending_orders/:customer_id', OrderController.customerPendingOrders);
router.post('/cust_order_placeing', orderImageUpload.fields([
  { name: 'image1', maxCount: 1 },
  { name: 'image2', maxCount: 1 },
  { name: 'image3', maxCount: 1 },
  { name: 'image4', maxCount: 1 },
  { name: 'image5', maxCount: 1 },
  { name: 'image6', maxCount: 1 }
]), OrderController.custOrderPlacing);
router.post('/order_status_change', OrderController.orderStatusChange);
router.post('/custOrderRating', OrderController.custOrderRating);

module.exports = router;

