const bcrypt = require('bcryptjs');

// Middleware to authenticate web users (session-based, similar to Laravel's authusers)
const authenticateWebUser = (req, res, next) => {
  // Skip authentication for API routes - they have their own authentication
  // Also skip for login/logout routes
  if (req.path.startsWith('/api') || 
      req.path === '/login' || 
      req.path === '/dologin' || 
      req.path === '/logout' ||
      req.path === '/') {
    return next();
  }

  // Check if user is authenticated via session
  if (req.session && req.session.userId && req.session.userType) {
    // User is authenticated, attach user info to request
    req.user = {
      id: req.session.userId,
      email: req.session.userEmail,
      user_type: req.session.userType,
      name: req.session.userName
    };
    return next();
  }

  // For API requests (JSON), allow them through but log warning
  // API routes should handle their own authentication
  if (req.headers['content-type'] === 'application/json' || req.accepts('json')) {
    console.log('⚠️  API route accessed without session:', req.path);
    // Still allow through - API routes should handle auth themselves
    return next();
  }

  // Otherwise redirect to login page (for web UI)
  return res.redirect('/login');
};

module.exports = { authenticateWebUser };

