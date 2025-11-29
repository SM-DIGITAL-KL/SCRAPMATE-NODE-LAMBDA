const RedisCache = require('../utils/redisCache');

class CoursePanelController {
  static async coursesCategory(req, res) {
    res.json({ status: 'success', msg: 'Courses category page', data: { pagename: 'Courses Category' } });
  }

  static async courses(req, res) {
    res.json({ status: 'success', msg: 'Courses page', data: { pagename: 'Courses' } });
  }

  static async getCourseById(req, res) {
    res.json({ status: 'success', msg: 'Course retrieved', data: null });
  }

  static async courseReport(req, res) {
    res.json({ status: 'success', msg: 'Course report page', data: { pagename: 'Course Report' } });
  }

  static async subTopicList(req, res) {
    res.json({ status: 'success', msg: 'Sub topic list page', data: { pagename: 'Sub Topic List' } });
  }

  static async videos(req, res) {
    res.json({ status: 'success', msg: 'Videos page', data: { pagename: 'Videos' } });
  }

  static async notes(req, res) {
    res.json({ status: 'success', msg: 'Notes page', data: { pagename: 'Notes' } });
  }

  static async audios(req, res) {
    res.json({ status: 'success', msg: 'Audios page', data: { pagename: 'Audios' } });
  }

  static async assignment(req, res) {
    res.json({ status: 'success', msg: 'Assignment page', data: { pagename: 'Assignment' } });
  }

  static async createCategory(req, res) {
    // Invalidate related caches when implemented
    try {
      await RedisCache.invalidateTableCache('course_categories');
      console.log('🗑️  Invalidated course category caches after create');
    } catch (err) {
      console.error('Redis cache invalidation error:', err);
    }
    res.json({ status: 'success', msg: 'Category created', data: null });
  }

  static async createCourse(req, res) {
    // Invalidate related caches when implemented
    try {
      await RedisCache.invalidateTableCache('courses');
      console.log('🗑️  Invalidated course caches after create');
    } catch (err) {
      console.error('Redis cache invalidation error:', err);
    }
    res.json({ status: 'success', msg: 'Course created', data: null });
  }

  static async updateCourse(req, res) {
    const { id } = req.params;
    // Invalidate related caches when implemented
    try {
      await RedisCache.invalidateTableCache('courses');
      await RedisCache.delete(RedisCache.listKey('course', { id }));
      console.log('🗑️  Invalidated course caches after update');
    } catch (err) {
      console.error('Redis cache invalidation error:', err);
    }
    res.json({ status: 'success', msg: 'Course updated', data: null });
  }

  static async createSubject(req, res) {
    // Invalidate related caches when implemented
    try {
      await RedisCache.invalidateTableCache('subjects');
      console.log('🗑️  Invalidated subject caches after create');
    } catch (err) {
      console.error('Redis cache invalidation error:', err);
    }
    res.json({ status: 'success', msg: 'Subject created', data: null });
  }

  static async createTopic(req, res) {
    // Invalidate related caches when implemented
    try {
      await RedisCache.invalidateTableCache('topics');
      console.log('🗑️  Invalidated topic caches after create');
    } catch (err) {
      console.error('Redis cache invalidation error:', err);
    }
    res.json({ status: 'success', msg: 'Topic created', data: null });
  }

  static async createVideo(req, res) {
    // Invalidate related caches when implemented
    try {
      await RedisCache.invalidateTableCache('videos');
      console.log('🗑️  Invalidated video caches after create');
    } catch (err) {
      console.error('Redis cache invalidation error:', err);
    }
    res.json({ status: 'success', msg: 'Video created', data: null });
  }

  static async createNote(req, res) {
    // Invalidate related caches when implemented
    try {
      await RedisCache.invalidateTableCache('notes');
      console.log('🗑️  Invalidated note caches after create');
    } catch (err) {
      console.error('Redis cache invalidation error:', err);
    }
    res.json({ status: 'success', msg: 'Note created', data: null });
  }

  static async createAudio(req, res) {
    // Invalidate related caches when implemented
    try {
      await RedisCache.invalidateTableCache('audios');
      console.log('🗑️  Invalidated audio caches after create');
    } catch (err) {
      console.error('Redis cache invalidation error:', err);
    }
    res.json({ status: 'success', msg: 'Audio created', data: null });
  }

  static async createAssignment(req, res) {
    // Invalidate related caches when implemented
    try {
      await RedisCache.invalidateTableCache('assignments');
      console.log('🗑️  Invalidated assignment caches after create');
    } catch (err) {
      console.error('Redis cache invalidation error:', err);
    }
    res.json({ status: 'success', msg: 'Assignment created', data: null });
  }
}

module.exports = CoursePanelController;

