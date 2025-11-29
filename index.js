// For local development, use the Express app directly
// For Lambda deployment, use lambda.js handler
const app = require('./app');

// App is already configured in app.js

// 🚀 Start server
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log(`✅ Node.js API Server running on port ${PORT}`);
  console.log(`✅ Mobile App API: http://localhost:${PORT}/api`);
  console.log(`✅ Web Routes (Admin Panel): http://localhost:${PORT}/`);
  console.log(`✅ Admin Panel API: http://localhost:${PORT}/api`);
});

// Graceful shutdown handling
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err);
  console.error('   Error name:', err.name);
  console.error('   Error message:', err.message);
  console.error('   Error code:', err.code);
  console.error('   Stack:', err.stack);
  
  // Don't crash on database connection errors - these are handled by the pool
  if (err.code === 4031 || err.code === 'PROTOCOL_CONNECTION_LOST' || err.code === 'ECONNRESET') {
    console.log('⚠️  Database connection error detected, but server will continue running');
    console.log('   The connection pool will automatically reconnect on next query');
    return; // Don't exit, let the pool handle reconnection
  }
  
  // For other critical errors, exit gracefully
  console.error('⚠️  Critical error detected, shutting down gracefully...');
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(1);
  });
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise);
  console.error('   Reason:', reason);
  
  // Don't crash on database connection errors
  if (reason && (reason.code === 4031 || reason.code === 'PROTOCOL_CONNECTION_LOST' || reason.code === 'ECONNRESET')) {
    console.log('⚠️  Database connection error in promise, but server will continue running');
    return; // Don't exit, let the pool handle reconnection
  }
  
  // For other critical errors, exit gracefully
  console.error('⚠️  Critical promise rejection detected, shutting down gracefully...');
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(1);
  });
});

