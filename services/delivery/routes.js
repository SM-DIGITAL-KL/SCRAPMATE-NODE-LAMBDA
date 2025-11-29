const express = require('express');
const router = express.Router();
const { apiKeyCheck } = require('../../middleware/apiKeyMiddleware');
const { deliveryBoyUpload: deliveryBoyUploadMulter } = require('../../utils/fileUpload');
const DeliveryBoyController = require('../../controllers/deliveryBoyController');

const deliveryBoyUpload = deliveryBoyUploadMulter.fields([
  { name: 'profile_img', maxCount: 1 },
  { name: 'licence_img_front', maxCount: 1 },
  { name: 'licence_img_back', maxCount: 1 }
]);

router.use(apiKeyCheck);

// ==================== DELIVERY BOY ROUTES ====================
router.post('/delv_boy_add', deliveryBoyUpload, DeliveryBoyController.delvBoyAdd);
router.get('/delivery_boy_list/:id', DeliveryBoyController.deliveryBoyList);
router.post('/delivery_boy_edit', deliveryBoyUpload, DeliveryBoyController.deliveryBoyEdit);
router.get('/delv_boy_delete/:deliveryBoyID/:shop_id', DeliveryBoyController.delvBoyDelete);
router.get('/delv_orders/:delv_boy_id', DeliveryBoyController.delvOrders);
router.get('/delv_completed_orders/:delv_boy_id', DeliveryBoyController.delvCompletedOrders);
router.get('/delv_boy_dash_counts/:id', DeliveryBoyController.delvBoyDashCounts);

module.exports = router;

