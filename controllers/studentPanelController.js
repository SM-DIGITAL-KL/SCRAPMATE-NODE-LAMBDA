const RedisCache = require('../utils/redisCache');

class StudentPanelController {
  static async students(req, res) {
    res.json({ status: 'success', msg: 'Students page', data: { pagename: 'Student' } });
  }

  static async getStudentById(req, res) {
    res.json({ status: 'success', msg: 'Student retrieved', data: null });
  }

  static async studentPayment(req, res) {
    res.json({ status: 'success', msg: 'Student payment page', data: { pagename: 'Student Payment' } });
  }

  static async studentActivation(req, res) {
    res.json({ status: 'success', msg: 'Student activation page', data: { pagename: 'Student Activation' } });
  }

  static async createStudent(req, res) {
    // Invalidate related caches when implemented
    try {
      await RedisCache.invalidateTableCache('students');
      await RedisCache.invalidateTableCache('users');
      console.log('🗑️  Invalidated student caches after create');
    } catch (err) {
      console.error('Redis cache invalidation error:', err);
    }
    res.json({ status: 'success', msg: 'Student created', data: null });
  }

  static async updateStudent(req, res) {
    const { id } = req.params;
    // Invalidate related caches when implemented
    try {
      await RedisCache.invalidateTableCache('students');
      await RedisCache.invalidateTableCache('users');
      await RedisCache.delete(RedisCache.listKey('student', { id }));
      console.log('🗑️  Invalidated student caches after update');
    } catch (err) {
      console.error('Redis cache invalidation error:', err);
    }
    res.json({ status: 'success', msg: 'Student updated', data: null });
  }
}

module.exports = StudentPanelController;

