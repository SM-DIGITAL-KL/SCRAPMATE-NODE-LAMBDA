const User = require('../models/User');
const MarketplacePostInterest = require('../models/MarketplacePostInterest');

class V2MarketplaceInterestController {
  static async markInterested(req, res) {
    try {
      const {
        user_id,
        post_id,
        post_type,
        owner_id,
        owner_name,
        post_title,
        post_location,
        post_price,
        post_star,
        post_image,
        post_snapshot,
      } = req.body || {};

      if (!user_id || !post_id) {
        return res.status(400).json({
          status: 'error',
          msg: 'Missing required fields: user_id and post_id',
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

      const saved = await MarketplacePostInterest.createOrUpdate({
        user_id,
        user_name: user.name || null,
        user_phone: user.mob_num || user.phone || null,
        post_id,
        post_type,
        owner_id,
        owner_name,
        post_title,
        post_location,
        post_price,
        post_star,
        post_image,
        post_snapshot,
      });

      return res.json({
        status: 'success',
        msg: 'Marked as interested',
        data: saved,
      });
    } catch (error) {
      console.error('❌ V2MarketplaceInterestController.markInterested error:', error);
      if (error.name === 'ResourceNotFoundException') {
        return res.status(500).json({
          status: 'error',
          msg: 'DynamoDB table marketplace_post_interests does not exist',
          data: null,
        });
      }
      return res.status(500).json({
        status: 'error',
        msg: 'Internal server error',
        data: null,
      });
    }
  }

  static async getInterestedPosts(req, res) {
    try {
      const userId = req.query.user_id;
      if (!userId) {
        return res.status(400).json({
          status: 'error',
          msg: 'Missing required query param: user_id',
          data: [],
        });
      }

      const list = await MarketplacePostInterest.findByUserId(userId);
      return res.json({
        status: 'success',
        msg: 'Interested posts retrieved successfully',
        data: list,
      });
    } catch (error) {
      console.error('❌ V2MarketplaceInterestController.getInterestedPosts error:', error);
      if (error.name === 'ResourceNotFoundException') {
        return res.json({
          status: 'success',
          msg: 'No interested posts found',
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

module.exports = V2MarketplaceInterestController;
