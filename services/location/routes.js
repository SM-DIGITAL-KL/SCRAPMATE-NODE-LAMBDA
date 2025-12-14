/**
 * Location Tracking Routes
 * V2 API routes for real-time location tracking
 */

const express = require('express');
const router = express.Router();
const { apiKeyCheck } = require('../../middleware/apiKeyMiddleware');
const LocationController = require('./locationController');

// All routes require API key
router.use(apiKeyCheck);

/**
 * POST /api/v2/location/update
 * Update current location of pickup vendor (R, S, D, SR)
 * Body: {
 *   user_id: number,
 *   user_type: 'R' | 'S' | 'D' | 'SR',
 *   latitude: number,
 *   longitude: number,
 *   order_id?: number (optional, if tracking specific order)
 * }
 */
router.post('/update', LocationController.updateLocation);

/**
 * GET /api/v2/location/:userId
 * Get current location of a pickup vendor
 * Query params: ?user_type=R|S|D|SR&order_id=number (optional)
 * 
 * Returns:
 * {
 *   user_id: number,
 *   user_type: string,
 *   latitude: number,
 *   longitude: number,
 *   timestamp: string,
 *   order_id?: number
 * }
 */
router.get('/:userId', LocationController.getLocation);

/**
 * GET /api/v2/location/order/:orderId
 * Get location of vendor assigned to specific order
 * 
 * Returns:
 * {
 *   order_id: number,
 *   vendor: {
 *     user_id: number,
 *     user_type: string,
 *     latitude: number,
 *     longitude: number,
 *     timestamp: string
 *   }
 * }
 */
router.get('/order/:orderId', LocationController.getLocationByOrder);

/**
 * DELETE /api/v2/location/:userId
 * Clear location cache for a vendor (when pickup is complete)
 * Query params: ?user_type=R|S|D|SR&order_id=number (optional)
 */
router.delete('/:userId', LocationController.clearLocation);

module.exports = router;



