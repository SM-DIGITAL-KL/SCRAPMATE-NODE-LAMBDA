# DynamoDB RRU / Scan Audit – APIs Causing High Read Capacity

This document maps **which APIs use DynamoDB Scan** (and other heavy reads) and are likely driving **high RRU (Read Request Units)**. Scan reads **every item** in a table; FilterExpression only filters results—**RRU is still consumed for all scanned items**.

---

## Summary: Highest RRU Impact (Scan-Based APIs)

| Priority | API Route | Controller Method | DynamoDB Usage | Tables Scanned | When Called |
|----------|-----------|-------------------|----------------|----------------|-------------|
| **1** | `GET /admin/customers` | `AdminController.customers` | `User.getCustomers(1, 999999)` | **users** (full) | Users DataTable load, search; PHP `view_users_customers` fetches 99k |
| **2** | `GET /admin/dashboard/charts` | `dashboardCharts` | 6× `User.getMonthlyCountByUserType` + 3× `Order.getMonthly*` | **users** (×6), **orders** (×3) | Dashboard charts; **9 full Scans per request** |
| **3** | `GET /admin/dashboard` (legacy) | `dashboard` | Same as charts + KPIs | **users**, **orders** | Legacy dashboard |
| **4** | `GET /admin/dashboard/kpis` | `dashboardKPIs` | User/Order counts | **users**, **orders** | Dashboard KPIs |
| **5** | `GET /admin/b2b-users` | `b2bUsers` / `getB2BUsers` | `User.getB2BUsers(1, 999999)` | **users** (full) + **shops** (full) | B2B users list |
| **6** | `GET /admin/b2c-users` | `b2cUsers` / `getB2CUsers` | `User.getB2CUsers(1, 999999)` | **shops** (full) + **users** (full) | B2C users list |
| **7** | `GET /admin/signUpReport` | `signUpReport` | `User.getUsersByTypeAndDateRange` | **users** (full) | Sign-up report by type/date |
| **8** | `GET /admin/custNotification` | `custNotification` | `User.findWithFcmTokenByUserType('C')` | **users** (full) | Customer FCM list (cached 30d) |
| **9** | `GET /admin/vendorNotification` | `vendorNotification` | `User.findWithFcmTokenByUserType('S')` | **users** (full) | Vendor FCM list (cached 30d) |
| **10** | `POST /admin/order/:id/add-nearby-n-users` | `addNearbyNUsersToOrder` | Direct **Scan** `users` (user_type=N) | **users** (full) | Add nearby N-users to order |
| **11** | `POST /admin/order/:id/add-bulk-notified-vendors` | `addBulkNotifiedVendors` | Scan **bulk_message_notifications** + User/Order Scans | **bulk_message_notifications**, **users**, **orders** | Bulk add notified vendors |
| **12** | `GET /customer/orders` | `CustomerController.orders` | `Order.getAll(status)` | **orders** (full) | Customer orders list |
| **13** | `GET /customer/view-orders` | `viewOrders` | `Order.getAll` + filters | **orders** (full) | Admin view orders |
| **14** | `GET /customer/recent-orders/:id` | `showRecentOrders` | `Order.findByCustomerId` → **Scan** orders | **orders** (full) | Recent orders by customer |

---

## Model-Level Scan Usage

### User model (`models/User.js`)

| Method | Operation | Table | RRU Impact |
|--------|-----------|-------|------------|
| `getCustomers(page, limit)` | Scan, `FilterExpression: user_type = 'C'` | users | **Full table** |
| `getB2BUsers(page, limit)` | Scan users (S/SR) + **Scan shops** (shop_type) | users, **shops** | **Full both** |
| `getB2CUsers(page, limit)` | **Scan shops** (all) + **Scan users** | **shops**, **users** | **Full both** |
| `getDeliveryUsers(page, limit)` | Scan, `user_type = 'D'` | users | Full table |
| `getMonthlyCountByUserType(type)` | Scan, `user_type = :type` | users | **Full table** (×6 for dashboard) |
| `getMonthlyCountByUserTypeV2(type)` | Scan, `user_type` + `app_version` + `app_type` | users | Full table |
| `getUsersByTypeAndDateRange(type, start, end)` | Scan, then filter by date in memory | users | Full table |
| `findWithFcmTokenByUserType(type)` | Scan, `user_type` + `attribute_exists(fcm_token)` | users | Full table |
| `countV2CustomerAppUsers` | Scan | users | Full table |
| `countV2VendorAppUsers` | Scan | users | Full table |

