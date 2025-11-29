const express = require('express');
const router = express.Router();
const { apiKeyCheck } = require('../../middleware/apiKeyMiddleware');
const NotificationController = require('../../controllers/notificationController');

router.use(apiKeyCheck);

// ==================== NOTIFICATION ROUTES ====================
router.get('/noti_by_id/:id', NotificationController.notiById);
router.get('/noti_by_id/:id/:offset', NotificationController.notiById);
router.post('/notif_read', NotificationController.notifRead);

module.exports = router;

