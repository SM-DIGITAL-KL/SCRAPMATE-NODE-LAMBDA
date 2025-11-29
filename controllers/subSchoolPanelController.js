const RedisCache = require('../utils/redisCache');

class SubSchoolPanelController {
  static async subschools(req, res) {
    res.json({ status: 'success', msg: 'Subschools page', data: { pagename: 'Subschool' } });
  }

  static async getSubschoolById(req, res) {
    res.json({ status: 'success', msg: 'Subschool retrieved', data: null });
  }

  static async createSubschool(req, res) {
    // Invalidate related caches when implemented
    try {
      await RedisCache.invalidateTableCache('subschools');
      console.log('🗑️  Invalidated subschool caches after create');
    } catch (err) {
      console.error('Redis cache invalidation error:', err);
    }
    res.json({ status: 'success', msg: 'Subschool created', data: null });
  }

  static async updateSubschool(req, res) {
    const { id } = req.params;
    // Invalidate related caches when implemented
    try {
      await RedisCache.invalidateTableCache('subschools');
      await RedisCache.delete(RedisCache.listKey('subschool', { id }));
      console.log('🗑️  Invalidated subschool caches after update');
    } catch (err) {
      console.error('Redis cache invalidation error:', err);
    }
    res.json({ status: 'success', msg: 'Subschool updated', data: null });
  }
}

module.exports = SubSchoolPanelController;

