/**
 * Logs when high-RRU (DynamoDB Scan–heavy) API routes are hit.
 * Enable with: LOG_DYNAMODB_HIGH_RRU=1
 * Grep logs for "[DYNAMODB-HIGH-RRU]" to correlate with DynamoDB ConsumedReadCapacity spikes.
 * See docs/DYNAMODB_RRU_SCAN_AUDIT.md for full audit.
 */

const HIGH_RRU_PATHS = [
  { path: '/admin/customers', note: 'User.getCustomers Scan (users)' },
  { path: '/admin/dashboard', note: 'KPIs + charts, multiple Scans' },
  { path: '/admin/dashboard/kpis', note: 'User/Order counts Scan' },
  { path: '/admin/dashboard/charts', note: '6× User + 3× Order Scans' },
  { path: '/admin/dashboard/recent-orders', note: 'Order Scan' },
  { path: '/admin/dashboard/customer-app-orders', note: 'Order + User Scans' },
  { path: '/admin/dashboard/v2-user-types', note: 'User counts Scan' },
  { path: '/admin/b2b-users', note: 'User + Shop Scans' },
  { path: '/admin/b2c-users', note: 'Shop + User Scans' },
  { path: '/admin/signUpReport', note: 'User.getUsersByTypeAndDateRange Scan' },
  { path: '/admin/custNotification', note: 'User.findWithFcmToken Scan (users)' },
  { path: '/admin/vendorNotification', note: 'User.findWithFcmToken Scan (users)' },
  { path: '/admin/callLogSearch', note: 'CallLog / Order Scan' },
  { path: '/admin/getcallLogSearch', note: 'CallLog / Order Scan' },
  { path: '/admin/view_users', note: 'User Scan' },
  { path: '/admin/new-users', note: 'User Scan' },
  { path: '/admin/sr-users', note: 'User Scan' },
  { path: '/admin/delivery-users', note: 'User Scan' },
  { path: '/customer/orders', note: 'Order.getAll Scan (orders)' },
  { path: '/customer/view-orders', note: 'Order.getAll Scan (orders)' },
];

const HIGH_RRU_PATH_PREFIXES = [
  { prefix: '/admin/order/', suffix: '/add-nearby-n-users', note: 'Scan users (user_type N)' },
  { prefix: '/admin/order/', suffix: '/add-bulk-notified-vendors', note: 'Scan bulk_message_notifications + User/Order' },
  { prefix: '/admin/order/', suffix: '/add-nearby-d-users', note: 'Scan users (user_type D)' },
  { prefix: '/customer/recent-orders', suffix: '/', note: 'Order.findByCustomerId Scan (orders)' },
];

function pathOnly(req) {
  const raw = req.originalUrl || req.url || req.path || '';
  return raw.split('?')[0] || '';
}

function isHighRruRoute(req) {
  const path = pathOnly(req);

  for (const { path: p } of HIGH_RRU_PATHS) {
    if (path === p) return true;
  }
  for (const { prefix, suffix } of HIGH_RRU_PATH_PREFIXES) {
    if (path.startsWith(prefix) && path.includes(suffix)) return true;
  }
  return false;
}

function getHighRruNote(req) {
  const path = pathOnly(req);
  for (const { path: p, note } of HIGH_RRU_PATHS) {
    if (path === p) return note;
  }
  for (const { suffix, note } of HIGH_RRU_PATH_PREFIXES) {
    if (path.includes(suffix)) return note;
  }
  return 'DynamoDB Scan';
}

function dynamodbHighRruLogMiddleware(req, res, next) {
  if (process.env.LOG_DYNAMODB_HIGH_RRU !== '1' && process.env.LOG_DYNAMODB_HIGH_RRU !== 'true') {
    return next();
  }
  if (!isHighRruRoute(req)) {
    return next();
  }
  const full = pathOnly(req);
  const raw = req.originalUrl || req.url || '';
  const qs = raw.includes('?') ? '?' + raw.split('?')[1] : '';
  const note = getHighRruNote(req);
  console.log(
    `[DYNAMODB-HIGH-RRU] ${req.method} ${full}${qs} | ${note} | ${new Date().toISOString()}`
  );
  next();
}

module.exports = { dynamodbHighRruLogMiddleware, isHighRruRoute, getHighRruNote };
