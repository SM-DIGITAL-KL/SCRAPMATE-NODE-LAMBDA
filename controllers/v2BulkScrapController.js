/**
 * V2 Bulk Scrap Purchase Controller
 * Handles bulk scrap purchase requests from B2B users
 */

const User = require('../models/User');
const Shop = require('../models/Shop');
const BulkScrapRequest = require('../models/BulkScrapRequest');
const PendingBulkBuyOrder = require('../models/PendingBulkBuyOrder');
const { getDynamoDBClient } = require('../config/dynamodb');
const { ScanCommand } = require('@aws-sdk/lib-dynamodb');
const { sendMulticastNotification } = require('../utils/fcmNotification');
const { uploadBufferToS3 } = require('../utils/s3Upload');
const path = require('path');

class V2BulkScrapController {
  /**
   * POST /api/v2/bulk-scrap/purchase
   * Create a bulk scrap purchase request and notify nearby B2B and B2C users
   * Body: {
   *   buyer_id: number (B2B user making the purchase request),
   *   latitude: number,
   *   longitude: number,
   *   scrap_type?: string,
   *   subcategory_id?: number,
   *   quantity: number (in kgs),
   *   preferred_price?: number,
   *   delivery_method?: string,
   *   when_needed?: string,
   *   location?: string,
   *   additional_notes?: string
   * }
   */
  static async createBulkPurchaseRequest(req, res) {
    try {
      const {
        buyer_id,
        latitude,
        longitude,
        scrap_type,
        subcategories, // Array of subcategories (may be JSON string from FormData)
        subcategory_id,
        quantity,
        preferred_price,
        preferred_distance, // Preferred search distance in km
        when_needed,
        location,
        additional_notes,
        pending_order_id // ID of the pending order being submitted
      } = req.body;

      // Parse subcategories if it's a JSON string (from FormData)
      let parsedSubcategories = null;
      if (subcategories) {
        try {
          parsedSubcategories = typeof subcategories === 'string' 
            ? JSON.parse(subcategories) 
            : subcategories;
        } catch (e) {
          console.warn('⚠️ Failed to parse subcategories:', e.message);
        }
      }

      // Handle document uploads (from multer)
      const documentUrls = [];
      if (req.files) {
        const documentFiles = Object.values(req.files).flat();
        for (const file of documentFiles) {
          if (file && file.buffer) {
            try {
              const ext = path.extname(file.originalname).toLowerCase() || 
                         (file.mimetype === 'application/pdf' ? '.pdf' : '.jpg');
              const filename = `bulk-scrap-doc-${buyer_id}-${Date.now()}-${Math.random().toString(36).substring(7)}${ext}`;
              const s3Result = await uploadBufferToS3(file.buffer, filename, 'bulk-scrap-documents');
              documentUrls.push(s3Result.s3Url);
              console.log(`✅ Document uploaded: ${s3Result.s3Url}`);
            } catch (uploadError) {
              console.error('❌ Error uploading document:', uploadError);
              // Continue even if document upload fails
            }
          }
        }
      }

      console.log('📦 V2BulkScrapController.createBulkPurchaseRequest called');
      console.log('   Request data:', {
        buyer_id,
        latitude,
        longitude,
        scrap_type,
        subcategories_count: parsedSubcategories?.length || 0,
        subcategory_id,
        quantity,
        preferred_price,
        preferred_distance,
        documents_count: documentUrls.length
      });

      // Validate required fields
      if (!buyer_id || !latitude || !longitude || !quantity) {
        return res.status(400).json({
          status: 'error',
          msg: 'Missing required fields: buyer_id, latitude, longitude, and quantity are required',
          data: null
        });
      }

      // Validate latitude and longitude
      const lat = parseFloat(latitude);
      const lng = parseFloat(longitude);
      if (isNaN(lat) || isNaN(lng)) {
        return res.status(400).json({
          status: 'error',
          msg: 'Invalid latitude or longitude',
          data: null
        });
      }

      // Verify buyer is a B2B user (user_type 'S' or 'SR')
      const buyer = await User.findById(buyer_id);
      if (!buyer) {
        return res.status(404).json({
          status: 'error',
          msg: 'Buyer not found',
          data: null
        });
      }

      const buyerUserType = buyer.user_type;
      if (buyerUserType !== 'S' && buyerUserType !== 'SR') {
        return res.status(400).json({
          status: 'error',
          msg: 'Only B2B users (user_type S or SR) can create bulk purchase requests',
          data: null
        });
      }

      // If pending_order_id is provided, atomically mark it as 'submitted' BEFORE creating the bulk request
      // This prevents race conditions where multiple requests try to submit the same order
      if (pending_order_id) {
        try {
          const { UpdateCommand } = require('@aws-sdk/lib-dynamodb');
          const { getDynamoDBClient } = require('../config/dynamodb');
          const client = getDynamoDBClient();
          
          const pendingOrderId = typeof pending_order_id === 'string' ? pending_order_id : String(pending_order_id);
          
          console.log(`🔄 Atomically marking pending order ${pendingOrderId} as submitted (before creating bulk request)`);
          
          // Use conditional update to atomically check and update status
          // Only update if status is NOT already 'submitted' or 'completed'
          // This prevents race conditions - if update fails, order is already submitted
          // Condition: status must not exist OR must not be 'submitted' OR must not be 'completed'
          const updateCommand = new UpdateCommand({
            TableName: 'pending_bulk_buy_orders',
            Key: { id: pendingOrderId },
            UpdateExpression: 'SET #status = :status, updated_at = :updatedAt',
            ConditionExpression: 'attribute_not_exists(#status) OR (#status <> :submittedStatus AND #status <> :completedStatus)',
            ExpressionAttributeNames: {
              '#status': 'status'
            },
            ExpressionAttributeValues: {
              ':status': 'submitted',
              ':submittedStatus': 'submitted',
              ':completedStatus': 'completed',
              ':updatedAt': new Date().toISOString()
            },
            ReturnValues: 'ALL_NEW' // Return updated item to verify
          });
          
          const updateResponse = await client.send(updateCommand);
          console.log(`✅ Pending order ${pendingOrderId} marked as submitted (atomic update successful)`);
          console.log(`   Updated status: ${updateResponse.Attributes?.status}`);
        } catch (updateError) {
          // Check if error is due to condition not being met (order already submitted)
          if (updateError.name === 'ConditionalCheckFailedException' || 
              updateError.__type === 'com.amazonaws.dynamodb.v20120810#ConditionalCheckFailedException' ||
              updateError.code === 'ConditionalCheckFailedException') {
            console.log(`⚠️ Pending order ${pendingOrderId} is already submitted (conditional check failed)`);
            return res.status(400).json({
              status: 'error',
              msg: 'This order has already been submitted',
              data: null
            });
          } else {
            console.error('❌ Error updating pending order status:', updateError);
            console.error('   Error name:', updateError.name);
            console.error('   Error code:', updateError.code);
            // If we can't update the status, fail the request to prevent potential duplicates
            return res.status(500).json({
              status: 'error',
              msg: 'Failed to verify order status. Please try again.',
              data: null
            });
          }
        }
      }

      console.log(`✅ Buyer verified: ID=${buyer_id}, user_type=${buyerUserType}`);

      // Get buyer's shop IDs to exclude them from notifications
      // Convert to both string and number to handle type mismatches
      const buyerShops = await Shop.findAllByUserId(buyer_id);
      const buyerShopIds = new Set();
      const buyerUserIds = new Set();
      const buyerPhoneNumbers = new Set(); // Also exclude by phone number for extra safety
      
      buyerShops.forEach(s => {
        if (s.id) {
          buyerShopIds.add(String(s.id));
          buyerShopIds.add(Number(s.id));
          if (!isNaN(s.id)) {
            buyerShopIds.add(parseInt(s.id));
          }
        }
        // Add shop contact phone number to exclusion set
        // Handle both string and number types, and normalize phone numbers
        if (s.contact !== null && s.contact !== undefined && s.contact !== '') {
          const contactStr = String(s.contact).trim();
          // Only add if it looks like a phone number (all digits)
          if (contactStr && /^\d+$/.test(contactStr)) {
            buyerPhoneNumbers.add(contactStr);
            const contactNum = !isNaN(contactStr) ? parseInt(contactStr) : null;
            if (contactNum !== null) {
              buyerPhoneNumbers.add(contactNum);
              buyerPhoneNumbers.add(String(contactNum));
            }
          }
        }
      });
      
      // Add buyer's phone number to exclusion set (from user record)
      // Handle both string and number types
      if (buyer.mob_num !== null && buyer.mob_num !== undefined && buyer.mob_num !== '') {
        const buyerPhoneStr = String(buyer.mob_num).trim();
        if (buyerPhoneStr) {
          buyerPhoneNumbers.add(buyerPhoneStr);
          const buyerPhoneNum = !isNaN(buyerPhoneStr) ? parseInt(buyerPhoneStr) : null;
          if (buyerPhoneNum !== null) {
            buyerPhoneNumbers.add(buyerPhoneNum);
            buyerPhoneNumbers.add(String(buyerPhoneNum));
          }
        }
      }
      
      // Exclude by user_id - this ensures all shops belonging to the buyer (R, S, or both) are excluded
      // This is critical for SR users who have both R and S shops
      const buyerIdStr = String(buyer_id);
      const buyerIdNum = Number(buyer_id);
      const buyerIdInt = !isNaN(buyer_id) ? parseInt(buyer_id) : null;
      
      buyerUserIds.add(buyerIdStr);
      buyerUserIds.add(buyerIdNum);
      if (buyerIdInt !== null) {
        buyerUserIds.add(buyerIdInt);
      }
      
      console.log(`   Buyer has ${buyerShops.length} shop(s) - will exclude from notifications`);
      console.log(`   Buyer shop IDs: ${Array.from(buyerShopIds).join(', ')}`);
      console.log(`   Buyer user ID: ${buyer_id} (will exclude all shops belonging to this user)`);
      console.log(`   Buyer user ID set values: ${Array.from(buyerUserIds).join(', ')}`);
      console.log(`   Buyer phone number: ${buyer.mob_num || 'N/A'} (will exclude shops with same phone number)`);
      console.log(`   Buyer phone numbers set: ${Array.from(buyerPhoneNumbers).join(', ')}`);
      
      // Log each shop's details for debugging
      buyerShops.forEach((shop, idx) => {
        console.log(`   Buyer Shop ${idx + 1}: ID=${shop.id}, shop_type=${shop.shop_type}, contact="${shop.contact}" (type: ${typeof shop.contact}), user_id=${shop.user_id}`);
      });

      // Search radius for finding nearby users (in km)
      // Use preferred_distance from request, default to 50km if not provided
      const searchRadius = preferred_distance && preferred_distance > 0 
        ? parseFloat(preferred_distance) 
        : 50; // Default 50km radius for bulk purchases
      
      // Validate search radius (should be between 0 and 3000 km)
      const validatedRadius = Math.max(0, Math.min(3000, searchRadius));
      
      console.log(`📏 Using search radius: ${validatedRadius}km (requested: ${preferred_distance || 'not provided'})`);

      // Find all nearby B2B shops (user_type 'S') within preferred distance
      // For S-type buyers, send to S shops; for SR buyers, find but don't notify S shops
      console.log(`🔍 Finding all nearby B2B shops (user_type 'S') within ${validatedRadius}km...`);
      const nearbyB2BShops = await findNearbyUsersByType(lat, lng, validatedRadius, ['S'], null);
      // Filter to only include S-type users' shops (shop_type 1 for B2B, or null/undefined)
      const b2bShops = nearbyB2BShops.filter(u => {
        // Only include S-type users (they should have shop_type 1, or no shop_type set)
        return u.user_type === 'S' && (!u.shop_type || u.shop_type === 1);
      });

      // Find all nearby B2C shops (user_type 'R') within preferred distance
      // For R-type buyers, send to R shops; for SR buyers, send to R shops only (not S shops)
      console.log(`🔍 Finding all nearby B2C shops (user_type 'R') within ${validatedRadius}km...`);
      const nearbyB2CShops = await findNearbyUsersByType(lat, lng, validatedRadius, ['R'], null);
      // Filter to only include R-type users' shops (shop_type 2 or 3 for B2C, or null/undefined)
      const b2cShops = nearbyB2CShops.filter(u => {
        // Only include R-type users (they should have shop_type 2 or 3, or no shop_type set)
        return u.user_type === 'R' && (!u.shop_type || u.shop_type === 2 || u.shop_type === 3);
      });

      // If buyer is SR type, only notify R shops (B2C dashboard), not S shops (B2B)
      // If buyer is S type, notify both S and R shops
      let shopsToNotify = [];
      if (buyerUserType === 'SR') {
        // SR buyer: Only send to R shops (B2C dashboard)
        console.log(`📤 Buyer is SR type - will only notify R shops (B2C dashboard), not S shops`);
        shopsToNotify = b2cShops;
      } else if (buyerUserType === 'S') {
        // S buyer: Send to both S and R shops
        console.log(`📤 Buyer is S type - will notify both S shops (B2B) and R shops (B2C)`);
        shopsToNotify = [...b2bShops, ...b2cShops];
      } else {
        // Fallback (shouldn't happen based on validation above)
        shopsToNotify = [...b2bShops, ...b2cShops];
      }

      // Filter shops to notify, excluding the buyer's own shops
      // Check shop_id, user_id, and phone number to handle all cases
      // IMPORTANT: Exclude by user_id first to ensure all shops (R and S) belonging to the buyer are excluded
      const allShopsToNotify = shopsToNotify.filter(s => {
        // First check by user_id - if the shop's user_id matches buyer's user_id, exclude it
        // This ensures all shops (both R and S) belonging to the same buyer are excluded
          const userIdStr = String(s.user_id || '');
          const userIdNum = Number(s.user_id);
        const userIdInt = s.user_id && !isNaN(s.user_id) ? parseInt(s.user_id) : null;
        
        if (buyerUserIds.has(userIdStr) || buyerUserIds.has(userIdNum) || (userIdInt !== null && buyerUserIds.has(userIdInt))) {
          return false; // Exclude - this shop belongs to the buyer
        }
        
        // Also check by shop_id for extra safety
          const shopIdStr = String(s.shop_id || '');
          const shopIdNum = Number(s.shop_id);
        if (buyerShopIds.has(shopIdStr) || buyerShopIds.has(shopIdNum)) {
          return false; // Exclude - this is the buyer's shop
        }
        
        // Check by phone number - exclude shops with the same phone number as buyer
        // This ensures shops registered with the same phone number (even if different user_id) are excluded
        // This is important for SR users who might have multiple accounts or shops with same phone
        // Check both mob_num (from user record) and contact (from shop record)
        const shopPhone = s.mob_num || s.contact;
        if (shopPhone !== null && shopPhone !== undefined && shopPhone !== '') {
          const shopPhoneStr = String(shopPhone).trim();
          // Only check if it looks like a phone number (all digits)
          if (shopPhoneStr && /^\d+$/.test(shopPhoneStr)) {
            const shopPhoneNum = !isNaN(shopPhoneStr) ? parseInt(shopPhoneStr) : null;
            
            if (buyerPhoneNumbers.has(shopPhoneStr) || (shopPhoneNum !== null && buyerPhoneNumbers.has(shopPhoneNum))) {
              return false; // Exclude - this shop has the same phone number as buyer
            }
          }
        }
        
        return true; // Include - this shop doesn't belong to the buyer
      });

      // Remove duplicates based on shop_id (same shop shouldn't be notified twice)
      const uniqueShops = [];
      const seenShopIds = new Set();
      for (const shop of allShopsToNotify) {
        if (!seenShopIds.has(shop.shop_id)) {
          seenShopIds.add(shop.shop_id);
          uniqueShops.push(shop);
        }
      }

      const b2bShopsCount = buyerUserType === 'SR' ? 0 : b2bShops.length; // SR buyers don't notify B2B shops
      const b2cShopsCount = b2cShops.length;
      console.log(`✅ Found ${b2bShops.length} B2B shops and ${b2cShops.length} B2C shops`);
      console.log(`📤 Will notify ${allShopsToNotify.length} shops (${b2bShopsCount} B2B + ${b2cShopsCount} B2C, excluding buyer's ${buyerShops.length} shop(s))`);
      
      // Debug: Log which shops are being excluded
      const excludedShops = shopsToNotify.filter(s => {
        const shopIdStr = String(s.shop_id || '');
        const shopIdNum = Number(s.shop_id);
        const userIdStr = String(s.user_id || '');
        const userIdNum = Number(s.user_id);
        const userIdInt = s.user_id && !isNaN(s.user_id) ? parseInt(s.user_id) : null;
        
        // Check by user_id first (more important for SR users with multiple shops)
        if (buyerUserIds.has(userIdStr) || buyerUserIds.has(userIdNum) || (userIdInt !== null && buyerUserIds.has(userIdInt))) {
          return true;
        }
        // Also check by shop_id
        if (buyerShopIds.has(shopIdStr) || buyerShopIds.has(shopIdNum)) {
          return true;
        }
        // Check by phone number
        if (s.mob_num || s.contact) {
          const shopPhone = s.mob_num || s.contact;
          const shopPhoneStr = String(shopPhone).trim();
          const shopPhoneNum = !isNaN(shopPhoneStr) ? parseInt(shopPhoneStr) : null;
          if (shopPhoneStr && (buyerPhoneNumbers.has(shopPhoneStr) || (shopPhoneNum !== null && buyerPhoneNumbers.has(shopPhoneNum)))) {
            return true;
          }
        }
        return false;
      });
      
      if (excludedShops.length > 0) {
        console.log(`   ⚠️  Excluded ${excludedShops.length} shops (buyer's own shops)`);
        excludedShops.forEach(s => {
          const exclusionReason = [];
        const userIdStr = String(s.user_id || '');
        const userIdNum = Number(s.user_id);
          const userIdInt = s.user_id && !isNaN(s.user_id) ? parseInt(s.user_id) : null;
          if (buyerUserIds.has(userIdStr) || buyerUserIds.has(userIdNum) || (userIdInt !== null && buyerUserIds.has(userIdInt))) {
            exclusionReason.push('user_id match');
          }
          const shopIdStr = String(s.shop_id || '');
          const shopIdNum = Number(s.shop_id);
          if (buyerShopIds.has(shopIdStr) || buyerShopIds.has(shopIdNum)) {
            exclusionReason.push('shop_id match');
          }
          if (s.mob_num || s.contact) {
            const shopPhone = s.mob_num || s.contact;
            const shopPhoneStr = String(shopPhone).trim();
            const shopPhoneNum = !isNaN(shopPhoneStr) ? parseInt(shopPhoneStr) : null;
            if (shopPhoneStr && (buyerPhoneNumbers.has(shopPhoneStr) || (shopPhoneNum !== null && buyerPhoneNumbers.has(shopPhoneNum)))) {
              exclusionReason.push('phone match');
            }
          }
          console.log(`      - Shop ID: ${s.shop_id}, User ID: ${s.user_id}, Type: ${s.user_type}, Name: ${s.name || s.shop_name || 'N/A'}, Phone: ${s.mob_num || s.contact || 'N/A'}, Excluded by: ${exclusionReason.join(', ') || 'unknown'}`);
        });
      }
      
      // Debug: Log shops that will be notified
      console.log(`   📋 Shops to notify:`);
      allShopsToNotify.slice(0, 10).forEach((s, idx) => {
        console.log(`      ${idx + 1}. Shop ID: ${s.shop_id}, User ID: ${s.user_id}, Type: ${s.user_type}, Distance: ${s.distance?.toFixed(2)}km`);
      });
      if (allShopsToNotify.length > 10) {
        console.log(`      ... and ${allShopsToNotify.length - 10} more`);
      }

      // Get FCM tokens for all users to notify
      // Group shops by user_id to avoid sending duplicate notifications to the same user
      const userShopMap = new Map(); // user_id -> array of shops
      for (const shop of uniqueShops) {
        if (!userShopMap.has(shop.user_id)) {
          userShopMap.set(shop.user_id, []);
        }
        userShopMap.get(shop.user_id).push(shop);
      }

      const fcmTokens = [];
      const usersWithTokens = [];

      for (const [userId, shops] of userShopMap.entries()) {
        try {
          const user = await User.findById(userId);
          if (user && user.fcm_token) {
            fcmTokens.push(user.fcm_token);
            usersWithTokens.push({
              user_id: user.id,
              user_type: user.user_type,
              name: user.name || 'User',
              shop_count: shops.length,
              shop_ids: shops.map(s => s.shop_id)
            });
          }
        } catch (err) {
          console.error(`❌ Error fetching user ${userId}:`, err.message);
        }
      }

      console.log(`✅ Found ${fcmTokens.length} users with FCM tokens`);

      // Save the bulk scrap request to the database
      const buyerName = buyer.name || buyer.company_name || `User_${buyer_id}`;
      const requestData = {
        buyer_id: parseInt(buyer_id),
        buyer_name: buyerName,
        latitude: lat,
        longitude: lng,
        scrap_type: scrap_type || null,
        subcategories: parsedSubcategories ? JSON.stringify(parsedSubcategories) : null,
        subcategory_id: subcategory_id ? parseInt(subcategory_id) : null,
        quantity: parseFloat(quantity),
        preferred_price: preferred_price ? parseFloat(preferred_price) : null,
        preferred_distance: validatedRadius,
        when_needed: when_needed || null,
        location: location || null,
        additional_notes: additional_notes || null,
        documents: documentUrls.length > 0 ? JSON.stringify(documentUrls) : null,
        accepted_vendors: JSON.stringify([]),
        rejected_vendors: JSON.stringify([])
      };

      let savedRequest = null;
      try {
        savedRequest = await BulkScrapRequest.create(requestData);
        console.log(`✅ Bulk scrap request saved to database: ID=${savedRequest.id}`);
      } catch (saveError) {
        console.error('❌ Error saving bulk scrap request to database:', saveError);
        // Continue with notifications even if save fails (for backward compatibility)
        // But log the error for debugging
      }

      // Prepare notification message
      const quantityText = `${(quantity / 1000).toFixed(2)} ton${quantity !== 1000 ? 's' : ''}`; // Convert kgs to tons
      const title = 'New Bulk Scrap Purchase Request';
      
      // Build body with subcategory details if available
      let body = `${buyerName} is looking to buy ${quantityText} of ${scrap_type || 'scrap'} nearby.`;
      if (parsedSubcategories && parsedSubcategories.length > 0) {
        const subcategoryNames = parsedSubcategories.map(s => s.subcategory_name).join(', ');
        body = `${buyerName} is looking to buy ${quantityText} of ${subcategoryNames} nearby.`;
      }
      body += ' Tap to view details.';

      // Prepare notification data - ensure proper types and stringify arrays/objects
      const notificationData = {
        type: 'bulk_scrap_purchase',
        buyer_id: String(buyer_id),
        latitude: String(lat),
        longitude: String(lng),
        quantity: String(quantity),
        scrap_type: scrap_type || '',
        subcategories: parsedSubcategories ? JSON.stringify(parsedSubcategories) : '',
        subcategory_id: subcategory_id ? String(subcategory_id) : '',
        preferred_price: preferred_price ? String(preferred_price) : '',
        when_needed: when_needed || '',
        location: location || '',
        additional_notes: additional_notes || '',
        documents: documentUrls.length > 0 ? JSON.stringify(documentUrls) : ''
      };

      // Send notifications to all users simultaneously
      let notificationResult = null;
      if (fcmTokens.length > 0) {
        try {
          notificationResult = await sendMulticastNotification(
            fcmTokens,
            title,
            body,
            notificationData
          );
          console.log('✅ Bulk notifications sent:', {
            successCount: notificationResult.successCount,
            failureCount: notificationResult.failureCount
          });
        } catch (notifError) {
          console.error('❌ Error sending notifications:', notifError);
          // Continue even if notifications fail
        }
      } else {
        console.warn('⚠️ No FCM tokens found - skipping notifications');
      }

      // Note: Status update is now done BEFORE creating the bulk request (see code above)
      // This prevents race conditions - if the update fails, we don't create the bulk request

      // Return success response
      return res.json({
        status: 'success',
        msg: 'Bulk scrap purchase request created and notifications sent',
        data: {
          request_id: savedRequest?.id || null,
          buyer_id: buyer_id,
          buyer_name: buyerName,
          quantity: quantity,
          scrap_type: scrap_type || null,
          subcategories: parsedSubcategories || null,
          documents: documentUrls.length > 0 ? documentUrls : null,
          location: {
            latitude: lat,
            longitude: lng,
            address: location || null
          },
          notified_shops: {
            total: uniqueShops.length,
            b2b_count: buyerUserType === 'SR' ? 0 : uniqueShops.filter(s => s.user_type === 'S').length, // SR buyers don't notify B2B shops
            b2c_count: uniqueShops.filter(s => s.user_type === 'R').length,
            unique_users: userShopMap.size,
            with_fcm_tokens: fcmTokens.length
          },
          notifications: notificationResult ? {
            success_count: notificationResult.successCount,
            failure_count: notificationResult.failureCount
          } : null
        }
      });
    } catch (error) {
      console.error('❌ V2BulkScrapController.createBulkPurchaseRequest error:', error);
      return res.status(500).json({
        status: 'error',
        msg: 'Internal server error',
        data: null
      });
    }
  }

