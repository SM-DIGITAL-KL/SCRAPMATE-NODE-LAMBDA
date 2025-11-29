const RedisCache = require('../utils/redisCache');

class ExamPanelController {
  static async exams(req, res) {
    res.json({ status: 'success', msg: 'Exams page', data: { pagename: 'Exams' } });
  }

  static async getExamById(req, res) {
    res.json({ status: 'success', msg: 'Exam retrieved', data: null });
  }

  static async questions(req, res) {
    res.json({ status: 'success', msg: 'Questions page', data: { pagename: 'Questions' } });
  }

  static async assessment(req, res) {
    res.json({ status: 'success', msg: 'Assessment page', data: { pagename: 'Assessment' } });
  }

  static async createExam(req, res) {
    // Invalidate related caches when implemented
    try {
      await RedisCache.invalidateTableCache('exams');
      console.log('🗑️  Invalidated exam caches after create');
    } catch (err) {
      console.error('Redis cache invalidation error:', err);
    }
    res.json({ status: 'success', msg: 'Exam created', data: null });
  }

  static async updateExam(req, res) {
    const { id } = req.params;
    // Invalidate related caches when implemented
    try {
      await RedisCache.invalidateTableCache('exams');
      await RedisCache.delete(RedisCache.listKey('exam', { id }));
      console.log('🗑️  Invalidated exam caches after update');
    } catch (err) {
      console.error('Redis cache invalidation error:', err);
    }
    res.json({ status: 'success', msg: 'Exam updated', data: null });
  }

  static async createQuestion(req, res) {
    // Invalidate related caches when implemented
    try {
      await RedisCache.invalidateTableCache('questions');
      console.log('🗑️  Invalidated question caches after create');
    } catch (err) {
      console.error('Redis cache invalidation error:', err);
    }
    res.json({ status: 'success', msg: 'Question created', data: null });
  }

  static async updateQuestion(req, res) {
    // Invalidate related caches when implemented
    try {
      await RedisCache.invalidateTableCache('questions');
      console.log('🗑️  Invalidated question caches after update');
    } catch (err) {
      console.error('Redis cache invalidation error:', err);
    }
    res.json({ status: 'success', msg: 'Question updated', data: null });
  }

  static async importQuestions(req, res) {
    // Invalidate related caches when implemented
    try {
      await RedisCache.invalidateTableCache('questions');
      console.log('🗑️  Invalidated question caches after import');
    } catch (err) {
      console.error('Redis cache invalidation error:', err);
    }
    res.json({ status: 'success', msg: 'Questions imported', data: null });
  }
}

module.exports = ExamPanelController;

