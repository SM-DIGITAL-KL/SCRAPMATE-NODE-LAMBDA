/**
 * DynamoDB Table Name Utility
 * 
 * This utility provides environment-aware table names.
 * Tables are prefixed with environment name (dev/prod) to separate development and production data.
 * 
 * Usage:
 *   const { getTableName } = require('../utils/dynamodbTableNames');
 *   const tableName = getTableName('users'); // Returns 'dev_users' or 'users' based on NODE_ENV
 */

/**
 * Get the current environment
 * @returns {string} 'dev' or 'prod' (defaults to 'prod' for safety)
 */
function getEnvironment() {
  const env = process.env.NODE_ENV || process.env.ENVIRONMENT || 'prod';
  
  // Normalize environment names
  if (env.toLowerCase() === 'development' || env.toLowerCase() === 'dev') {
    return 'dev';
  }
  
  // Default to 'prod' for production, staging, or any other environment
  return 'prod';
}

/**
 * Get table name with environment prefix
 * @param {string} baseTableName - Base table name (e.g., 'users', 'orders')
 * @param {string} env - Optional environment override ('dev' or 'prod')
 * @returns {string} Environment-prefixed table name
 */
function getTableName(baseTableName, env = null) {
  const environment = env || getEnvironment();
  
  // Production tables don't need prefix (backward compatibility)
  if (environment === 'prod') {
    return baseTableName;
  }
  
  // Development tables get 'dev_' prefix
  if (environment === 'dev') {
    return `dev_${baseTableName}`;
  }
  
  // For other environments, use the environment name as prefix
  return `${environment}_${baseTableName}`;
}

/**
 * Get all table names for the current environment
 * @returns {Object} Object mapping base table names to environment-specific names
 */
function getAllTableNames() {
  const baseTables = [
    'users',
    'shops',
    'orders',
    'products',
    'product_category',
    'customer',
    'delivery_boy',
    'admin_profile',
    'bulk_scrap_requests',
    'bulk_sell_requests',
    'pending_bulk_buy_orders',
    'subscription_packages',
    'invoice',
    'order_location_history',
    'subcategory',
    'category_img_keywords',
    'addresses',
    'packages',
    'call_logs',
    'user_admins',
    'shop_images',
    'per_pages',
    'order_rating',
    'notifications'
  ];
  
  const tableMap = {};
  baseTables.forEach(table => {
    tableMap[table] = getTableName(table);
  });
  
  return tableMap;
}

/**
 * Check if we're in development environment
 * @returns {boolean}
 */
function isDevelopment() {
  return getEnvironment() === 'dev';
}

/**
 * Check if we're in production environment
 * @returns {boolean}
 */
function isProduction() {
  return getEnvironment() === 'prod';
}

module.exports = {
  getTableName,
  getAllTableNames,
  getEnvironment,
  isDevelopment,
  isProduction
};