  /**
   * GET /api/v2/bulk-scrap/requests
   * Get bulk scrap purchase requests for a user (filtered by location)
   * Query params: user_id, latitude, longitude, user_type
   */
  static async getBulkScrapRequests(req, res) {
    try {
      const { user_id, latitude, longitude, user_type } = req.query;

      console.log('📦 V2BulkScrapController.getBulkScrapRequests called');
      console.log('   Query params:', { user_id, latitude, longitude, user_type });

      // Validate required fields
      if (!user_id) {
        return res.status(400).json({
          status: 'error',
          msg: 'Missing required field: user_id',
          data: null
        });
      }

      // Validate latitude and longitude if provided
      let lat = null;
      let lng = null;
      if (latitude && longitude) {
        lat = parseFloat(latitude);
        lng = parseFloat(longitude);
        if (isNaN(lat) || isNaN(lng)) {
          return res.status(400).json({
            status: 'error',
            msg: 'Invalid latitude or longitude',
            data: null
          });
        }
      }

      // Get user's shop location if lat/lng not provided
      // For SR users, we need to determine which shop type they're using (B2B or B2C)
      let userShopType = null; // Will be 'b2b' or 'b2c' for SR users
      if (!lat || !lng || user_type === 'SR') {
        try {
          // Try to find shop by user_id - use findAllByUserId to get all shops
          const shops = await Shop.findAllByUserId(user_id);
          if (shops && shops.length > 0) {
            // For SR users, check which shop type they're using based on shop_type
            // Since SR buyers only notify R shops (B2C), bulk requests should only be visible in B2C dashboard
            // So we prefer B2C shop location and only show bulk requests when using B2C shop
            if (user_type === 'SR') {
              // Find B2C shop (shop_type 2 or 3) and B2B shop (shop_type 1 or 4)
              let b2cShop = shops.find(s => {
                const shopType = typeof s.shop_type === 'string' ? parseInt(s.shop_type) : s.shop_type;
                return shopType === 2 || shopType === 3;
              });
              let b2bShop = shops.find(s => {
                const shopType = typeof s.shop_type === 'string' ? parseInt(s.shop_type) : s.shop_type;
                return shopType === 1 || shopType === 4;
              });
              
              // If lat/lng provided, determine shop type based on which shop location matches
              if (lat && lng) {
                // Calculate distances to find which shop location matches the provided coordinates
                const R = 6371; // Earth's radius in km
                let b2cDistance = Infinity;
                let b2bDistance = Infinity;
                
                if (b2cShop && b2cShop.lat_log) {
                  const [shopLat, shopLng] = b2cShop.lat_log.split(',').map(Number);
                  if (!isNaN(shopLat) && !isNaN(shopLng)) {
                    const dLat = (shopLat - lat) * Math.PI / 180;
                    const dLng = (shopLng - lng) * Math.PI / 180;
                    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                              Math.cos(lat * Math.PI / 180) * Math.cos(shopLat * Math.PI / 180) *
                              Math.sin(dLng / 2) * Math.sin(dLng / 2);
                    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
                    b2cDistance = R * c;
                  }
                }
                
                if (b2bShop && b2bShop.lat_log) {
                  const [shopLat, shopLng] = b2bShop.lat_log.split(',').map(Number);
                  if (!isNaN(shopLat) && !isNaN(shopLng)) {
                    const dLat = (shopLat - lat) * Math.PI / 180;
                    const dLng = (shopLng - lng) * Math.PI / 180;
                    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                              Math.cos(lat * Math.PI / 180) * Math.cos(shopLat * Math.PI / 180) *
                              Math.sin(dLng / 2) * Math.sin(dLng / 2);
                    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
                    b2bDistance = R * c;
                  }
                }
                
                // If coordinates are closer to B2C shop, assume B2C dashboard
                // If coordinates are closer to B2B shop, assume B2B dashboard (don't show bulk requests)
                if (b2cDistance < b2bDistance && b2cDistance < 1) { // Within 1km of B2C shop
                  userShopType = 'b2c';
                  console.log(`✅ SR user: Coordinates closer to B2C shop (distance: ${b2cDistance.toFixed(2)}km) - assuming B2C dashboard`);
                } else if (b2bDistance < b2cDistance && b2bDistance < 1) { // Within 1km of B2B shop
                  userShopType = 'b2b';
                  console.log(`✅ SR user: Coordinates closer to B2B shop (distance: ${b2bDistance.toFixed(2)}km) - assuming B2B dashboard`);
                } else {
                  // Coordinates don't match either shop closely - default to B2C if B2C shop exists
                  if (b2cShop) {
                    userShopType = 'b2c';
                    console.log(`✅ SR user: Coordinates don't match shops closely - defaulting to B2C shop`);
                  } else {
                    userShopType = 'b2b';
                    console.log(`✅ SR user: No B2C shop found - defaulting to B2B`);
                  }
                }
              } else {
                // No lat/lng provided - prefer B2C shop for bulk requests
                const shopToUse = b2cShop || b2bShop || shops[0];
                if (shopToUse && shopToUse.lat_log) {
                  const [shopLat, shopLng] = shopToUse.lat_log.split(',').map(Number);
                  if (!isNaN(shopLat) && !isNaN(shopLng)) {
                    lat = shopLat;
                    lng = shopLng;
                    const shopTypeNum = typeof shopToUse.shop_type === 'string' ? parseInt(shopToUse.shop_type) : shopToUse.shop_type;
                    userShopType = (shopTypeNum === 2 || shopTypeNum === 3) ? 'b2c' : (shopTypeNum === 1 || shopTypeNum === 4) ? 'b2b' : null;
                    console.log(`✅ Using shop location from shop ID ${shopToUse.id} (shop_type: ${shopTypeNum}): ${lat}, ${lng}`);
                    console.log(`✅ SR user: Determined shop type as '${userShopType}'`);
                  }
                }
              }
            } else {
              // Non-SR users: Find first shop with location
            for (const shop of shops) {
              if (shop && shop.lat_log) {
                const [shopLat, shopLng] = shop.lat_log.split(',').map(Number);
                if (!isNaN(shopLat) && !isNaN(shopLng)) {
                  lat = shopLat;
                  lng = shopLng;
                  console.log(`✅ Using shop location from shop ID ${shop.id}: ${lat}, ${lng}`);
                  break;
                  }
                }
              }
            }
          }
        } catch (shopError) {
          console.error('❌ Error fetching shop location:', shopError);
        }
      }

      if (!lat || !lng) {
        console.warn(`⚠️  No location found for user ${user_id}. Returning empty array.`);
        return res.json({
          status: 'success',
          msg: 'Bulk scrap requests retrieved successfully (no location available)',
          data: []
        });
      }

      // For SR users: Only return bulk requests if they're using B2C shop (b2c dashboard)
      // SR buyers only send to R shops, so SR users should only see them in B2C dashboard
      if (user_type === 'SR' && userShopType === 'b2b') {
        console.log(`📋 SR user viewing B2B dashboard - returning empty array (bulk requests only visible in B2C dashboard)`);
        return res.json({
          status: 'success',
          msg: 'Bulk scrap requests retrieved successfully',
          data: []
        });
      }

      // Get bulk scrap requests for this user
      let requests = [];
      try {
        requests = await BulkScrapRequest.findForUser(user_id, lat, lng, user_type);
        console.log(`✅ Returning ${requests.length} bulk scrap requests`);
        if (requests.length > 0) {
          console.log('   Sample request:', JSON.stringify(requests[0], null, 2));
        }
      } catch (error) {
        // Handle case where table doesn't exist yet
        if (error.name === 'ResourceNotFoundException' || error.__type === 'com.amazonaws.dynamodb.v20120810#ResourceNotFoundException') {
          console.warn('⚠️  Table "bulk_scrap_requests" does not exist yet. Returning empty array.');
          requests = [];
        } else {
          // Re-throw other errors
          throw error;
        }
      }

      return res.json({
        status: 'success',
        msg: 'Bulk scrap requests retrieved successfully',
        data: requests
      });
    } catch (error) {
      console.error('❌ V2BulkScrapController.getBulkScrapRequests error:', error);
      return res.status(500).json({
        status: 'error',
        msg: 'Internal server error',
        data: null
      });
    }
  }

