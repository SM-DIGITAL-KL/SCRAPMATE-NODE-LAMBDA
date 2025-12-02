const express = require('express');
const router = express.Router();
const { apiKeyCheck } = require('../../middleware/apiKeyMiddleware');
const UtilityController = require('../../controllers/utilityController');

// Request logging middleware for utility service
router.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`\n🔧 [UTILITY SERVICE] ${req.method} ${req.path || req.url} [${timestamp}]`);
  console.log(`   Query:`, req.query);
  console.log(`   Params:`, req.params);
  console.log(`   Body keys:`, req.body ? Object.keys(req.body) : 'no body');
  next();
});

router.use(apiKeyCheck);

// ==================== UTILITY ROUTES ====================
router.post('/get_table', UtilityController.getTable);
router.post('/get_table_condition', UtilityController.getTableCondition);
router.get('/count_row/:table_name', UtilityController.countRow);
router.get('/keyword_search/:table/:name', UtilityController.keywordSearch);
router.get('/get_user_by_id/:user_id/:table', UtilityController.getUserById);
router.get('/get_all_tables', UtilityController.getAllTables);
router.post('/savecallLog', UtilityController.savecallLog);
router.post('/savecallLogCust', UtilityController.savecallLogCust);
router.post('/searchShopCallLogSave', UtilityController.searchShopCallLogSave);
router.get('/stateAllow', UtilityController.stateAllow);
router.get('/packagesSub', UtilityController.packagesSub);
router.post('/saveUserPackages', UtilityController.saveUserPackages);
router.post('/paymentHistory', UtilityController.paymentHistory);
router.get('/thirdPartyCredentials', UtilityController.thirdPartyCredentials);
router.get('/versionCheck/:version', UtilityController.versionCheck);
router.get('/smstesting', UtilityController.smstesting);
router.post('/PermanentDelete', UtilityController.permanentDelete);
router.post('/failedJobs', UtilityController.failedJobs);
router.post('/clear_redis_cache', UtilityController.clearRedisCache);
router.get('/metrics', UtilityController.getMetrics);

module.exports = router;

