const User = require('../models/User');
const MarketplaceTenderRequest = require('../models/MarketplaceTenderRequest');

class V2MarketplaceTenderRequestController {
  static async createRequest(req, res) {
    try {
      const { user_id, requested_state, note } = req.body || {};
      if (!user_id || !requested_state) {
        return res.status(400).json({
          status: 'error',
          msg: 'Missing required fields: user_id and requested_state',
          data: null,
        });
      }

      const user = await User.findById(user_id);
      if (!user) {
        return res.status(404).json({
          status: 'error',
          msg: 'User not found',
          data: null,
        });
      }

      const existingActive = await MarketplaceTenderRequest.findActiveByUserAndState(user_id, requested_state);
      if (existingActive) {
        return res.status(400).json({
          status: 'error',
          msg: `Tender request already submitted for ${requested_state}. You can request again after it is fulfilled.`,
          data: existingActive,
        });
      }

      const saved = await MarketplaceTenderRequest.create({
        user_id,
        user_name: user.name || null,
        user_phone: user.mob_num || user.phone || null,
        user_type: user.user_type || 'M',
        requested_state,
        note,
        source: 'vendor_app',
        status: 'pending',
      });

      return res.json({
        status: 'success',
        msg: 'Tender request submitted successfully',
        data: saved,
      });
    } catch (error) {
      console.error('❌ V2MarketplaceTenderRequestController.createRequest error:', error);
      if (error.name === 'ResourceNotFoundException') {
        return res.status(500).json({
          status: 'error',
          msg: 'DynamoDB table marketplace_tender_requests does not exist',
          data: null,
        });
      }
      return res.status(500).json({
        status: 'error',
        msg: error.message || 'Internal server error',
        data: null,
      });
    }
  }

  static async getRequestsByUser(req, res) {
    try {
      const userId = req.query.user_id;
      if (!userId) {
        return res.status(400).json({
          status: 'error',
          msg: 'Missing required query param: user_id',
          data: [],
        });
      }

      const list = await MarketplaceTenderRequest.findByUserId(userId);
      return res.json({
        status: 'success',
        msg: 'Tender requests retrieved successfully',
        data: list,
      });
    } catch (error) {
      console.error('❌ V2MarketplaceTenderRequestController.getRequestsByUser error:', error);
      if (error.name === 'ResourceNotFoundException') {
        return res.json({
          status: 'success',
          msg: 'No tender requests found',
          data: [],
        });
      }
      return res.status(500).json({
        status: 'error',
        msg: 'Internal server error',
        data: [],
      });
    }
  }
}

module.exports = V2MarketplaceTenderRequestController;
