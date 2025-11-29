# API Fixes Summary - Mobile Routes

## Issues Fixed

### 1. ✅ Order Image URL Formatting Bug
**Problem:** Order image URLs were being incorrectly formatted by prepending the Lambda/API Gateway base URL to already-full S3 URLs, creating malformed URLs like:
- `https://uodttljjzj3nh3e4cjqardxip40btqef.lambda-url.ap-south-1.on.aws/assets/images/order/https://scrapmate-images.s3.ap-south-1.amazonaws.com/orders/1754394361115.jpg`

**Fixed in:**
- `controllers/orderController.js`:
  - `orderDetails()` - Now uses `getImageUrl()` helper
  - `customerOrders()` - Now uses `getImageUrl()` helper  
  - `customerPendingOrders()` - Now uses `getImageUrl()` helper
- `controllers/shopController.js`:
  - `shopOrders()` - Now uses `getImageUrl()` helper
- `controllers/deliveryBoyController.js`:
  - `delvOrders()` - Now uses `getImageUrl()` helper

**Solution:** Check if image field is already a full URL (http:// or https://). If it's an S3 URL, convert to presigned URL. If it's a local path, prepend base URL (legacy support).

### 2. ✅ S3 URL to Presigned URL Conversion
**Problem:** `getImageUrl()` was returning S3 URLs as-is without converting them to presigned URLs.

**Fixed in:**
- `utils/imageHelper.js` - `getImageUrl()` function
  - Now detects S3 URLs (scrapmate-images.s3 or s3.amazonaws.com)
  - Extracts S3 key from URL path
  - Generates presigned URL using `getS3Url()`
  - Falls back to original URL if presigned URL generation fails

**Solution:** When a full S3 URL is detected, extract the S3 key (e.g., `orders/1754394361115.jpg`) and generate a presigned URL for secure access.

### 3. ✅ Routes Verification
**Status:** All routes exist in code:
- ✅ `POST /api/login_app` - Exists in `routes/apiRoutes.js` (line 43)
- ✅ `POST /api/profile_update` - Exists in `routes/apiRoutes.js` (line 103)

**Note:** These routes need to be deployed to Lambda to be accessible.

## DynamoDB Table Names Verified

All table names are correct:
- ✅ `orders` - Used in `models/Order.js`
- ✅ `users` - Used in `models/User.js`
- ✅ `shops` - Used in `models/Shop.js`
- ✅ `customer` - Used in `models/Customer.js`
- ✅ `delivery_boy` - Used in `models/DeliveryBoy.js`
- ✅ `category_img_keywords` - Used in `models/CategoryImgKeywords.js`

No table name mismatches found.

## Next Steps

1. **Deploy Updated Code:**
   ```bash
   ./scripts/deploy-unified.sh dev ap-south-1
   ```

2. **Re-run Tests:**
   ```bash
   ./scripts/test-all-mobile-apis.sh
   ```

3. **Expected Results After Deployment:**
   - ✅ Order image URLs will be properly formatted (presigned S3 URLs)
   - ✅ POST /api/login_app will work (route exists, needs deployment)
   - ✅ POST /api/profile_update will work (route exists, needs deployment)
   - ✅ GET /api/category_img_list - S3 URLs will differ (expected, presigned URLs are time-limited)
   - ✅ GET /api/customer_pending_orders/1 - Image URLs will be properly formatted

## Files Modified

1. `controllers/orderController.js` - Fixed image URL formatting (3 methods)
2. `controllers/shopController.js` - Fixed image URL formatting (1 method)
3. `controllers/deliveryBoyController.js` - Fixed image URL formatting (1 method)
4. `utils/imageHelper.js` - Enhanced to convert S3 URLs to presigned URLs

## Testing

After deployment, test these endpoints:
- `GET /api/customer_pending_orders/1` - Should return properly formatted image URLs
- `GET /api/category_img_list` - Should return presigned S3 URLs (will differ each call, but structure should match)
- `POST /api/login_app` - Should work after deployment
- `POST /api/profile_update` - Should work after deployment