### Order model (`models/Order.js`)

| Method | Operation | Table | RRU Impact |
|--------|-----------|-------|------------|
| `getAll(status)` | Scan (optional `FilterExpression` on status) | orders | **Full table** |
| `findByCustomerId(customerId)` | Scan, `FilterExpression: customer_id = :id` | orders | **Full table** |
| `findByDeliveryBoyId(delvBoyId)` | Scan, `delv_boy_id` / `delv_id` | orders | Full table |
| `findCompletedByDeliveryBoyId` | Scan, delivery + status | orders | Full table |
| `getMonthlyCount(status)` | Scan, `ProjectionExpression: created_at, status` | orders | **Full table** |
| `getMonthlyPendingCount` | Scan, filter status 1/2/3 in memory | orders | Full table |
| `getLastOrderNumber` | **Scan** entire table, sort by `order_number` | orders | Full table |

### Shop model (`models/Shop.js`)

| Method | Operation | Table | RRU Impact |
|--------|-----------|-------|------------|
| `findByUserId(userId)` | Scan, `FilterExpression: user_id = :id` | shops | Full table |
| `findByUserIds(userIds)` | Scan with `user_id IN (...)` | shops | Full table |
| Location / filters | Various Scans | shops | Full table |

### Admin panel – direct Scan (`adminPanelController.js`)

| Location | Purpose | Table | RRU Impact |
|----------|---------|-------|------------|
| `addNearbyNUsersToOrder` (~5037) | Scan all `user_type = 'N'` | **users** | Full table |
| `addBulkNotifiedVendors` (~5678) | Scan) | **users** (or similar) | Full table |
| `addBulkNotifiedVendors` (~6182) | Scan `status = 'sent'` | **bulk_message_notifications** | Full table |

---

## Routes → Scan-Heavy APIs (Quick Reference)

```
GET  /admin/customers                    → User.getCustomers (Scan users)
GET  /admin/dashboard                    → KPIs + charts (many Scans)
GET  /admin/dashboard/kpis               → User/Order counts (Scans)
GET  /admin/dashboard/charts             → 6× User.getMonthlyCountByUserType + 3× Order.getMonthly* (9 Scans)
GET  /admin/dashboard/recent-orders      → Order Scans
GET  /admin/dashboard/customer-app-orders → Order + User Scans
GET  /admin/b2b-users                    → User.getB2BUsers (Scan users + shops)
GET  /admin/b2c-users                    → User.getB2CUsers (Scan shops + users)
GET  /admin/signUpReport                 → User.getUsersByTypeAndDateRange (Scan users)
GET  /admin/custNotification             → User.findWithFcmTokenByUserType('C') (Scan users)
GET  /admin/vendorNotification           → User.findWithFcmTokenByUserType('S') (Scan users)
POST /admin/order/:id/add-nearby-n-users → Direct Scan users (user_type=N)
POST /admin/order/:id/add-bulk-notified-vendors → Scan bulk_message_notifications + User/Order
GET  /customer/orders                    → Order.getAll (Scan orders)
GET  /customer/view-orders               → Order.getAll (Scan orders)
GET  /customer/recent-orders/:id         → Order.findByCustomerId (Scan orders)
```

---

## How to Find Which API Is Causing High RRU

### 1. CloudWatch metrics (DynamoDB) — terminal

Use the script to fetch **ConsumedReadCapacityUnits** (RCU) and **ConsumedWriteCapacityUnits** (WCU) per table from CloudWatch:

```bash
# From project root (SCRAPMATE-NODE-LAMBDA)
./scripts/check-dynamodb-rru-cloudwatch.sh [OPTIONS]
```

**Options:**