  /**
   * GET /api/v2/bulk-scrap/requests/accepted
   * Get bulk scrap requests accepted by the current user
   * Query params: user_id, latitude (optional), longitude (optional), user_type
   */
  static async getAcceptedBulkScrapRequests(req, res) {
    try {
      const { user_id, latitude, longitude, user_type } = req.query;

      console.log('📦 V2BulkScrapController.getAcceptedBulkScrapRequests called');
      console.log('   Query params:', { user_id, latitude, longitude, user_type });

      // Validate required fields
      if (!user_id) {
        return res.status(400).json({
          status: 'error',
          msg: 'Missing required field: user_id',
          data: null
        });
      }

      // Validate latitude and longitude if provided
      let lat = null;
      let lng = null;
      if (latitude && longitude) {
        lat = parseFloat(latitude);
        lng = parseFloat(longitude);
        if (isNaN(lat) || isNaN(lng)) {
          return res.status(400).json({
            status: 'error',
            msg: 'Invalid latitude or longitude',
            data: null
          });
        }
      }

      // Get user's shop location if lat/lng not provided
      // For SR users, we need to determine which shop type they're using (B2B or B2C)
      let userShopType = null; // Will be 'b2b' or 'b2c' for SR users
      if (!lat || !lng || user_type === 'SR') {
        try {
          // Try to find shop by user_id - use findAllByUserId to get all shops
          const shops = await Shop.findAllByUserId(parseInt(user_id));
          if (shops && shops.length > 0) {
            // For SR users, check which shop type they're using based on shop_type
            // Since SR buyers only notify R shops (B2C), bulk requests should only be visible in B2C dashboard
            // So we prefer B2C shop location and only show bulk requests when using B2C shop
            if (user_type === 'SR') {
              // Find B2C shop (shop_type 2 or 3) and B2B shop (shop_type 1 or 4)
              let b2cShop = shops.find(s => {
                const shopType = typeof s.shop_type === 'string' ? parseInt(s.shop_type) : s.shop_type;
                return shopType === 2 || shopType === 3;
              });
              let b2bShop = shops.find(s => {
                const shopType = typeof s.shop_type === 'string' ? parseInt(s.shop_type) : s.shop_type;
                return shopType === 1 || shopType === 4;
              });
              
              // If lat/lng provided, determine shop type based on which shop location matches
              if (lat && lng) {
                // Calculate distances to find which shop location matches the provided coordinates
                const R = 6371; // Earth's radius in km
                let b2cDistance = Infinity;
                let b2bDistance = Infinity;
                
                if (b2cShop && b2cShop.lat_log) {
                  const [shopLat, shopLng] = b2cShop.lat_log.split(',').map(Number);
                  if (!isNaN(shopLat) && !isNaN(shopLng)) {
                    const dLat = (shopLat - lat) * Math.PI / 180;
                    const dLng = (shopLng - lng) * Math.PI / 180;
                    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                              Math.cos(lat * Math.PI / 180) * Math.cos(shopLat * Math.PI / 180) *
                              Math.sin(dLng / 2) * Math.sin(dLng / 2);
                    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
                    b2cDistance = R * c;
                  }
                }
                
                if (b2bShop && b2bShop.lat_log) {
                  const [shopLat, shopLng] = b2bShop.lat_log.split(',').map(Number);
                  if (!isNaN(shopLat) && !isNaN(shopLng)) {
                    const dLat = (shopLat - lat) * Math.PI / 180;
                    const dLng = (shopLng - lng) * Math.PI / 180;
                    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                              Math.cos(lat * Math.PI / 180) * Math.cos(shopLat * Math.PI / 180) *
                              Math.sin(dLng / 2) * Math.sin(dLng / 2);
                    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
                    b2bDistance = R * c;
                  }
                }
                
                // If coordinates are closer to B2C shop, assume B2C dashboard
                // If coordinates are closer to B2B shop, assume B2B dashboard (don't show bulk requests)
                if (b2cDistance < b2bDistance && b2cDistance < 1) { // Within 1km of B2C shop
                  userShopType = 'b2c';
                  console.log(`✅ SR user: Coordinates closer to B2C shop (distance: ${b2cDistance.toFixed(2)}km) - assuming B2C dashboard`);
                } else if (b2bDistance < b2cDistance && b2bDistance < 1) { // Within 1km of B2B shop
                  userShopType = 'b2b';
                  console.log(`✅ SR user: Coordinates closer to B2B shop (distance: ${b2bDistance.toFixed(2)}km) - assuming B2B dashboard`);
                } else {
                  // Coordinates don't match either shop closely - default to B2C if B2C shop exists
                  if (b2cShop) {
                    userShopType = 'b2c';
                    console.log(`✅ SR user: Coordinates don't match shops closely - defaulting to B2C shop`);
                  } else {
                    userShopType = 'b2b';
                    console.log(`✅ SR user: No B2C shop found - defaulting to B2B`);
                  }
                }
              } else {
                // No lat/lng provided - prefer B2C shop for bulk requests
                const shopToUse = b2cShop || b2bShop || shops[0];
                if (shopToUse && shopToUse.lat_log) {
                  const [shopLat, shopLng] = shopToUse.lat_log.split(',').map(Number);
                  if (!isNaN(shopLat) && !isNaN(shopLng)) {
                    lat = shopLat;
                    lng = shopLng;
                    const shopTypeNum = typeof shopToUse.shop_type === 'string' ? parseInt(shopToUse.shop_type) : shopToUse.shop_type;
                    userShopType = (shopTypeNum === 2 || shopTypeNum === 3) ? 'b2c' : (shopTypeNum === 1 || shopTypeNum === 4) ? 'b2b' : null;
                    console.log(`✅ Using shop location from shop ID ${shopToUse.id} (shop_type: ${shopTypeNum}): ${lat}, ${lng}`);
                    console.log(`✅ SR user: Determined shop type as '${userShopType}'`);
                  }
                }
              }
            } else {
              // Non-SR users: Find first shop with location
            for (const shop of shops) {
              if (shop && shop.lat_log) {
                const [shopLat, shopLng] = shop.lat_log.split(',').map(Number);
                if (!isNaN(shopLat) && !isNaN(shopLng)) {
                  lat = shopLat;
                  lng = shopLng;
                  console.log(`✅ Using shop location from shop ID ${shop.id}: ${lat}, ${lng}`);
                  break;
                  }
                }
              }
            }
          }
        } catch (shopError) {
          console.error('❌ Error fetching shop location:', shopError);
        }
      }

      if (!lat || !lng) {
        console.warn(`⚠️  No location found for user ${user_id}. Returning empty array.`);
        return res.json({
          status: 'success',
          msg: 'Accepted bulk scrap requests retrieved successfully (no location available)',
          data: []
        });
      }

      // For SR users: Only return bulk requests if they're using B2C shop (b2c dashboard)
      // SR buyers only send to R shops, so SR users should only see them in B2C dashboard
      if (user_type === 'SR' && userShopType === 'b2b') {
        console.log(`📋 SR user viewing B2B dashboard - returning empty array (bulk requests only visible in B2C dashboard)`);
        return res.json({
          status: 'success',
          msg: 'Accepted bulk scrap requests retrieved successfully',
          data: []
        });
      }

      // Get accepted bulk scrap requests for this user
      let requests = [];
      try {
        requests = await BulkScrapRequest.findAcceptedByUser(parseInt(user_id), lat, lng, user_type);
        console.log(`✅ Returning ${requests.length} accepted bulk scrap requests`);
        if (requests.length > 0) {
          console.log('   Sample request:', JSON.stringify(requests[0], null, 2));
        }
      } catch (error) {
        // Handle case where table doesn't exist yet
        if (error.name === 'ResourceNotFoundException' || error.__type === 'com.amazonaws.dynamodb.v20120810#ResourceNotFoundException') {
          console.warn('⚠️  Table "bulk_scrap_requests" does not exist yet. Returning empty array.');
          requests = [];
        } else {
          // Re-throw other errors
          throw error;
        }
      }

      return res.json({
        status: 'success',
        msg: 'Accepted bulk scrap requests retrieved successfully',
        data: requests
      });
    } catch (error) {
      console.error('❌ V2BulkScrapController.getAcceptedBulkScrapRequests error:', error);
      return res.status(500).json({
        status: 'error',
        msg: 'Internal server error',
        data: null
      });
    }
  }

