const User = require('../models/User');
const RedisCache = require('../utils/redisCache');

class TestController {
  // Test FCM notification
  static async test1(req, res) {
    try {
      const { user_id } = req.body;

      if (!user_id) {
        return res.status(201).json({
          status: 'error',
          msg: 'empty param',
          data: ''
        });
      }

      const user = await User.findById(user_id);
      if (!user || !user.fcm_token) {
        return res.status(201).json({
          status: 'error',
          msg: 'empty Fcm token',
          data: ''
        });
      }

      // TODO: Implement FCM notification sending
      // For now, just return success
      res.json({
        status: 'success',
        msg: 'Successfull',
        data: ''
      });
    } catch (err) {
      console.error('Test1 error:', err);
      
      // Log failed job (DynamoDB doesn't have failed_jobs table)
      try {
        console.error('Failed job:', {
          connection: 'test1',
          queue: 'default',
          payload: req.body,
          exception: err.message,
          timestamp: new Date().toISOString()
        });
      } catch (logErr) {
        console.error('Failed to log failed job:', logErr);
      }

      res.status(201).json({
        status: 'error',
        msg: err.message,
        data: ''
      });
    }
  }

  // Test for map
  static async testformap(req, res) {
    try {
      // TODO: Implement map testing functionality
      res.json({
        status: 'success',
        msg: 'Map test',
        data: ''
      });
    } catch (err) {
      console.error('Test for map error:', err);
      res.status(201).json({
        status: 'error',
        msg: 'Test failed',
        data: ''
      });
    }
  }
}

module.exports = TestController;