| Option | Description | Default |
|--------|-------------|---------|
| `--hours N` | Time window (1, 6, 24, 72) | 24 |
| `--period N` | CloudWatch period (seconds) | 300 (5 min) |
| `--region R` | AWS region | `AWS_REGION` / config |
| `--profile P` | AWS CLI profile | default |
| `--tables T` | Comma-separated table names | default set (see below) |
| `--all-tables` | Use all DynamoDB tables | off |
| `--reads-only` | Only fetch RCU (default: both RCU and WCU) | off |
| `--verbose` | Print per-period values (spot spikes) | off |

**Default tables** (if neither `--tables` nor `--all-tables`): `users`, `orders`, `shops`, `bulk_message_notifications` (main Scan-heavy tables).

**Billing:** If CloudWatch shows 0 RCU/WCU but you have DynamoDB billing (e.g. ~\$2.5/day), the script prints a checklist: (1) use `--region` for prod, (2) WCU (writes) also drive cost, (3) run Cost Explorer for DynamoDB by `USAGE_TYPE`, (4) storage, backups, PITR, GSIs, streams add cost.

**Examples:**

```bash
./scripts/check-dynamodb-rru-cloudwatch.sh
./scripts/check-dynamodb-rru-cloudwatch.sh --hours 6 --verbose
./scripts/check-dynamodb-rru-cloudwatch.sh --tables users,orders,shops
./scripts/check-dynamodb-rru-cloudwatch.sh --all-tables
AWS_PROFILE=myprofile ./scripts/check-dynamodb-rru-cloudwatch.sh --hours 24
```

**Prerequisites:** AWS CLI configured (`aws configure`), with access to DynamoDB and CloudWatch. `jq` is optional but recommended for per-table breakdown.

**Output:** Table name, Total RCU, Total WCU, Max RCU, Max WCU. Use **Total** and **Max** to see which tables consume most and when they spike. Correlate with `[DYNAMODB-HIGH-RRU]` logs.

**Cost Explorer (Python):** `python3 scripts/dynamodb-cost-explorer.py [--days 5] [--profile default]` — runs Cost Explorer for DynamoDB and prints cost by USAGE_TYPE (ReadRequestUnits, WriteRequestUnits, storage). Requires `ce:GetCostAndUsage`. Use this to confirm **reads** vs **writes** vs **storage** drive billing. Cost Explorer uses region codes (e.g. **APS3** = ap-south-1 Mumbai); if prod is there, run the RCU/WCU script with `--region ap-south-1`.

### 2. Enable API Route Logging

Use the existing admin-panel request logger in `adminPanelApiRoutes.js` (logs path, method, query). Correlate timestamps with DynamoDB consumption.

### 3. Optional: High-RRU API logging (middleware)

- **Middleware**: `middleware/dynamodbHighRruLogMiddleware.js`
- **Enable**: `LOG_DYNAMODB_HIGH_RRU=1` (or `true`)
- When a known Scan-heavy route is hit, logs a single line:  
  `[DYNAMODB-HIGH-RRU] GET /admin/customers?page=1&limit=99999 | User.getCustomers Scan (users) | <timestamp>`
- **Usage**: Grep logs for `[DYNAMODB-HIGH-RRU]` and correlate with DynamoDB `ConsumedReadCapacityUnits` spikes.
- The middleware is already wired into `routes/adminPanelApiRoutes.js`; it no-ops unless the env var is set.

### 4. Correlate With PHP Admin

- **Users page** (`/users` → mono.scrapmate): calls `GET /admin/customers` with `page=1&limit=99999` (no search). That triggers **User.getCustomers(1, 999999)** → **full users Scan** on every load.
- **Dashboard**: multiple dashboard endpoints each doing several Scans (KPIs, charts, recent-orders, etc.).

---

## Recommended Mitigations (Short List)

1. **GSIs**
   - **users**: GSI on `user_type` (and optionally `app_version` / `app_type`) to replace Scans with Query.
   - **orders**: GSI on `customer_id`, `delv_boy_id` / `delv_id`, `status`, `created_at` (or composite) for orders-by-customer, by-delivery, by-status, and monthly counts.
   - **shops**: GSI on `user_id` for `findByUserId` / `findByUserIds`.