  /**
   * POST /api/v2/bulk-scrap/requests/:requestId/accept
   * Accept a bulk scrap purchase request (R, S, SR users)
   * Body: { user_id: number, user_type: 'R'|'S'|'SR', quantity?: number (in kgs, optional - defaults to remaining quantity), bidding_price?: number (in ₹/kg, optional) }
   */
  static async acceptBulkScrapRequest(req, res) {
    try {
      const { requestId } = req.params;
      const { user_id, user_type, quantity, bidding_price } = req.body;

      // Handle image uploads (from multer)
      const imageUrls = [];
      if (req.files) {
        const imageFiles = Object.values(req.files).flat();
        for (const file of imageFiles) {
          if (file && file.buffer && (file.fieldname?.startsWith('image') || file.mimetype?.startsWith('image/'))) {
            try {
              const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
              const filename = `bulk-scrap-participation-${user_id}-${requestId}-${Date.now()}-${Math.random().toString(36).substring(7)}${ext}`;
              const s3Result = await uploadBufferToS3(file.buffer, filename, 'bulk-scrap-participation-images');
              imageUrls.push(s3Result.s3Url);
              console.log(`✅ Participation image uploaded: ${s3Result.s3Url}`);
            } catch (uploadError) {
              console.error('❌ Error uploading participation image:', uploadError);
              // Continue even if image upload fails
            }
          }
        }
      }

      console.log('📥 [acceptBulkScrapRequest] Request received:', {
        requestId,
        user_id,
        user_type,
        quantity,
        bidding_price,
        imagesCount: imageUrls.length
      });

      if (!user_id || !user_type) {
        return res.status(400).json({
          status: 'error',
          msg: 'Missing required fields: user_id, user_type',
          data: null
        });
      }

      // Validate user type
      const validTypes = ['R', 'S', 'SR'];
      if (!validTypes.includes(user_type)) {
        return res.status(400).json({
          status: 'error',
          msg: 'Invalid user_type. Must be R, S, or SR',
          data: null
        });
      }

      // Convert requestId to number (table schema expects number)
      const requestIdNum = typeof requestId === 'string' ? parseInt(requestId) : (typeof requestId === 'number' ? requestId : parseInt(String(requestId)));
      if (isNaN(requestIdNum)) {
        return res.status(400).json({
          status: 'error',
          msg: 'Invalid request ID',
          data: null
        });
      }

      // Find the bulk scrap request
      const client = getDynamoDBClient();
      const { GetCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
      
      const getCommand = new GetCommand({
        TableName: 'bulk_scrap_requests',
        Key: { id: requestIdNum }
      });

      let response;
      try {
        response = await client.send(getCommand);
      } catch (getError) {
        // Handle case where table doesn't exist
        if (getError.name === 'ResourceNotFoundException' || getError.__type === 'com.amazonaws.dynamodb.v20120810#ResourceNotFoundException') {
          return res.status(404).json({
            status: 'error',
            msg: 'Bulk scrap request not found (table does not exist)',
            data: null
          });
        }
        throw getError;
      }
      
      if (!response.Item) {
        return res.status(404).json({
          status: 'error',
          msg: 'Bulk scrap request not found',
          data: null
        });
      }

      const request = response.Item;
      const requestedQuantity = typeof request.quantity === 'string' ? parseFloat(request.quantity) : (typeof request.quantity === 'number' ? request.quantity : parseFloat(String(request.quantity)));

      // Check if already accepted by this user
      let acceptedVendors = [];
      if (request.accepted_vendors) {
        try {
          acceptedVendors = typeof request.accepted_vendors === 'string'
            ? JSON.parse(request.accepted_vendors)
            : request.accepted_vendors;
        } catch (e) {
          console.warn('⚠️  Could not parse accepted_vendors:', e.message);
        }
      }

      // Calculate total committed quantity
      let totalCommittedQuantity = 0;
      acceptedVendors.forEach((v) => {
        const committedQty = v.committed_quantity || 0;
        totalCommittedQuantity += typeof committedQty === 'string' ? parseFloat(committedQty) : (typeof committedQty === 'number' ? committedQty : parseFloat(String(committedQty)) || 0);
      });

      // Check if this vendor already accepted
      const vendorShop = await Shop.findByUserId(parseInt(user_id));
      const vendorShopId = vendorShop?.id || null;
      
      const existingVendorIndex = acceptedVendors.findIndex((v) => 
        (v.user_id === parseInt(user_id)) || (v.shop_id && v.shop_id === vendorShopId)
      );

      // Parse and validate quantity
      let committedQuantity = 0;
      if (quantity !== undefined && quantity !== null) {
        committedQuantity = typeof quantity === 'string' ? parseFloat(quantity) : (typeof quantity === 'number' ? quantity : parseFloat(String(quantity)) || 0);
        if (isNaN(committedQuantity) || committedQuantity <= 0) {
          return res.status(400).json({
            status: 'error',
            msg: 'Invalid quantity. Must be a positive number',
            data: null
          });
        }
      } else {
        // If no quantity provided, use remaining quantity
        const remainingQuantity = requestedQuantity - totalCommittedQuantity;
        if (remainingQuantity <= 0) {
          return res.status(400).json({
            status: 'error',
            msg: 'No remaining quantity available. This request is fully committed.',
            data: null
          });
        }
        committedQuantity = remainingQuantity;
      }

      // Check if committed quantity exceeds remaining quantity
      const remainingQuantity = requestedQuantity - totalCommittedQuantity;
      if (committedQuantity > remainingQuantity) {
        return res.status(400).json({
          status: 'error',
          msg: `Cannot commit ${committedQuantity} kg. Only ${remainingQuantity.toFixed(2)} kg remaining.`,
          data: null
        });
      }

      // Parse and validate bidding_price if provided
      let biddingPriceValue = null;
      if (bidding_price !== undefined && bidding_price !== null) {
        biddingPriceValue = typeof bidding_price === 'string' ? parseFloat(bidding_price) : (typeof bidding_price === 'number' ? bidding_price : parseFloat(String(bidding_price)) || null);
        if (isNaN(biddingPriceValue) || biddingPriceValue <= 0) {
          return res.status(400).json({
            status: 'error',
            msg: 'Invalid bidding_price. Must be a positive number',
            data: null
          });
        }
      }

      // Update or add vendor
      if (existingVendorIndex >= 0) {
        // Update existing vendor's committed quantity and bidding price
        acceptedVendors[existingVendorIndex].committed_quantity = committedQuantity;
        if (biddingPriceValue !== null) {
          acceptedVendors[existingVendorIndex].bidding_price = biddingPriceValue;
        }
        // Update images if provided
        if (imageUrls.length > 0) {
          acceptedVendors[existingVendorIndex].images = imageUrls;
        }
        // Set status to 'participated' if not already set or if updating participation
        if (!acceptedVendors[existingVendorIndex].status) {
          acceptedVendors[existingVendorIndex].status = 'participated';
        }
        acceptedVendors[existingVendorIndex].updated_at = new Date().toISOString();
      } else {
        // Add new vendor
        const vendorEntry = {
          user_id: parseInt(user_id),
          user_type: user_type,
          shop_id: vendorShopId,
          committed_quantity: committedQuantity,
          status: 'participated', // Initial status when vendor participates
          accepted_at: new Date().toISOString(),
          images: imageUrls.length > 0 ? imageUrls : null // Store image URLs if provided
        };
        if (biddingPriceValue !== null) {
          vendorEntry.bidding_price = biddingPriceValue;
        }
        acceptedVendors.push(vendorEntry);
      }

      // Recalculate total committed quantity AFTER adding/updating vendor
      totalCommittedQuantity = 0;
      acceptedVendors.forEach((v) => {
        const committedQty = v.committed_quantity || 0;
        totalCommittedQuantity += typeof committedQty === 'string' ? parseFloat(committedQty) : (typeof committedQty === 'number' ? committedQty : parseFloat(String(committedQty)) || 0);
      });

      // Determine new bulk request status
      // If total committed quantity equals or exceeds requested quantity, mark as 'order_full_filled'
      let newBulkRequestStatus = request.status || 'active';
      if (totalCommittedQuantity >= requestedQuantity) {
        newBulkRequestStatus = 'order_full_filled';
        // Update all vendors' status to 'order_full_filled' if not already progressed beyond 'participated'
        acceptedVendors.forEach((v) => {
          if (!v.status || v.status === 'participated') {
            v.status = 'order_full_filled';
            v.updated_at = new Date().toISOString();
          }
        });
        console.log(`✅ Bulk request ${requestIdNum} is now FULLY FILLED: ${totalCommittedQuantity.toFixed(2)} kg >= ${requestedQuantity.toFixed(2)} kg`);
      }

      // Update the request with new status, accepted_vendors, and total_committed_quantity
      const updateCommand = new UpdateCommand({
        TableName: 'bulk_scrap_requests',
        Key: { id: requestIdNum },
        UpdateExpression: 'SET accepted_vendors = :acceptedVendors, total_committed_quantity = :totalCommittedQuantity, #status = :status, updated_at = :updatedAt',
        ExpressionAttributeNames: {
          '#status': 'status'
        },
        ExpressionAttributeValues: {
          ':acceptedVendors': JSON.stringify(acceptedVendors),
          ':totalCommittedQuantity': totalCommittedQuantity,
          ':status': newBulkRequestStatus,
          ':updatedAt': new Date().toISOString()
        }
      });

      await client.send(updateCommand);

      // Send notification to buyer
      try {
        const buyer = await User.findById(request.buyer_id);
        if (buyer && buyer.fcm_token) {
          const vendor = await User.findById(parseInt(user_id));
          const vendorName = vendor?.name || 'A vendor';
          
          const { sendVendorNotification } = require('../utils/fcmNotification');
          await sendVendorNotification(
            buyer.fcm_token,
            'Vendor Started Participating',
            `${vendorName} started participating in your bulk scrap request`,
            {
              type: 'bulk_scrap_accepted',
              request_id: String(requestIdNum),
              vendor_id: parseInt(user_id),
              vendor_name: vendorName
            }
          );
        }
      } catch (notifErr) {
        console.error('❌ Error sending notification to buyer:', notifErr);
        // Don't fail the request if notification fails
      }

      console.log(`✅ Bulk scrap request ${requestIdNum} accepted by user_id ${user_id}`);

      return res.json({
        status: 'success',
        msg: 'Bulk scrap request accepted successfully',
        data: {
          request_id: request.id,
          accepted: true,
          accepted_vendors_count: acceptedVendors.length,
          committed_quantity: committedQuantity,
          total_committed_quantity: totalCommittedQuantity,
          remaining_quantity: requestedQuantity - totalCommittedQuantity
        }
      });
    } catch (error) {
      console.error('❌ V2BulkScrapController.acceptBulkScrapRequest error:', error);
      return res.status(500).json({
        status: 'error',
        msg: 'Internal server error',
        data: null
      });
    }
  }

  /**
   * POST /api/v2/bulk-scrap/requests/:requestId/accept/remove-vendor
   * Remove a vendor from accepted vendors list (only buyer can do this)
   * Body: { buyer_id: number, vendor_user_id: number, reason?: string }
   */
  static async removeVendorFromBulkRequest(req, res) {
    try {
      const { requestId } = req.params;
      const { buyer_id, vendor_user_id, reason } = req.body;

      console.log('📥 [removeVendorFromBulkRequest] Request received:', {
        requestId,
        buyer_id,
        vendor_user_id,
        reason
      });

      if (!buyer_id || !vendor_user_id) {
        return res.status(400).json({
          status: 'error',
          msg: 'Missing required fields: buyer_id, vendor_user_id',
          data: null
        });
      }

      // Convert requestId to number
      const requestIdNum = typeof requestId === 'string' ? parseInt(requestId) : (typeof requestId === 'number' ? requestId : parseInt(String(requestId)));
      if (isNaN(requestIdNum)) {
        return res.status(400).json({
          status: 'error',
          msg: 'Invalid request ID',
          data: null
        });
      }

      // Find the bulk scrap request
      const client = getDynamoDBClient();
      const { GetCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
      
      const getCommand = new GetCommand({
        TableName: 'bulk_scrap_requests',
        Key: { id: requestIdNum }
      });

      let response;
      try {
        response = await client.send(getCommand);
      } catch (getError) {
        if (getError.name === 'ResourceNotFoundException' || getError.__type === 'com.amazonaws.dynamodb.v20120810#ResourceNotFoundException') {
          return res.status(404).json({
            status: 'error',
            msg: 'Bulk scrap request not found (table does not exist)',
            data: null
          });
        }
        throw getError;
      }
      
      if (!response.Item) {
        return res.status(404).json({
          status: 'error',
          msg: 'Bulk scrap request not found',
          data: null
        });
      }

      const request = response.Item;

      // Verify that the requester is the buyer
      const buyerIdNum = typeof buyer_id === 'string' ? parseInt(buyer_id) : (typeof buyer_id === 'number' ? buyer_id : parseInt(String(buyer_id)));
      const requestBuyerId = typeof request.buyer_id === 'string' ? parseInt(request.buyer_id) : (typeof request.buyer_id === 'number' ? request.buyer_id : parseInt(String(request.buyer_id)));
      
      if (buyerIdNum !== requestBuyerId) {
        return res.status(403).json({
          status: 'error',
          msg: 'Only the buyer can remove vendors from this request',
          data: null
        });
      }

      // Get accepted vendors list
      let acceptedVendors = [];
      if (request.accepted_vendors) {
        try {
          acceptedVendors = typeof request.accepted_vendors === 'string'
            ? JSON.parse(request.accepted_vendors)
            : request.accepted_vendors;
        } catch (e) {
          console.warn('⚠️  Could not parse accepted_vendors:', e.message);
        }
      }

      // Find and remove the vendor
      const vendorUserIdNum = typeof vendor_user_id === 'string' ? parseInt(vendor_user_id) : (typeof vendor_user_id === 'number' ? vendor_user_id : parseInt(String(vendor_user_id)));
      const vendorIndex = acceptedVendors.findIndex((v) => 
        (v.user_id === vendorUserIdNum) || (typeof v.user_id === 'string' && parseInt(v.user_id) === vendorUserIdNum)
      );

      if (vendorIndex === -1) {
        return res.status(404).json({
          status: 'error',
          msg: 'Vendor not found in accepted vendors list',
          data: null
        });
      }

      // Remove the vendor
      const removedVendor = acceptedVendors.splice(vendorIndex, 1)[0];

      // Cancel any orders associated with this vendor for this bulk request
      try {
        const Order = require('../models/Order');
        const orders = await Order.findByBulkRequestId(requestIdNum);
        
        // Find orders for this specific vendor
        const vendorOrders = orders.filter(order => {
          const orderVendorId = order.bulk_request_vendor_id;
          return orderVendorId && (
            parseInt(orderVendorId) === vendorUserIdNum ||
            orderVendorId === vendorUserIdNum ||
            String(orderVendorId) === String(vendorUserIdNum)
          );
        });

        // Cancel all orders for this vendor (status 7 = cancelled)
        for (const order of vendorOrders) {
          // Only cancel if order is not already completed or cancelled
          const orderStatus = order.status || 1;
          if (orderStatus !== 5 && orderStatus !== 7) { // 5 = completed, 7 = cancelled
            const { UpdateCommand } = require('@aws-sdk/lib-dynamodb');
            const cancelOrderCommand = new UpdateCommand({
              TableName: 'orders',
              Key: { id: order.id },
              UpdateExpression: 'SET #status = :status, updated_at = :updatedAt',
              ExpressionAttributeNames: {
                '#status': 'status'
              },
              ExpressionAttributeValues: {
                ':status': 7, // Cancelled
                ':updatedAt': new Date().toISOString()
              }
            });
            await client.send(cancelOrderCommand);
            console.log(`✅ Cancelled order ${order.order_number} for removed vendor ${vendorUserIdNum}`);
          }
        }
      } catch (orderError) {
        console.error('❌ Error cancelling orders for removed vendor:', orderError);
        // Don't fail the request if order cancellation fails
      }

      // Recalculate total committed quantity
      let totalCommittedQuantity = 0;
      acceptedVendors.forEach((v) => {
        const committedQty = v.committed_quantity || 0;
        totalCommittedQuantity += typeof committedQty === 'string' ? parseFloat(committedQty) : (typeof committedQty === 'number' ? committedQty : parseFloat(String(committedQty)) || 0);
      });

      // Update request status back to 'active' if it was 'order_full_filled' or 'pickup_started' and now has remaining quantity
      const requestedQuantity = typeof request.quantity === 'string' ? parseFloat(request.quantity) : (typeof request.quantity === 'number' ? request.quantity : parseFloat(String(request.quantity)));
      const currentStatus = request.status || 'active';
      let newStatus = currentStatus;
      
      // If total committed is less than requested, change status to 'active' to allow more vendors to participate
      if (totalCommittedQuantity < requestedQuantity) {
        // Change status from 'order_full_filled' or 'pickup_started' back to 'active'
        if (currentStatus === 'order_full_filled' || currentStatus === 'pickup_started') {
          newStatus = 'active';
          // Update remaining vendors' status back to 'participated' if they were 'order_full_filled' or 'pickup_started'
          acceptedVendors.forEach((v) => {
            if (v.status === 'order_full_filled' || v.status === 'pickup_started') {
              v.status = 'participated';
              v.updated_at = new Date().toISOString();
            }
          });
        }
      }

      // Update the request
      const updateCommand = new UpdateCommand({
        TableName: 'bulk_scrap_requests',
        Key: { id: requestIdNum },
        UpdateExpression: 'SET accepted_vendors = :acceptedVendors, total_committed_quantity = :totalCommittedQuantity, #status = :status, updated_at = :updatedAt',
        ExpressionAttributeNames: {
          '#status': 'status'
        },
        ExpressionAttributeValues: {
          ':acceptedVendors': JSON.stringify(acceptedVendors),
          ':totalCommittedQuantity': totalCommittedQuantity,
          ':status': newStatus,
          ':updatedAt': new Date().toISOString()
        }
      });

      await client.send(updateCommand);

      // Send notification to removed vendor
      try {
        const vendor = await User.findById(vendorUserIdNum);
        if (vendor && vendor.fcm_token) {
          const { sendVendorNotification } = require('../utils/fcmNotification');
          await sendVendorNotification(
            vendor.fcm_token,
            'Removed from Bulk Request',
            `You have been removed from bulk scrap request #${requestIdNum}. Reason: ${reason || 'Scrap quality not proper'}`,
            {
              type: 'bulk_scrap_vendor_removed',
              request_id: String(requestIdNum),
              reason: reason || 'Scrap quality not proper'
            }
          );
        }
      } catch (notifErr) {
        console.error('❌ Error sending notification to removed vendor:', notifErr);
        // Don't fail the request if notification fails
      }

      console.log(`✅ Vendor ${vendorUserIdNum} removed from bulk request ${requestIdNum} by buyer ${buyerIdNum}`);

      return res.json({
        status: 'success',
        msg: 'Vendor removed successfully',
        data: {
          request_id: request.id,
          vendor_removed: true,
          removed_vendor_id: vendorUserIdNum,
          remaining_vendors_count: acceptedVendors.length,
          total_committed_quantity: totalCommittedQuantity,
          remaining_quantity: requestedQuantity - totalCommittedQuantity
        }
      });
    } catch (error) {
      console.error('❌ V2BulkScrapController.removeVendorFromBulkRequest error:', error);
      return res.status(500).json({
        status: 'error',
        msg: 'Internal server error',
        data: null
      });
    }
  }

  /**
   * POST /api/v2/bulk-scrap/requests/:requestId/reject
   * Reject/decline a bulk scrap purchase request
   * Body: { user_id: number, user_type: 'R'|'S'|'SR', rejection_reason?: string }
   */
  static async rejectBulkScrapRequest(req, res) {
    try {
      const { requestId } = req.params;
      const { user_id, user_type, rejection_reason } = req.body;

      console.log('📥 [rejectBulkScrapRequest] Request received:', {
        requestId,
        user_id,
        user_type
      });

      if (!user_id || !user_type) {
        return res.status(400).json({
          status: 'error',
          msg: 'Missing required fields: user_id, user_type',
          data: null
        });
      }

      // Validate user type
      const validTypes = ['R', 'S', 'SR'];
      if (!validTypes.includes(user_type)) {
        return res.status(400).json({
          status: 'error',
          msg: 'Invalid user_type. Must be R, S, or SR',
          data: null
        });
      }

      // Convert requestId to number (table schema expects number)
      const requestIdNum = typeof requestId === 'string' ? parseInt(requestId) : (typeof requestId === 'number' ? requestId : parseInt(String(requestId)));
      if (isNaN(requestIdNum)) {
        return res.status(400).json({
          status: 'error',
          msg: 'Invalid request ID',
          data: null
        });
      }

      // Find the bulk scrap request
      const client = getDynamoDBClient();
      const { GetCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
      
      const getCommand = new GetCommand({
        TableName: 'bulk_scrap_requests',
        Key: { id: requestIdNum }
      });

      let response;
      try {
        response = await client.send(getCommand);
      } catch (getError) {
        // Handle case where table doesn't exist
        if (getError.name === 'ResourceNotFoundException' || getError.__type === 'com.amazonaws.dynamodb.v20120810#ResourceNotFoundException') {
          return res.status(404).json({
            status: 'error',
            msg: 'Bulk scrap request not found (table does not exist)',
            data: null
          });
        }
        throw getError;
      }
      
      if (!response.Item) {
        return res.status(404).json({
          status: 'error',
          msg: 'Bulk scrap request not found',
          data: null
        });
      }

      const request = response.Item;

      // Get rejected vendors list
      let rejectedVendors = [];
      if (request.rejected_vendors) {
        try {
          rejectedVendors = typeof request.rejected_vendors === 'string'
            ? JSON.parse(request.rejected_vendors)
            : request.rejected_vendors;
        } catch (e) {
          console.warn('⚠️  Could not parse rejected_vendors:', e.message);
        }
      }

      // Check if already rejected
      const vendorShop = await Shop.findByUserId(parseInt(user_id));
      const vendorShopId = vendorShop?.id || null;
      const alreadyRejected = rejectedVendors.some((v) => 
        (v.user_id === parseInt(user_id)) || (v.shop_id && v.shop_id === vendorShopId)
      );

      if (alreadyRejected) {
        return res.json({
          status: 'success',
          msg: 'Bulk scrap request already rejected by you',
          data: {
            request_id: request.id,
            rejected: true
          }
        });
      }

      // Add to rejected vendors
      rejectedVendors.push({
        user_id: parseInt(user_id),
        user_type: user_type,
        shop_id: vendorShopId,
        rejection_reason: rejection_reason || null,
        rejected_at: new Date().toISOString()
      });

      // Update the request
      const updateCommand = new UpdateCommand({
        TableName: 'bulk_scrap_requests',
        Key: { id: requestIdNum },
        UpdateExpression: 'SET rejected_vendors = :rejectedVendors, updated_at = :updatedAt',
        ExpressionAttributeValues: {
          ':rejectedVendors': JSON.stringify(rejectedVendors),
          ':updatedAt': new Date().toISOString()
        }
      });

      await client.send(updateCommand);

      console.log(`✅ Bulk scrap request ${requestIdNum} rejected by user_id ${user_id}`);

      return res.json({
        status: 'success',
        msg: 'Bulk scrap request rejected successfully',
        data: {
          request_id: request.id,
          rejected: true
        }
      });
    } catch (error) {
      console.error('❌ V2BulkScrapController.rejectBulkScrapRequest error:', error);
      return res.status(500).json({
        status: 'error',
        msg: 'Internal server error',
        data: null
      });
    }
  }

  /**
   * GET /api/v2/bulk-scrap/requests/by-buyer/:buyerId
   * Get bulk scrap purchase requests created by a specific buyer
   * Query params: buyerId (in URL)
   * Returns: Array of bulk scrap requests created by the buyer
   */
  static async getBulkScrapRequestsByBuyer(req, res) {
    try {
      const { buyerId } = req.params;

      console.log('📦 V2BulkScrapController.getBulkScrapRequestsByBuyer called');
      console.log('   Buyer ID:', buyerId);

      if (!buyerId) {
        return res.status(400).json({
          status: 'error',
          msg: 'Missing required field: buyerId',
          data: null
        });
      }

      const buyerIdNum = typeof buyerId === 'string' ? parseInt(buyerId) : (typeof buyerId === 'number' ? buyerId : parseInt(String(buyerId)));
      if (isNaN(buyerIdNum)) {
        return res.status(400).json({
          status: 'error',
          msg: 'Invalid buyer ID',
          data: null
        });
      }

      // Get bulk scrap requests by buyer_id
      let requests = [];
      try {
        requests = await BulkScrapRequest.findByBuyerId(buyerIdNum);
        console.log(`✅ Returning ${requests.length} bulk scrap requests for buyer ${buyerIdNum}`);
        
        // Format requests similar to findForUser
        const formattedRequests = requests.map(request => {
          // Parse subcategories if it's a string
          let parsedSubcategories = request.subcategories;
          if (typeof parsedSubcategories === 'string') {
            try {
              parsedSubcategories = JSON.parse(parsedSubcategories);
            } catch (e) {
              console.warn('⚠️  Could not parse subcategories:', e.message);
              parsedSubcategories = null;
            }
          }

          // Parse documents if it's a string
          let parsedDocuments = request.documents;
          if (typeof parsedDocuments === 'string') {
            try {
              parsedDocuments = JSON.parse(parsedDocuments);
            } catch (e) {
              console.warn('⚠️  Could not parse documents:', e.message);
              parsedDocuments = null;
            }
          }

          return {
            id: typeof request.id === 'string' ? parseInt(request.id) : (typeof request.id === 'number' ? request.id : parseInt(String(request.id))),
            buyer_id: typeof request.buyer_id === 'string' ? parseInt(request.buyer_id) : (typeof request.buyer_id === 'number' ? request.buyer_id : parseInt(String(request.buyer_id))),
            buyer_name: request.buyer_name || null,
            latitude: typeof request.latitude === 'string' ? parseFloat(request.latitude) : (typeof request.latitude === 'number' ? request.latitude : parseFloat(String(request.latitude))),
            longitude: typeof request.longitude === 'string' ? parseFloat(request.longitude) : (typeof request.longitude === 'number' ? request.longitude : parseFloat(String(request.longitude))),
            scrap_type: request.scrap_type || null,
            subcategories: parsedSubcategories,
            subcategory_id: request.subcategory_id ? (typeof request.subcategory_id === 'string' ? parseInt(request.subcategory_id) : (typeof request.subcategory_id === 'number' ? request.subcategory_id : parseInt(String(request.subcategory_id)))) : null,
            quantity: typeof request.quantity === 'string' ? parseFloat(request.quantity) : (typeof request.quantity === 'number' ? request.quantity : parseFloat(String(request.quantity))),
            preferred_price: request.preferred_price ? (typeof request.preferred_price === 'string' ? parseFloat(request.preferred_price) : (typeof request.preferred_price === 'number' ? request.preferred_price : parseFloat(String(request.preferred_price)))) : null,
            preferred_distance: typeof request.preferred_distance === 'string' ? parseFloat(request.preferred_distance) : (typeof request.preferred_distance === 'number' ? request.preferred_distance : parseFloat(String(request.preferred_distance || 50))),
            when_needed: request.when_needed || null,
            location: request.location || null,
            additional_notes: request.additional_notes || null,
            documents: parsedDocuments,
            status: request.status || 'active',
            accepted_vendors: request.accepted_vendors ? (typeof request.accepted_vendors === 'string' ? JSON.parse(request.accepted_vendors) : request.accepted_vendors) : [],
            rejected_vendors: request.rejected_vendors ? (typeof request.rejected_vendors === 'string' ? JSON.parse(request.rejected_vendors) : request.rejected_vendors) : [],
            created_at: request.created_at || new Date().toISOString(),
            updated_at: request.updated_at || new Date().toISOString()
          };
        });

        return res.json({
          status: 'success',
          msg: 'Bulk scrap requests retrieved successfully',
          data: formattedRequests
        });
      } catch (error) {
        // Handle case where table doesn't exist yet
        if (error.name === 'ResourceNotFoundException' || error.__type === 'com.amazonaws.dynamodb.v20120810#ResourceNotFoundException') {
          console.warn('⚠️  Table "bulk_scrap_requests" does not exist yet. Returning empty array.');
          return res.json({
            status: 'success',
            msg: 'Bulk scrap requests retrieved successfully (table does not exist)',
            data: []
          });
        } else {
          // Re-throw other errors
          throw error;
        }
      }
    } catch (error) {
      console.error('❌ V2BulkScrapController.getBulkScrapRequestsByBuyer error:', error);
      return res.status(500).json({
        status: 'error',
        msg: 'Internal server error',
        data: null
      });
    }
  }

  /**
   * POST /api/v2/bulk-scrap/requests/:requestId/start-pickup
   * Start pickup for a bulk scrap request (creates orders for each participating vendor)
   * Body: { buyer_id: number, user_type: string }
   * Returns: Array of created orders
   */
  static async startPickupForBulkRequest(req, res) {
    try {
      const { requestId } = req.params;
      const { buyer_id, user_type } = req.body;

      console.log('🚚 [startPickupForBulkRequest] Request received:', {
        requestId,
        buyer_id,
        user_type
      });

      if (!buyer_id || !user_type) {
        return res.status(400).json({
          status: 'error',
          msg: 'Missing required fields: buyer_id, user_type',
          data: null
        });
      }

      // Convert requestId to number
      const requestIdNum = typeof requestId === 'string' ? parseInt(requestId) : (typeof requestId === 'number' ? requestId : parseInt(String(requestId)));
      if (isNaN(requestIdNum)) {
        return res.status(400).json({
          status: 'error',
          msg: 'Invalid request ID',
          data: null
        });
      }

      // Get the bulk scrap request
      const client = getDynamoDBClient();
      const { GetCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
      
      const getCommand = new GetCommand({
        TableName: 'bulk_scrap_requests',
        Key: { id: requestIdNum }
      });

      const response = await client.send(getCommand);
      if (!response.Item) {
        return res.status(404).json({
          status: 'error',
          msg: 'Bulk scrap request not found',
          data: null
        });
      }

      const bulkRequest = response.Item;

      // Verify buyer
      if (parseInt(bulkRequest.buyer_id) !== parseInt(buyer_id)) {
        return res.status(403).json({
          status: 'error',
          msg: 'Only the buyer can start pickup for this request',
          data: null
        });
      }

      // Check if bulk request is fully filled before allowing pickup
      const requestStatus = bulkRequest.status || 'active';
      if (requestStatus !== 'order_full_filled') {
        // Calculate total committed quantity to provide helpful error message
        let totalCommittedQuantity = bulkRequest.total_committed_quantity || 0;
        const requestedQuantity = typeof bulkRequest.quantity === 'string' ? parseFloat(bulkRequest.quantity) : (typeof bulkRequest.quantity === 'number' ? bulkRequest.quantity : parseFloat(String(bulkRequest.quantity)) || 0);
        
        return res.status(400).json({
          status: 'error',
          msg: `Cannot start pickup. The bulk request is not fully filled yet. ${totalCommittedQuantity.toFixed(2)} kg committed out of ${requestedQuantity.toFixed(2)} kg requested.`,
          data: {
            current_status: requestStatus,
            committed_quantity: totalCommittedQuantity,
            requested_quantity: requestedQuantity,
            remaining_quantity: requestedQuantity - totalCommittedQuantity
          }
        });
      }

      // Get accepted vendors
      let acceptedVendors = [];
      if (bulkRequest.accepted_vendors) {
        try {
          acceptedVendors = typeof bulkRequest.accepted_vendors === 'string'
            ? JSON.parse(bulkRequest.accepted_vendors)
            : bulkRequest.accepted_vendors;
        } catch (e) {
          console.warn('⚠️  Could not parse accepted_vendors:', e.message);
        }
      }

      if (acceptedVendors.length === 0) {
        return res.status(400).json({
          status: 'error',
          msg: 'No vendors have participated in this request yet',
          data: null
        });
      }

      // Get buyer info
      const buyer = await User.findById(parseInt(buyer_id));
      const buyerName = buyer?.name || 'Buyer';

      // Get Order model
      const Order = require('../models/Order');

      // Parse subcategories
      let subcategories = [];
      if (bulkRequest.subcategories) {
        try {
          subcategories = typeof bulkRequest.subcategories === 'string'
            ? JSON.parse(bulkRequest.subcategories)
            : bulkRequest.subcategories;
        } catch (e) {
          console.warn('⚠️  Could not parse subcategories:', e.message);
        }
      }

      // Create orders for each participating vendor
      const createdOrders = [];
      const OrderLocationHistory = require('../models/OrderLocationHistory');

      for (const vendor of acceptedVendors) {
        try {
          // Get vendor shop
          const vendorShop = await Shop.findByUserId(vendor.user_id);
          if (!vendorShop) {
            console.warn(`⚠️  Shop not found for vendor ${vendor.user_id}, skipping order creation`);
            continue;
          }

          // Get vendor user
          const vendorUser = await User.findById(vendor.user_id);
          const vendorName = vendorUser?.name || vendorShop.shopname || 'Vendor';

          // Calculate order items from subcategories (proportional to committed quantity)
          const totalRequestQuantity = bulkRequest.quantity || 1;
          const vendorCommittedQty = vendor.committed_quantity || 0;
          const orderItems = [];

          if (subcategories && subcategories.length > 0) {
            for (const subcat of subcategories) {
              const subcatQuantity = subcat.quantity || 0;
              const proportionalQty = (subcatQuantity / totalRequestQuantity) * vendorCommittedQty;
              
              if (proportionalQty > 0) {
                orderItems.push({
                  category_id: subcat.subcategory_id || subcat.id,
                  material_name: subcat.subcategory_name || 'Scrap',
                  expected_weight_kg: proportionalQty,
                  quantity: 1,
                  price_per_kg: vendor.bidding_price || subcat.preferred_price || 0
                });
              }
            }
          } else {
            // Fallback: single item
            orderItems.push({
              category_id: bulkRequest.subcategory_id || null,
              material_name: bulkRequest.scrap_type || 'Bulk Scrap',
              expected_weight_kg: vendorCommittedQty,
              quantity: 1,
              price_per_kg: vendor.bidding_price || bulkRequest.preferred_price || 0
            });
          }

          // Calculate total amount
          const totalAmount = orderItems.reduce((sum, item) => {
            return sum + ((item.expected_weight_kg || 0) * (item.price_per_kg || 0));
          }, 0);

          // Get order number
          const lastOrderNumber = await Order.getLastOrderNumber();
          const orderNumber = lastOrderNumber ? lastOrderNumber + 1 : 10000 + Math.floor(Math.random() * 1000);

          // Create order
          const orderData = {
            order_number: orderNumber,
            shop_id: vendorShop.id,
            customer_id: parseInt(buyer_id), // Buyer is the customer
            orderdetails: JSON.stringify(orderItems),
            customerdetails: JSON.stringify({
              name: buyerName,
              phone: buyer.phone_number || '',
              address: bulkRequest.location || ''
            }),
            shopdetails: JSON.stringify({
              name: vendorName,
              phone: vendorUser?.phone_number || '',
              address: vendorShop.address || ''
            }),
            estim_weight: vendorCommittedQty,
            estim_price: totalAmount,
            total_amount: totalAmount,
            status: 2, // Accepted (will be updated to 3 when vendor starts pickup)
            address: bulkRequest.location || '',
            lat_log: `${bulkRequest.latitude || 0},${bulkRequest.longitude || 0}`,
            payment_method: 'cash',
            bulk_request_id: requestIdNum, // Link to bulk request
            bulk_request_vendor_id: vendor.user_id, // Link to vendor
            bulk_request_bidding_price: vendor.bidding_price || null,
            bulk_request_committed_quantity: vendorCommittedQty,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          };

          const order = await Order.create(orderData);
          createdOrders.push(order);

          // Update vendor status to 'pickup_started'
          vendor.status = 'pickup_started';
          vendor.updated_at = new Date().toISOString();
          vendor.order_id = order.id;
          vendor.order_number = orderNumber;

          // Send notification to vendor
          try {
            if (vendorUser && vendorUser.fcm_token) {
              const { sendVendorNotification } = require('../utils/fcmNotification');
              await sendVendorNotification(
                vendorUser.fcm_token,
                'Pickup Started for Bulk Request',
                `${buyerName} has started pickup for bulk request #${requestIdNum}. Your order #${orderNumber} is ready.`,
                {
                  type: 'bulk_scrap_pickup_started',
                  request_id: String(requestIdNum),
                  order_id: String(order.id),
                  order_number: String(orderNumber),
                  buyer_id: parseInt(buyer_id),
                  buyer_name: buyerName
                }
              );
            }
          } catch (notifErr) {
            console.error(`❌ Error sending notification to vendor ${vendor.user_id}:`, notifErr);
          }

          console.log(`✅ Created order #${orderNumber} for vendor ${vendor.user_id}`);
        } catch (error) {
          console.error(`❌ Error creating order for vendor ${vendor.user_id}:`, error);
          // Continue with other vendors
        }
      }

      // Update bulk request with updated accepted_vendors and status
      const updateCommand = new UpdateCommand({
        TableName: 'bulk_scrap_requests',
        Key: { id: requestIdNum },
        UpdateExpression: 'SET accepted_vendors = :acceptedVendors, updated_at = :updatedAt',
        ExpressionAttributeValues: {
          ':acceptedVendors': JSON.stringify(acceptedVendors),
          ':updatedAt': new Date().toISOString()
        }
      });

      await client.send(updateCommand);

      console.log(`✅ Started pickup for bulk request ${requestIdNum}, created ${createdOrders.length} orders`);

      return res.json({
        status: 'success',
        msg: 'Pickup started successfully',
        data: {
          request_id: requestIdNum,
          orders_created: createdOrders.length,
          orders: createdOrders.map(o => ({
            order_id: o.id,
            order_number: o.order_number,
            vendor_id: o.bulk_request_vendor_id,
            committed_quantity: o.bulk_request_committed_quantity,
            bidding_price: o.bulk_request_bidding_price
          }))
        }
      });
    } catch (error) {
      console.error('❌ V2BulkScrapController.startPickupForBulkRequest error:', error);
      return res.status(500).json({
        status: 'error',
        msg: 'Internal server error',
        data: null
      });
    }
  }

  /**
   * POST /api/v2/bulk-scrap/requests/:requestId/update-buyer-status
   * Update buyer status for a bulk scrap request (arrived, completed)
   * Body: { buyer_id: number, buyer_status: 'arrived' | 'completed' }
   */
  static async updateBulkRequestBuyerStatus(req, res) {
    try {
      const { requestId } = req.params;
      const { buyer_id, buyer_status } = req.body;

      console.log('🔄 [updateBulkRequestBuyerStatus] Request received:', {
        requestId,
        buyer_id,
        buyer_status
      });

      if (!buyer_id || !buyer_status) {
        return res.status(400).json({
          status: 'error',
          msg: 'Missing required fields: buyer_id, buyer_status',
          data: null
        });
      }

      if (!['arrived', 'completed'].includes(buyer_status)) {
        return res.status(400).json({
          status: 'error',
          msg: 'Invalid buyer_status. Must be "arrived" or "completed"',
          data: null
        });
      }

      // Convert requestId to number
      const requestIdNum = typeof requestId === 'string' ? parseInt(requestId) : (typeof requestId === 'number' ? requestId : parseInt(String(requestId)));
      if (isNaN(requestIdNum)) {
        return res.status(400).json({
          status: 'error',
          msg: 'Invalid request ID',
          data: null
        });
      }

      // Get the bulk scrap request
      const client = getDynamoDBClient();
      const { GetCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
      
      const getCommand = new GetCommand({
        TableName: 'bulk_scrap_requests',
        Key: { id: requestIdNum }
      });

      const response = await client.send(getCommand);
      if (!response.Item) {
        return res.status(404).json({
          status: 'error',
          msg: 'Bulk request not found',
          data: null
        });
      }

      const bulkRequest = response.Item;

      // Verify buyer matches
      if (parseInt(bulkRequest.buyer_id) !== parseInt(buyer_id)) {
        return res.status(403).json({
          status: 'error',
          msg: 'You are not authorized to update this request',
          data: null
        });
      }

      // Update buyer_status
      const updateCommand = new UpdateCommand({
        TableName: 'bulk_scrap_requests',
        Key: { id: requestIdNum },
        UpdateExpression: 'SET buyer_status = :buyerStatus, updated_at = :updatedAt',
        ExpressionAttributeValues: {
          ':buyerStatus': buyer_status,
          ':updatedAt': new Date().toISOString()
        }
      });

      await client.send(updateCommand);

      console.log(`✅ Updated buyer_status to ${buyer_status} for bulk request ${requestIdNum}`);

      return res.json({
        status: 'success',
        msg: `Buyer status updated to ${buyer_status}`,
        data: {
          request_id: requestIdNum,
          buyer_status: buyer_status
        }
      });
    } catch (error) {
      console.error('❌ V2BulkScrapController.updateBulkRequestBuyerStatus error:', error);
      return res.status(500).json({
        status: 'error',
        msg: 'Internal server error',
        data: null
      });
    }
  }

  /**
   * GET /api/v2/bulk-scrap/requests/:requestId/orders
   * Get all orders created from a bulk scrap request (for the buyer)
   * Query params: ?buyer_id=number (to verify buyer)
   */
  static async getBulkRequestOrders(req, res) {
    try {
      const { requestId } = req.params;
      const { buyer_id } = req.query;

      console.log('📦 [getBulkRequestOrders] Request received:', {
        requestId,
        buyer_id
      });

      if (!buyer_id) {
        return res.status(400).json({
          status: 'error',
          msg: 'Missing required query param: buyer_id',
          data: null
        });
      }

      // Convert requestId to number
      const requestIdNum = typeof requestId === 'string' ? parseInt(requestId) : (typeof requestId === 'number' ? requestId : parseInt(String(requestId)));
      if (isNaN(requestIdNum)) {
        return res.status(400).json({
          status: 'error',
          msg: 'Invalid request ID',
          data: null
        });
      }

      // Verify the bulk request exists and buyer matches
      const client = getDynamoDBClient();
      const { GetCommand } = require('@aws-sdk/lib-dynamodb');
      
      const getCommand = new GetCommand({
        TableName: 'bulk_scrap_requests',
        Key: { id: requestIdNum }
      });

      let response;
      try {
        response = await client.send(getCommand);
      } catch (getError) {
        if (getError.name === 'ResourceNotFoundException' || getError.__type === 'com.amazonaws.dynamodb.v20120810#ResourceNotFoundException') {
          return res.status(404).json({
            status: 'error',
            msg: 'Bulk scrap request not found (table does not exist)',
            data: null
          });
        }
        throw getError;
      }
      
      if (!response.Item) {
        return res.status(404).json({
          status: 'error',
          msg: 'Bulk scrap request not found',
          data: null
        });
      }

      const bulkRequest = response.Item;

      // Verify buyer
      const buyerIdNum = typeof buyer_id === 'string' ? parseInt(buyer_id) : (typeof buyer_id === 'number' ? buyer_id : parseInt(String(buyer_id)));
      const requestBuyerId = typeof bulkRequest.buyer_id === 'string' ? parseInt(bulkRequest.buyer_id) : (typeof bulkRequest.buyer_id === 'number' ? bulkRequest.buyer_id : parseInt(String(bulkRequest.buyer_id)));
      
      if (buyerIdNum !== requestBuyerId) {
        return res.status(403).json({
          status: 'error',
          msg: 'Only the buyer can view orders for this request',
          data: null
        });
      }

      // Get orders by bulk_request_id
      const Order = require('../models/Order');
      const orders = await Order.findByBulkRequestId(requestIdNum);

      // Format orders with vendor and shop details
      const formattedOrders = await Promise.all(orders.map(async (order) => {
        let vendorName = null;
        let vendorPhone = null;
        let shopName = null;
        let shopAddress = null;

        try {
          if (order.bulk_request_vendor_id) {
            const vendor = await User.findById(order.bulk_request_vendor_id);
            if (vendor) {
              vendorName = vendor.name || null;
              vendorPhone = vendor.mob_num || vendor.phone_number || null;
            }
          }

          if (order.shop_id) {
            const shop = await Shop.findById(order.shop_id);
            if (shop) {
              shopName = shop.shopname || null;
              shopAddress = shop.address || null;
            }
          }
        } catch (err) {
          console.warn(`⚠️  Error fetching vendor/shop details for order ${order.id}:`, err.message);
        }

        // Parse orderdetails
        let orderItems = [];
        if (order.orderdetails) {
          try {
            orderItems = typeof order.orderdetails === 'string'
              ? JSON.parse(order.orderdetails)
              : Array.isArray(order.orderdetails)
                ? order.orderdetails
                : [];
          } catch (e) {
            console.warn('⚠️  Could not parse orderdetails:', e.message);
          }
        }

        return {
          order_id: order.id,
          order_number: order.order_number || order.order_no,
          vendor_id: order.bulk_request_vendor_id,
          vendor_name: vendorName,
          vendor_phone: vendorPhone,
          shop_id: order.shop_id,
          shop_name: shopName,
          shop_address: shopAddress,
          committed_quantity: order.bulk_request_committed_quantity,
          bidding_price: order.bulk_request_bidding_price,
          estimated_weight_kg: order.estim_weight,
          estimated_price: order.estim_price,
          total_amount: order.total_amount,
          status: order.status,
          status_label: order.status === 2 ? 'Accepted' : order.status === 3 ? 'Pickup Started' : order.status === 4 ? 'Arrived' : order.status === 5 ? 'Completed' : order.status === 7 ? 'Cancelled' : 'Unknown',
          address: order.address,
          lat_log: order.lat_log,
          orderdetails: orderItems,
          created_at: order.created_at,
          updated_at: order.updated_at,
          accepted_at: order.accepted_at,
          pickup_initiated_at: order.pickup_initiated_at,
          arrived_at: order.arrived_at,
          pickup_completed_at: order.pickup_completed_at
        };
      }));

      console.log(`✅ Returning ${formattedOrders.length} orders for bulk request ${requestIdNum}`);

      return res.json({
        status: 'success',
        msg: 'Orders retrieved successfully',
        data: formattedOrders
      });
    } catch (error) {
      console.error('❌ V2BulkScrapController.getBulkRequestOrders error:', error);
      return res.status(500).json({
        status: 'error',
        msg: 'Internal server error',
        data: null
      });
    }
  }

  /**
   * POST /api/v2/bulk-scrap/pending-orders
   * Save a pending bulk buy order with payment transaction ID
   * Body: {
   *   user_id: number,
   *   transaction_id: string,
   *   payment_amount: number,
   *   subscription_plan_id: string,
   *   buyer_id: number,
   *   latitude: number,
   *   longitude: number,
   *   scrap_type?: string,
   *   subcategories?: array,
   *   quantity: number,
   *   preferred_price?: number,
   *   preferred_distance?: number,
   *   when_needed?: string,
   *   location?: string,
   *   additional_notes?: string,
   *   documents?: array
   * }
   */
  static async savePendingBulkBuyOrder(req, res) {
    try {
      const {
        user_id,
        transaction_id,
        payment_amount,
        subscription_plan_id,
        buyer_id,
        latitude,
        longitude,
        scrap_type,
        subcategories,
        subcategory_id,
        quantity,
        preferred_price,
        preferred_distance,
        when_needed,
        location,
        additional_notes
      } = req.body;

      console.log('📦 V2BulkScrapController.savePendingBulkBuyOrder called');

      // Validate required fields
      if (!user_id || !transaction_id || !payment_amount || !subscription_plan_id || !buyer_id || !latitude || !longitude || !quantity) {
        return res.status(400).json({
          status: 'error',
          msg: 'Missing required fields: user_id, transaction_id, payment_amount, subscription_plan_id, buyer_id, latitude, longitude, quantity',
          data: null
        });
      }

      // Parse subcategories if it's a JSON string
      let parsedSubcategories = subcategories;
      if (typeof subcategories === 'string') {
        try {
          parsedSubcategories = JSON.parse(subcategories);
        } catch (e) {
          console.warn('⚠️ Failed to parse subcategories JSON:', e);
        }
      }

      // Handle document uploads if present
      let documents = null;
      if (req.files) {
        const documentFiles = [];
        for (let i = 1; i <= 10; i++) {
          const file = req.files[`document${i}`]?.[0];
          if (file) {
            try {
              const ext = path.extname(file.originalname || '');
              const filename = `pending-bulk-buy-doc-${buyer_id}-${Date.now()}-${Math.random().toString(36).substring(7)}${ext}`;
              const s3Result = await uploadBufferToS3(file.buffer, filename, 'bulk-scrap-documents');
              if (s3Result && s3Result.url) {
                documentFiles.push(s3Result.url);
              }
            } catch (uploadError) {
              console.error(`❌ Error uploading document${i}:`, uploadError);
            }
          }
        }
        if (documentFiles.length > 0) {
          documents = documentFiles;
        }
      }

      const orderData = {
        user_id: parseInt(user_id),
        transaction_id: transaction_id,
        payment_amount: parseFloat(payment_amount),
        subscription_plan_id: subscription_plan_id,
        buyer_id: parseInt(buyer_id),
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        scrap_type: scrap_type || null,
        subcategories: parsedSubcategories || null,
        subcategory_id: subcategory_id || null,
        quantity: parseFloat(quantity),
        preferred_price: preferred_price ? parseFloat(preferred_price) : null,
        preferred_distance: preferred_distance ? parseFloat(preferred_distance) : 50,
        when_needed: when_needed || null,
        location: location || null,
        additional_notes: additional_notes || null,
        documents: documents,
        status: 'pending_payment'
      };

      const savedOrder = await PendingBulkBuyOrder.create(orderData);

      console.log('✅ Pending bulk buy order saved:', savedOrder.id);

      return res.json({
        status: 'success',
        msg: 'Pending bulk buy order saved successfully',
        data: {
          pending_order_id: savedOrder.id,
          transaction_id: savedOrder.transaction_id
        }
      });
    } catch (error) {
      console.error('❌ V2BulkScrapController.savePendingBulkBuyOrder error:', error);
      return res.status(500).json({
        status: 'error',
        msg: error.message || 'Failed to save pending bulk buy order',
        data: null
      });
    }
  }

  /**
   * GET /api/v2/bulk-scrap/pending-orders
   * Get all pending bulk buy orders for a user
   * Query: { user_id: number, isSubmitted?: boolean }
   * isSubmitted: false = exclude submitted orders (default), true = only submitted orders
   */
  static async getPendingBulkBuyOrders(req, res) {
    try {
      const { user_id, isSubmitted } = req.query;

      console.log('📦 V2BulkScrapController.getPendingBulkBuyOrders called', { user_id, isSubmitted });

      if (!user_id) {
        return res.status(400).json({
          status: 'error',
          msg: 'Missing required parameter: user_id',
          data: null
        });
      }

      const orders = await PendingBulkBuyOrder.findByUserId(user_id);

      // Parse JSON strings back to objects for response
      let parsedOrders = orders.map(order => {
        const parsed = { ...order };
        if (parsed.subcategories && typeof parsed.subcategories === 'string') {
          try {
            parsed.subcategories = JSON.parse(parsed.subcategories);
          } catch (e) {
            console.warn('⚠️ Failed to parse subcategories:', e);
          }
        }
        if (parsed.documents && typeof parsed.documents === 'string') {
          try {
            parsed.documents = JSON.parse(parsed.documents);
          } catch (e) {
            console.warn('⚠️ Failed to parse documents:', e);
          }
        }
        return parsed;
      });

      // Filter based on isSubmitted parameter
      if (isSubmitted !== undefined) {
        const isSubmittedBool = isSubmitted === 'true' || isSubmitted === true;
        const beforeFilter = parsedOrders.length;
        
        if (isSubmittedBool) {
          // Only show submitted orders
          parsedOrders = parsedOrders.filter(order => order.status === 'submitted');
          console.log(`📊 Filtered to ${parsedOrders.length} submitted orders (from ${beforeFilter} total)`);
        } else {
          // Exclude submitted orders (default behavior)
          // Filter out orders with status 'submitted' or 'cancelled' (case-insensitive check)
          parsedOrders = parsedOrders.filter(order => {
            const status = (order.status || '').toLowerCase();
            return status !== 'submitted' && status !== 'cancelled' && status !== 'completed';
          });
          console.log(`📊 Filtered to ${parsedOrders.length} non-submitted orders (from ${beforeFilter} total)`);
        }
      } else {
        // Default: exclude submitted orders if not specified
        const beforeFilter = parsedOrders.length;
        // Filter out orders with status 'submitted' or 'cancelled' (case-insensitive check)
        parsedOrders = parsedOrders.filter(order => {
          const status = (order.status || '').toLowerCase();
          return status !== 'submitted' && status !== 'cancelled' && status !== 'completed';
        });
        console.log(`📊 Default filter: ${parsedOrders.length} non-submitted orders (from ${beforeFilter} total)`);
      }

      console.log(`✅ Found ${parsedOrders.length} pending bulk buy orders for user ${user_id}`);

      return res.json({
        status: 'success',
        msg: 'Pending bulk buy orders retrieved successfully',
        data: parsedOrders
      });
    } catch (error) {
      console.error('❌ V2BulkScrapController.getPendingBulkBuyOrders error:', error);
      return res.status(500).json({
        status: 'error',
        msg: error.message || 'Failed to get pending bulk buy orders',
        data: null
      });
    }
  }
}

/**
 * Find nearby users by user type(s) within a radius
 * For SR users, finds all their shops and includes each shop separately
 * @param {number} refLat - Reference latitude
 * @param {number} refLng - Reference longitude
 * @param {number} radius - Search radius in km
 * @param {string[]} userTypes - Array of user types to find (e.g., ['S', 'SR'])
 * @param {number|null} limit - Maximum number of users to return (null = return all)
 * @returns {Promise<Array>} Array of users with distance (may include multiple entries for SR users with multiple shops)
 */
async function findNearbyUsersByType(refLat, refLng, radius, userTypes, limit = null) {
  try {
    const client = getDynamoDBClient();
    const allUsers = [];
    let lastKey = null;

    // Build filter expression for user types
    const userTypeConditions = userTypes.map((_, idx) => `user_type = :type${idx}`).join(' OR ');
    const expressionAttributeValues = {};
    userTypes.forEach((type, idx) => {
      expressionAttributeValues[`:type${idx}`] = type;
    });
    expressionAttributeValues[':appType'] = 'vendor_app';
    expressionAttributeValues[':deleted'] = 2;

    // Scan all vendor_app users with specified user types
    do {
      const params = {
        TableName: 'users',
        FilterExpression: `app_type = :appType AND (${userTypeConditions}) AND (attribute_not_exists(del_status) OR del_status <> :deleted)`,
        ExpressionAttributeValues: expressionAttributeValues
      };

      if (lastKey) {
        params.ExclusiveStartKey = lastKey;
      }

      const command = new ScanCommand(params);
      const response = await client.send(command);

      if (response.Items) {
        allUsers.push(...response.Items);
      }

      lastKey = response.LastEvaluatedKey;
    } while (lastKey);

    console.log(`   Found ${allUsers.length} vendor_app users with types: ${userTypes.join(', ')}`);

    // For each user, find their shop(s) and calculate distance
    // For SR users, find ALL shops and include each one separately
    const usersWithDistance = [];

    for (const user of allUsers) {
      try {
        // For SR users, find ALL shops; for others, find first shop
        const isSRUser = user.user_type === 'SR';
        const shops = isSRUser 
          ? await Shop.findAllByUserId(user.id) 
          : [await Shop.findByUserId(user.id)].filter(s => s !== null);
        
        for (const shop of shops) {
          if (shop && shop.lat_log) {
            const [shopLat, shopLng] = shop.lat_log.split(',').map(Number);
            if (!isNaN(shopLat) && !isNaN(shopLng)) {
              // Calculate distance using Haversine formula
              const R = 6371; // Earth's radius in km
              const dLat = (shopLat - refLat) * Math.PI / 180;
              const dLng = (shopLng - refLng) * Math.PI / 180;
              const a =
                Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                Math.cos(refLat * Math.PI / 180) * Math.cos(shopLat * Math.PI / 180) *
                Math.sin(dLng / 2) * Math.sin(dLng / 2);
              const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
              const distance = R * c;

              if (distance <= radius) {
                // Determine effective user_type based on shop_type for SR users
                let effectiveUserType = user.user_type;
                if (isSRUser && shop.shop_type) {
                  // shop_type 1 = B2B (S), shop_type 2 or 3 = B2C (R)
                  if (shop.shop_type === 1) {
                    effectiveUserType = 'S';
                  } else if (shop.shop_type === 2 || shop.shop_type === 3) {
                    effectiveUserType = 'R';
                  }
                }

                usersWithDistance.push({
                  user_id: user.id,
                  user_type: effectiveUserType, // Use effective type based on shop
                  name: user.name || 'User',
                  shop_id: shop.id,
                  distance: distance,
                  shop_name: shop.shopname || shop.name || null,
                  shop_type: shop.shop_type || null,
                  mob_num: user.mob_num || null, // User's phone number
                  contact: shop.contact || null // Shop's contact phone number
                });
              }
            }
          }
        }
      } catch (err) {
        console.error(`   ❌ Error processing user ${user.id}:`, err.message);
        // Continue with next user
      }
    }

    // Sort by distance
    usersWithDistance.sort((a, b) => a.distance - b.distance);
    
    // Return all users if limit is null, otherwise return top N
    if (limit === null || limit === undefined) {
      return usersWithDistance;
    }
    return usersWithDistance.slice(0, limit);
  } catch (error) {
    console.error('❌ findNearbyUsersByType error:', error);
    return [];
  }
}

module.exports = V2BulkScrapController;