2. **Pagination / Limit**
   - Avoid `limit=99999` for `/admin/customers`. Use server-side pagination (e.g. page size 50–100) and search only when needed.

3. **Caching**
   - Dashboard KPIs/charts, custNotification, vendorNotification already use Redis. Ensure cache hit rates are high and TTLs sensible.

4. **Replace Scan with Query**
   - Where a GSI exists, switch all `Scan` + `FilterExpression` to `Query` on the GSI partition (and sort) key.

5. **BatchGetItem / GetItem**
   - Prefer these for single-item or small-batch lookups instead of Scan.

---

## Optimizations Applied (Jan 2025)

Based on CloudWatch RCU (ap-south-1): **customer** 9.2M, **shops** 7.4M, **users** 2.8M, **orders** 2.8M, **addresses** 674K over 48h.

1. **Customer + Addresses (\/admin/customers)**
   - **Before:** For each user, `Customer.findByUserId` (Scan) + `Address.findByCustomerId` (Query/Scan) → N × (1 full customer Scan + 1–2 address lookups).
   - **After:** `Customer.findByUserIdsBulk` + `Address.findByCustomerIdsBulk` → **1 Customer Scan + 1 Address Scan** total, then in-memory enrich.
   - **Models:** `Customer.findByUserIdsBulk`, `Address.findByCustomerIdsBulk` (single Scan each, filter in memory).

2. **Shops (B2B, B2C, new users)**
   - **Before:** For each user, `Shop.findByUserId` (full Scan) → N Scans of **shops** per request.
   - **After:** `Shop.findByUserIdsBulk` → **1 Shop Scan** per request, then in-memory enrich.
   - **Models:** `Shop.findByUserIdsBulk`. **Controllers:** `_enrichUsersWithShopsBulk` (B2B), `_enrichB2CUsersWithShopsBulk` (B2C), `_enrichNewUsersWithShopsBulk` (new users).

3. **Orders**
   - **Redis cache:** `Order.findByCustomerId`, `Order.getAll`, `Order.findByShopId` (status=null), `Order.findByDeliveryBoyId`, `Order.findByOrderNo` (TTL `orders` 60s). Invalidation on create/update.
   - **Refactor:** `findPendingByCustomerId` uses `findByCustomerId` + filter. `findCompletedByDeliveryBoyId` uses `findByDeliveryBoyId` + filter status 4/5.

4. **V2 APIs (shops, customer, orders, addresses)**
   - **Shop:** `findByUserId` and `findAllByUserId` Redis-cached (TTL `orders`). Invalidate on `Shop.create` / `Shop.update`.
   - **Customer:** `findByUserId` Redis-cached. Invalidate on `Customer.create` / `Customer.update`.
   - **Address:** `findByCustomerId` Redis-cached. Invalidate on `Address.create` / `update` / `delete`.
   - **Order:** `findByShopId` (status=null) cached; invalidation with order create/update.
   - **V2 routes that benefit:** `/api/v2/stats/dashboard`, `/api/v2/profile/:userId`, `/api/v2/earnings/monthly-breakdown/:userId`, `/api/v2/recycling/stats/:userId`, `/api/v2/orders/*` (pickups, active, completed), v2ProfileService, v2AddressController (list addresses).

5. **Users**
   - **Redis cache:** `User.countByUserType`, `User.getMonthlyCountByUserType`, `User.countByUserTypeAndCurrentMonth`, `User.countByUserTypeV2`, `User.getMonthlyCountByUserTypeV2` (TTL `dashboard` 300s). Reduces dashboard KPIs/charts Scans.
   - **Not changed:** `User.getCustomers`, `getB2BUsers`, `getB2CUsers`, etc. still Scan **users** for list APIs. Requires GSIs to move to Query.

---

## Next Steps

1. Check CloudWatch for `ConsumedReadCapacityUnits` per table during high-RRU periods.
2. Cross-check with access logs for `/admin/*` and `/customer/*` routes.
3. Reduce **limit** for `/admin/customers` and ensure users table uses **Query** via GSI where possible.
4. Add GSIs and refactor **User**, **Order**, and **Shop** methods as above to remove Scans.
