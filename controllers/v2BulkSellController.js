/**
 * V2 Bulk Sell Request Controller
 * Handles bulk scrap sell requests from B2B users
 * Only 'S' type users can see and accept these requests
 */

const User = require('../models/User');
const Shop = require('../models/Shop');
const BulkSellRequest = require('../models/BulkSellRequest');
const { getDynamoDBClient } = require('../config/dynamodb');
const { ScanCommand, GetCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { sendMulticastNotification, sendVendorNotification } = require('../utils/fcmNotification');
const { uploadBufferToS3 } = require('../utils/s3Upload');
const path = require('path');

const resolveUploadMeta = (file, sellerId) => {
  const mimeType = (file?.mimetype || '').toLowerCase();
  const fromName = path.extname(file?.originalname || '').toLowerCase();
  const fallbackMap = {
    'application/pdf': '.pdf',
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif',
    'video/mp4': '.mp4',
    'video/quicktime': '.mov',
    'video/x-m4v': '.m4v',
    'video/webm': '.webm',
    'video/x-matroska': '.mkv',
  };

  const ext = fromName || fallbackMap[mimeType] || '.bin';
  const isVideo = mimeType.startsWith('video/');
  const folder = isVideo ? 'bulk-sell-videos' : 'bulk-sell-documents';
  const prefix = isVideo ? 'bulk-sell-video' : 'bulk-sell-doc';
  const filename = `${prefix}-${sellerId}-${Date.now()}-${Math.random().toString(36).substring(7)}${ext}`;
  return { folder, filename };
};

const normalizeStateKey = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

const extractStateFromLocation = (location) => {
  const text = String(location || '').trim();
  if (!text) return '';
  const parts = text.split(',').map((part) => String(part || '').trim()).filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : '';
};

const toNumberOrNull = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

// Helper function to find nearby users by type (reused from v2BulkScrapController)
async function findNearbyUsersByType(lat, lng, radiusKm, userTypes, shopType) {
  const Shop = require('../models/Shop');
  const User = require('../models/User');
  const allShops = await Shop.getAll();
  const nearbyUsers = [];

  for (const shop of allShops) {
    if (!shop.lat_log || !shop.user_id) continue;

    const [shopLat, shopLng] = shop.lat_log.split(',').map(Number);
    if (isNaN(shopLat) || isNaN(shopLng)) continue;

    // Calculate distance
    const R = 6371;
    const dLat = (shopLat - lat) * Math.PI / 180;
    const dLng = (shopLng - lng) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat * Math.PI / 180) * Math.cos(shopLat * Math.PI / 180) *
              Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;

    if (distance > radiusKm) continue;

    const user = await User.findById(shop.user_id);
    if (!user) continue;

    // Filter by user type
    if (userTypes && !userTypes.includes(user.user_type)) continue;

    // Filter by shop type if specified
    if (shopType !== null && shop.shop_type !== shopType) continue;

    nearbyUsers.push({
      user_id: user.id,
      user_type: user.user_type,
      shop_id: shop.id,
      shop_type: shop.shop_type,
      latitude: shopLat,
      longitude: shopLng,
      mob_num: user.mob_num,
      contact: shop.contact,
      distance: distance
    });
  }

  return nearbyUsers;
}

class V2BulkSellController {
  static parseDocumentUrls(rawUrls) {
    if (!rawUrls) return [];
    try {
      let parsed = rawUrls;
      if (typeof rawUrls === 'string') {
        const trimmed = rawUrls.trim();
        if (!trimmed) return [];
        // Accept either JSON array string or comma separated url string.
        if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
          parsed = JSON.parse(trimmed);
        } else if (trimmed.includes(',')) {
          parsed = trimmed.split(',').map((v) => v.trim()).filter(Boolean);
        } else {
          parsed = [trimmed];
        }
      }
      if (!Array.isArray(parsed)) return [];
      return parsed
        .map((u) => {
          if (typeof u === 'string') return u.trim();
          if (u && typeof u === 'object') {
            return String(u.url || u.s3Url || u.fileUrl || '').trim();
          }
          return '';
        })
        .filter((u) => u.startsWith('http://') || u.startsWith('https://'));
    } catch (e) {
      console.warn('⚠️ Failed to parse document_urls:', e.message);
      return [];
    }
  }

  static mergeDocumentUrls(primaryUrls, additionalNotes) {
    const unique = new Set((primaryUrls || []).filter(Boolean));
    if (!additionalNotes || typeof additionalNotes !== 'string') {
      return Array.from(unique);
    }
    try {
      const parsedNotes = JSON.parse(additionalNotes);
      const mediaFromNotes = Array.isArray(parsedNotes?.mediaUrls)
        ? parsedNotes.mediaUrls
        : [];
      const normalized = V2BulkSellController.parseDocumentUrls(mediaFromNotes);
      normalized.forEach((url) => unique.add(url));
    } catch (_e) {
      // Keep backward compatibility when notes are plain text.
    }
    return Array.from(unique);
  }

  /**
   * POST /api/v2/bulk-sell/create
   * Create a bulk sell request and notify nearby 'S' type users
   * Body: {
   *   seller_id: number (B2B user making the sell request),
   *   latitude: number,
   *   longitude: number,
   *   scrap_type?: string,
   *   subcategory_id?: number,
   *   quantity: number (in kgs),
   *   asking_price?: number,
   *   preferred_distance?: number,
   *   when_available?: string,
   *   location?: string,
   *   additional_notes?: string
   * }
   */
  static async createBulkSellRequest(req, res) {
    try {
      const {
        request_id,
        seller_id,
        latitude,
        longitude,
        scrap_type,
        subcategories,
        subcategory_id,
        quantity,
        asking_price,
        preferred_distance,
        when_available,
        location,
        additional_notes,
        document_urls,
        // Payment fields
        payment_status,
        payment_amount,
        payment_moj_id,
        payment_req_id,
        invoice_id,
        order_value,
        post_star
      } = req.body;

      // Parse subcategories if it's a JSON string
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

      // Handle document uploads
      const requestDocumentUrls = V2BulkSellController.parseDocumentUrls(document_urls);
      const documentUrls = [...requestDocumentUrls];
      if (req.files) {
        const documentFiles = Object.values(req.files).flat();
        for (const file of documentFiles) {
          if (file && file.buffer) {
            try {
              const { folder, filename } = resolveUploadMeta(file, seller_id);
              const s3Result = await uploadBufferToS3(file.buffer, filename, folder);
              documentUrls.push(s3Result.s3Url);
              console.log(`✅ Document uploaded: ${s3Result.s3Url}`);
            } catch (uploadError) {
              console.error('❌ Error uploading document:', uploadError);
            }
          }
        }
      }
      const mergedDocumentUrls = V2BulkSellController.mergeDocumentUrls(documentUrls, additional_notes);

      console.log('📦 V2BulkSellController.createBulkSellRequest called');
      console.log('   Request data:', {
        seller_id,
        latitude,
        longitude,
        scrap_type,
        subcategories_count: parsedSubcategories?.length || 0,
        subcategory_id,
        quantity,
        asking_price,
        preferred_distance,
        documents_count: mergedDocumentUrls.length
      });

      // Validate required fields
      if (!seller_id || !latitude || !longitude || !quantity) {
        return res.status(400).json({
          status: 'error',
          msg: 'Missing required fields: seller_id, latitude, longitude, and quantity are required',
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

      // Verify seller is allowed to create bulk sell requests
      const seller = await User.findById(seller_id);
      if (!seller) {
        return res.status(404).json({
          status: 'error',
          msg: 'Seller not found',
          data: null
        });
      }

      const sellerUserType = seller.user_type;
      if (sellerUserType !== 'S' && sellerUserType !== 'SR' && sellerUserType !== 'M') {
        return res.status(400).json({
          status: 'error',
          msg: 'Only B2B or Marketplace users (user_type S, SR, or M) can create bulk sell requests',
          data: null
        });
      }

      console.log(`✅ Seller verified: ID=${seller_id}, user_type=${sellerUserType}`);

      // Get seller's shop location if not provided
      let sellerLat = lat;
      let sellerLng = lng;
      let sellerShop = null;
      
      const sellerShops = await Shop.findAllByUserId(seller_id);
      if (sellerShops && sellerShops.length > 0) {
        sellerShop = sellerShops[0]; // Use first shop
        if (sellerShop.lat_log) {
          const [shopLat, shopLng] = sellerShop.lat_log.split(',').map(Number);
          if (!isNaN(shopLat) && !isNaN(shopLng)) {
            sellerLat = shopLat;
            sellerLng = shopLng;
          }
        }
      }

      // Search radius for finding nearby users
      const searchRadius = preferred_distance && preferred_distance > 0 
        ? parseFloat(preferred_distance) 
        : 50;
      const validatedRadius = Math.max(0, Math.min(3000, searchRadius));

      console.log(`📏 Using search radius: ${validatedRadius}km`);

      // Find all nearby 'S' and 'R' type users (both B2B sellers and B2C buyers can see bulk sell requests)
      console.log(`🔍 Finding all nearby 'S' and 'R' type users within ${validatedRadius}km...`);
      const nearbySUsers = await findNearbyUsersByType(sellerLat, sellerLng, validatedRadius, ['S', 'R'], null);

      // Filter out seller's own shops
      const sellerShopIds = new Set();
      const sellerUserIds = new Set();
      sellerShops.forEach(s => {
        if (s.id) {
          sellerShopIds.add(String(s.id));
          sellerShopIds.add(Number(s.id));
        }
      });
      sellerUserIds.add(String(seller_id));
      sellerUserIds.add(Number(seller_id));

      const shopsToNotify = nearbySUsers.filter(s => {
        const userIdStr = String(s.user_id || '');
        const userIdNum = Number(s.user_id);
        if (sellerUserIds.has(userIdStr) || sellerUserIds.has(userIdNum)) {
          return false;
        }
        const shopIdStr = String(s.shop_id || '');
        const shopIdNum = Number(s.shop_id);
        if (sellerShopIds.has(shopIdStr) || sellerShopIds.has(shopIdNum)) {
          return false;
        }
        return true;
      });

      // Remove duplicates
      const uniqueShops = [];
      const seenShopIds = new Set();
      for (const shop of shopsToNotify) {
        if (!seenShopIds.has(shop.shop_id)) {
          seenShopIds.add(shop.shop_id);
          uniqueShops.push(shop);
        }
      }

      console.log(`📤 Will notify ${uniqueShops.length} 'S' and 'R' type users about this bulk sell request`);

      // Create the bulk sell request
      const sellerName = seller.name || seller.company_name || `User_${seller_id}`;
      const resolvedState = extractStateFromLocation(location);
      const resolvedStateKey = normalizeStateKey(resolvedState);
      const requestData = {
        id: request_id !== undefined && request_id !== null && request_id !== ''
          ? Number.isFinite(Number(request_id))
            ? Number(request_id)
            : String(request_id)
          : undefined,
        seller_id: seller_id,
        seller_name: sellerName,
        latitude: sellerLat,
        longitude: sellerLng,
        scrap_type: scrap_type || null,
        subcategories: parsedSubcategories ? JSON.stringify(parsedSubcategories) : null,
        subcategory_id: subcategory_id || null,
        quantity: parseFloat(quantity),
        asking_price: asking_price ? parseFloat(asking_price) : null,
        preferred_distance: validatedRadius,
        when_available: when_available || null,
        location: location || null,
        state: resolvedState || null,
        state_key: resolvedStateKey || null,
        additional_notes: additional_notes || null,
        documents: mergedDocumentUrls.length > 0 ? JSON.stringify(mergedDocumentUrls) : null,
        // Payment fields
        payment_status: payment_status || 'pending',
        payment_amount: payment_amount ? parseFloat(payment_amount) : null,
        payment_moj_id: payment_moj_id || null,
        payment_req_id: payment_req_id || null,
        invoice_id: invoice_id || null,
        order_value: order_value ? parseFloat(order_value) : (asking_price && quantity ? parseFloat(asking_price) * parseFloat(quantity) : null),
        post_star: post_star ? parseInt(post_star, 10) : 0,
        status: 'pending',
        review_status: 'pending',
        status_created_at: `pending#${new Date().toISOString()}`
      };

      const bulkSellRequest = await BulkSellRequest.create(requestData);
      const shouldNotifyAfterCreate = bulkSellRequest?.status === 'active';

      // Get FCM tokens for all users to notify
      const userShopMap = new Map();
      for (const shop of uniqueShops) {
        if (!userShopMap.has(shop.user_id)) {
          userShopMap.set(shop.user_id, []);
        }
        userShopMap.get(shop.user_id).push(shop);
      }

      const fcmTokens = [];
      for (const [userId, shops] of userShopMap.entries()) {
        try {
          const user = await User.findById(userId);
          if (user && user.fcm_token) {
            fcmTokens.push(user.fcm_token);
          }
        } catch (err) {
          console.error(`❌ Error fetching user ${userId}:`, err.message);
        }
      }

      console.log(`✅ Found ${fcmTokens.length} users with FCM tokens`);

      // Send notifications to nearby 'S' users
      if (shouldNotifyAfterCreate && fcmTokens.length > 0) {
        try {
          const quantityText = `${(quantity / 1000).toFixed(2)} ton${quantity !== 1000 ? 's' : ''}`;
          const notificationTitle = 'New Bulk Sell Request Available';
          const notificationBody = `${sellerName} is selling ${quantityText} of scrap. Check it out!`;
          
          await sendMulticastNotification(fcmTokens, notificationTitle, notificationBody, {
            type: 'bulk_sell_request',
            request_id: String(bulkSellRequest.id),
            seller_id: String(seller_id),
            seller_name: sellerName
          });

          console.log(`✅ Sent notifications to ${fcmTokens.length} users`);
        } catch (notifError) {
          console.error('❌ Error sending notifications:', notifError);
          // Don't fail the request if notifications fail
        }
      }

      return res.json({
        status: 'success',
        msg: shouldNotifyAfterCreate
          ? 'Bulk sell request created successfully'
          : 'Bulk sell post submitted for admin approval',
        data: {
          request_id: bulkSellRequest.id,
          notified_users: {
            total: shouldNotifyAfterCreate ? uniqueShops.length : 0,
            notified: shouldNotifyAfterCreate ? fcmTokens.length : 0
          }
        }
      });
    } catch (error) {
      console.error('❌ V2BulkSellController.createBulkSellRequest error:', error);
      return res.status(500).json({
        status: 'error',
        msg: 'Internal server error',
        data: null
      });
    }
  }

  /**
   * GET /api/v2/bulk-sell/requests
   * Get bulk sell requests available for the user
   * Query params: user_id, user_type, latitude, longitude
   * Both 'S' and 'R' type users can see these requests
   */
  static async getBulkSellRequests(req, res) {
    try {
      const {
        user_id,
        user_type,
        latitude,
        longitude,
        page,
        limit,
        state,
        sort_by,
        sort_order,
        min_star,
        max_star,
        min_price,
        max_price
      } = req.query;

      if (!user_id || !user_type) {
        return res.status(400).json({
          status: 'error',
          msg: 'Missing required query params: user_id, user_type',
          data: null
        });
      }

      // Both 'S' and 'R' type users can see bulk sell requests
      if (user_type !== 'S' && user_type !== 'R') {
        return res.json({
          status: 'success',
          msg: 'Bulk sell requests retrieved successfully',
          data: [] // Return empty array for non-S and non-R users
        });
      }

      const userIdNum = typeof user_id === 'string' ? parseInt(user_id) : (typeof user_id === 'number' ? user_id : parseInt(String(user_id)));
      const userLat = latitude ? parseFloat(latitude) : null;
      const userLng = longitude ? parseFloat(longitude) : null;
      const pageNum = Math.max(1, parseInt(String(page || '1'), 10) || 1);
      const limitNum = Math.max(1, Math.min(100, parseInt(String(limit || '20'), 10) || 20));
      const requestedStateKey = normalizeStateKey(state);
      const sortBy = String(sort_by || 'created_at').trim().toLowerCase();
      const sortOrder = String(sort_order || 'desc').trim().toLowerCase() === 'asc' ? 'asc' : 'desc';
      const minStar = toNumberOrNull(min_star);
      const maxStar = toNumberOrNull(max_star);
      const minPrice = toNumberOrNull(min_price);
      const maxPrice = toNumberOrNull(max_price);

      const requests = await BulkSellRequest.findForUser(userIdNum, userLat, userLng, user_type);

      // Format requests
      const formattedRequests = requests.map(request => {
        let parsedSubcategories = request.subcategories;
        if (typeof parsedSubcategories === 'string') {
          try {
            parsedSubcategories = JSON.parse(parsedSubcategories);
          } catch (e) {
            parsedSubcategories = null;
          }
        }

        let parsedDocuments = request.documents;
        if (typeof parsedDocuments === 'string') {
          try {
            parsedDocuments = JSON.parse(parsedDocuments);
          } catch (e) {
            parsedDocuments = null;
          }
        }

        return {
          id: typeof request.id === 'string' ? parseInt(request.id) : (typeof request.id === 'number' ? request.id : parseInt(String(request.id))),
          seller_id: typeof request.seller_id === 'string' ? parseInt(request.seller_id) : (typeof request.seller_id === 'number' ? request.seller_id : parseInt(String(request.seller_id))),
          seller_name: request.seller_name || null,
          latitude: typeof request.latitude === 'string' ? parseFloat(request.latitude) : (typeof request.latitude === 'number' ? request.latitude : parseFloat(String(request.latitude))),
          longitude: typeof request.longitude === 'string' ? parseFloat(request.longitude) : (typeof request.longitude === 'number' ? request.longitude : parseFloat(String(request.longitude))),
          scrap_type: request.scrap_type || null,
          subcategories: parsedSubcategories,
          subcategory_id: request.subcategory_id ? (typeof request.subcategory_id === 'string' ? parseInt(request.subcategory_id) : (typeof request.subcategory_id === 'number' ? request.subcategory_id : parseInt(String(request.subcategory_id)))) : null,
          quantity: typeof request.quantity === 'string' ? parseFloat(request.quantity) : (typeof request.quantity === 'number' ? request.quantity : parseFloat(String(request.quantity))),
          asking_price: request.asking_price ? (typeof request.asking_price === 'string' ? parseFloat(request.asking_price) : (typeof request.asking_price === 'number' ? request.asking_price : parseFloat(String(request.asking_price)))) : null,
          preferred_distance: typeof request.preferred_distance === 'string' ? parseFloat(request.preferred_distance) : (typeof request.preferred_distance === 'number' ? request.preferred_distance : parseFloat(String(request.preferred_distance || 50))),
          when_available: request.when_available || null,
          location: request.location || null,
          state: request.state || extractStateFromLocation(request.location) || null,
          state_key: request.state_key || normalizeStateKey(request.state || extractStateFromLocation(request.location)) || null,
          additional_notes: request.additional_notes || null,
          documents: parsedDocuments,
          post_star: request.post_star ? (typeof request.post_star === 'string' ? parseInt(request.post_star) : request.post_star) : 0,
          status: request.status || 'active',
          accepted_buyers: request.accepted_buyers || [],
          rejected_buyers: request.rejected_buyers || [],
          total_committed_quantity: request.total_committed_quantity || 0,
          created_at: request.created_at || new Date().toISOString(),
          updated_at: request.updated_at || new Date().toISOString(),
          distance: request.distance || null,
          distance_km: request.distance ? parseFloat(request.distance.toFixed(2)) : null
        };
      });

      const filteredRequests = formattedRequests.filter((request) => {
        const requestStateKey = normalizeStateKey(request.state || extractStateFromLocation(request.location));
        if (requestedStateKey && requestStateKey !== requestedStateKey) return false;

        const stars = toNumberOrNull(request.post_star) || 0;
        if (minStar !== null && stars < minStar) return false;
        if (maxStar !== null && stars > maxStar) return false;

        const price = toNumberOrNull(request.asking_price);
        if (minPrice !== null && (price === null || price < minPrice)) return false;
        if (maxPrice !== null && (price === null || price > maxPrice)) return false;

        return true;
      });

      filteredRequests.sort((a, b) => {
        const getCreatedTime = (item) => new Date(item?.created_at || 0).getTime();
        const getPrice = (item) => toNumberOrNull(item?.asking_price) || 0;
        const getStar = (item) => toNumberOrNull(item?.post_star) || 0;
        const getDistance = (item) => toNumberOrNull(item?.distance) || Number.MAX_SAFE_INTEGER;

        let comparison = 0;
        if (sortBy === 'price') {
          comparison = getPrice(a) - getPrice(b);
        } else if (sortBy === 'star' || sortBy === 'stars' || sortBy === 'post_star') {
          comparison = getStar(a) - getStar(b);
        } else if (sortBy === 'distance') {
          comparison = getDistance(a) - getDistance(b);
        } else {
          comparison = getCreatedTime(a) - getCreatedTime(b);
        }

        return sortOrder === 'asc' ? comparison : -comparison;
      });

      const totalItems = filteredRequests.length;
      const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / limitNum);
      const startIndex = (pageNum - 1) * limitNum;
      const pagedData = filteredRequests.slice(startIndex, startIndex + limitNum);

      return res.json({
        status: 'success',
        msg: 'Bulk sell requests retrieved successfully',
        data: pagedData,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total_items: totalItems,
          total_pages: totalPages,
          has_next: pageNum < totalPages,
          has_prev: pageNum > 1
        }
      });
    } catch (error) {
      console.error('❌ V2BulkSellController.getBulkSellRequests error:', error);
      return res.status(500).json({
        status: 'error',
        msg: 'Internal server error',
        data: null
      });
    }
  }

  /**
   * GET /api/v2/bulk-sell/requests/accepted
   * Get bulk sell requests accepted by the user
   * Query params: user_id, user_type, latitude, longitude
   */
  static async getAcceptedBulkSellRequests(req, res) {
    try {
      const { user_id, user_type, latitude, longitude } = req.query;

      if (!user_id || !user_type) {
        return res.status(400).json({
          status: 'error',
          msg: 'Missing required query params: user_id, user_type',
          data: null
        });
      }

      const userIdNum = typeof user_id === 'string' ? parseInt(user_id) : (typeof user_id === 'number' ? user_id : parseInt(String(user_id)));
      const userLat = latitude ? parseFloat(latitude) : null;
      const userLng = longitude ? parseFloat(longitude) : null;

      const requests = await BulkSellRequest.findAcceptedByUser(userIdNum);

      // Format requests
      const formattedRequests = requests.map(request => {
        let parsedSubcategories = request.subcategories;
        if (typeof parsedSubcategories === 'string') {
          try {
            parsedSubcategories = JSON.parse(parsedSubcategories);
          } catch (e) {
            parsedSubcategories = null;
          }
        }

        return {
          id: typeof request.id === 'string' ? parseInt(request.id) : (typeof request.id === 'number' ? request.id : parseInt(String(request.id))),
          seller_id: typeof request.seller_id === 'string' ? parseInt(request.seller_id) : (typeof request.seller_id === 'number' ? request.seller_id : parseInt(String(request.seller_id))),
          seller_name: request.seller_name || null,
          latitude: typeof request.latitude === 'string' ? parseFloat(request.latitude) : (typeof request.latitude === 'number' ? request.latitude : parseFloat(String(request.latitude))),
          longitude: typeof request.longitude === 'string' ? parseFloat(request.longitude) : (typeof request.longitude === 'number' ? request.longitude : parseFloat(String(request.longitude))),
          scrap_type: request.scrap_type || null,
          subcategories: parsedSubcategories,
          quantity: typeof request.quantity === 'string' ? parseFloat(request.quantity) : (typeof request.quantity === 'number' ? request.quantity : parseFloat(String(request.quantity))),
          asking_price: request.asking_price ? (typeof request.asking_price === 'string' ? parseFloat(request.asking_price) : (typeof request.asking_price === 'number' ? request.asking_price : parseFloat(String(request.asking_price)))) : null,
          status: request.status || 'active',
          accepted_buyers: request.accepted_buyers || [],
          total_committed_quantity: request.total_committed_quantity || 0,
          created_at: request.created_at || new Date().toISOString(),
          updated_at: request.updated_at || new Date().toISOString()
        };
      });

      return res.json({
        status: 'success',
        msg: 'Accepted bulk sell requests retrieved successfully',
        data: formattedRequests
      });
    } catch (error) {
      console.error('❌ V2BulkSellController.getAcceptedBulkSellRequests error:', error);
      return res.status(500).json({
        status: 'error',
        msg: 'Internal server error',
        data: null
      });
    }
  }

  /**
   * GET /api/v2/bulk-sell/requests/by-seller/:sellerId
   * Get all bulk sell requests created by a specific seller
   */
  static async getBulkSellRequestsBySeller(req, res) {
    try {
      const { sellerId } = req.params;

      if (!sellerId) {
        return res.status(400).json({
          status: 'error',
          msg: 'Missing required param: sellerId',
          data: null
        });
      }

      const sellerIdNum = typeof sellerId === 'string' ? parseInt(sellerId) : (typeof sellerId === 'number' ? sellerId : parseInt(String(sellerId)));
      if (isNaN(sellerIdNum)) {
        return res.status(400).json({
          status: 'error',
          msg: 'Invalid seller ID',
          data: null
        });
      }

      const requests = await BulkSellRequest.findBySellerId(sellerIdNum);

      // Format requests
      const formattedRequests = requests.map(request => {
        let parsedSubcategories = request.subcategories;
        if (typeof parsedSubcategories === 'string') {
          try {
            parsedSubcategories = JSON.parse(parsedSubcategories);
          } catch (e) {
            parsedSubcategories = null;
          }
        }

        let parsedDocuments = request.documents;
        if (typeof parsedDocuments === 'string') {
          try {
            parsedDocuments = JSON.parse(parsedDocuments);
          } catch (e) {
            parsedDocuments = null;
          }
        }

        return {
          id: typeof request.id === 'string' ? parseInt(request.id) : (typeof request.id === 'number' ? request.id : parseInt(String(request.id))),
          seller_id: typeof request.seller_id === 'string' ? parseInt(request.seller_id) : (typeof request.seller_id === 'number' ? request.seller_id : parseInt(String(request.seller_id))),
          seller_name: request.seller_name || null,
          latitude: typeof request.latitude === 'string' ? parseFloat(request.latitude) : (typeof request.latitude === 'number' ? request.latitude : parseFloat(String(request.latitude))),
          longitude: typeof request.longitude === 'string' ? parseFloat(request.longitude) : (typeof request.longitude === 'number' ? request.longitude : parseFloat(String(request.longitude))),
          scrap_type: request.scrap_type || null,
          subcategories: parsedSubcategories,
          subcategory_id: request.subcategory_id ? (typeof request.subcategory_id === 'string' ? parseInt(request.subcategory_id) : (typeof request.subcategory_id === 'number' ? request.subcategory_id : parseInt(String(request.subcategory_id)))) : null,
          quantity: typeof request.quantity === 'string' ? parseFloat(request.quantity) : (typeof request.quantity === 'number' ? request.quantity : parseFloat(String(request.quantity))),
          asking_price: request.asking_price ? (typeof request.asking_price === 'string' ? parseFloat(request.asking_price) : (typeof request.asking_price === 'number' ? request.asking_price : parseFloat(String(request.asking_price)))) : null,
          preferred_distance: typeof request.preferred_distance === 'string' ? parseFloat(request.preferred_distance) : (typeof request.preferred_distance === 'number' ? request.preferred_distance : parseFloat(String(request.preferred_distance || 50))),
          when_available: request.when_available || null,
          location: request.location || null,
          additional_notes: request.additional_notes || null,
          documents: parsedDocuments,
          post_star: request.post_star ? (typeof request.post_star === 'string' ? parseInt(request.post_star) : request.post_star) : 0,
          status: request.status || 'active',
          accepted_buyers: request.accepted_buyers || [],
          rejected_buyers: request.rejected_buyers || [],
          total_committed_quantity: request.total_committed_quantity || 0,
          created_at: request.created_at || new Date().toISOString(),
          updated_at: request.updated_at || new Date().toISOString()
        };
      });

      return res.json({
        status: 'success',
        msg: 'Bulk sell requests retrieved successfully',
        data: formattedRequests
      });
    } catch (error) {
      console.error('❌ V2BulkSellController.getBulkSellRequestsBySeller error:', error);
      return res.status(500).json({
        status: 'error',
        msg: 'Internal server error',
        data: null
      });
    }
  }

  /**
   * POST /api/v2/bulk-sell/requests/:requestId/accept
   * Accept/buy from a bulk sell request
   * Body: { buyer_id: number, user_type: string, committed_quantity: number, images?: File[] }
   * Only 'S' type users can accept
   */
  static async acceptBulkSellRequest(req, res) {
    try {
      const { requestId } = req.params;
      const { buyer_id, user_type, committed_quantity, bidding_price } = req.body;

      console.log('📥 [acceptBulkSellRequest] Request received:', {
        requestId,
        buyer_id,
        user_type,
        committed_quantity
      });

      if (!buyer_id || !user_type || !committed_quantity) {
        return res.status(400).json({
          status: 'error',
          msg: 'Missing required fields: buyer_id, user_type, committed_quantity',
          data: null
        });
      }

      // Only 'S' type users can accept bulk sell requests
      if (user_type !== 'S') {
        return res.status(403).json({
          status: 'error',
          msg: 'Only S type users can accept bulk sell requests',
          data: null
        });
      }

      const requestIdNum = typeof requestId === 'string' ? parseInt(requestId) : (typeof requestId === 'number' ? requestId : parseInt(String(requestId)));
      if (isNaN(requestIdNum)) {
        return res.status(400).json({
          status: 'error',
          msg: 'Invalid request ID',
          data: null
        });
      }

      // Get the bulk sell request
      const client = getDynamoDBClient();
      const getCommand = new GetCommand({
        TableName: 'bulk_sell_requests',
        Key: { id: requestIdNum }
      });

      let response;
      try {
        response = await client.send(getCommand);
      } catch (getError) {
        if (getError.name === 'ResourceNotFoundException') {
          return res.status(404).json({
            status: 'error',
            msg: 'Bulk sell request not found',
            data: null
          });
        }
        throw getError;
      }

      if (!response.Item) {
        return res.status(404).json({
          status: 'error',
          msg: 'Bulk sell request not found',
          data: null
        });
      }

      const request = response.Item;

      // Check if request is active
      if (request.status !== 'active') {
        return res.status(400).json({
          status: 'error',
          msg: 'This bulk sell request is no longer active',
          data: null
        });
      }

      // Get buyer info
      const buyer = await User.findById(parseInt(buyer_id));
      if (!buyer) {
        return res.status(404).json({
          status: 'error',
          msg: 'Buyer not found',
          data: null
        });
      }

      // Get buyer's shop
      const buyerShops = await Shop.findAllByUserId(parseInt(buyer_id));
      if (!buyerShops || buyerShops.length === 0) {
        return res.status(400).json({
          status: 'error',
          msg: 'Buyer shop not found',
          data: null
        });
      }
      const buyerShop = buyerShops[0]; // Use first shop

      // Parse accepted_buyers
      let acceptedBuyers = [];
      if (request.accepted_buyers) {
        try {
          acceptedBuyers = typeof request.accepted_buyers === 'string'
            ? JSON.parse(request.accepted_buyers)
            : request.accepted_buyers;
        } catch (e) {
          console.warn('⚠️  Could not parse accepted_buyers:', e.message);
        }
      }

      // Check if buyer already accepted
      const buyerIdNum = typeof buyer_id === 'string' ? parseInt(buyer_id) : (typeof buyer_id === 'number' ? buyer_id : parseInt(String(buyer_id)));
      const alreadyAccepted = acceptedBuyers.some(b => {
        const bid = typeof b.user_id === 'string' ? parseInt(b.user_id) : (typeof b.user_id === 'number' ? b.user_id : parseInt(String(b.user_id)));
        return bid === buyerIdNum;
      });

      if (alreadyAccepted) {
        return res.status(400).json({
          status: 'error',
          msg: 'You have already accepted this bulk sell request',
          data: null
        });
      }

      // Handle image uploads if present
      const imageUrls = [];
      if (req.files && Object.keys(req.files).length > 0) {
        const imageFiles = Object.values(req.files).flat().slice(0, 6); // Max 6 images
        for (const file of imageFiles) {
          if (file && file.buffer) {
            try {
              const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
              const filename = `bulk-sell-accept-${requestIdNum}-${buyerIdNum}-${Date.now()}-${Math.random().toString(36).substring(7)}${ext}`;
              const s3Result = await uploadBufferToS3(file.buffer, filename, 'bulk-sell-images');
              imageUrls.push(s3Result.s3Url);
            } catch (uploadError) {
              console.error('❌ Error uploading image:', uploadError);
            }
          }
        }
      }

      // Add buyer to accepted_buyers
      const committedQty = typeof committed_quantity === 'string' ? parseFloat(committed_quantity) : (typeof committed_quantity === 'number' ? committed_quantity : parseFloat(String(committed_quantity)));
      const bidPrice = bidding_price ? (typeof bidding_price === 'string' ? parseFloat(bidding_price) : (typeof bidding_price === 'number' ? bidding_price : parseFloat(String(bidding_price)))) : null;

      acceptedBuyers.push({
        user_id: buyerIdNum,
        user_type: user_type,
        shop_id: buyerShop.id ? (typeof buyerShop.id === 'string' ? parseInt(buyerShop.id) : (typeof buyerShop.id === 'number' ? buyerShop.id : parseInt(String(buyerShop.id)))) : null,
        committed_quantity: committedQty,
        bidding_price: bidPrice,
        accepted_at: new Date().toISOString(),
        status: 'accepted',
        images: imageUrls.length > 0 ? imageUrls : null
      });

      // Calculate total committed quantity
      let totalCommittedQuantity = 0;
      acceptedBuyers.forEach(b => {
        const qty = b.committed_quantity || 0;
        totalCommittedQuantity += typeof qty === 'string' ? parseFloat(qty) : (typeof qty === 'number' ? qty : parseFloat(String(qty)) || 0);
      });

      // Update request status if fully committed
      let newStatus = request.status;
      const requestedQuantity = typeof request.quantity === 'string' ? parseFloat(request.quantity) : (typeof request.quantity === 'number' ? request.quantity : parseFloat(String(request.quantity)));
      if (totalCommittedQuantity >= requestedQuantity) {
        newStatus = 'sold';
      }

      // Update the request
      const updateCommand = new UpdateCommand({
        TableName: 'bulk_sell_requests',
        Key: { id: requestIdNum },
        UpdateExpression: 'SET accepted_buyers = :acceptedBuyers, total_committed_quantity = :totalCommittedQuantity, #status = :status, updated_at = :updatedAt',
        ExpressionAttributeNames: {
          '#status': 'status'
        },
        ExpressionAttributeValues: {
          ':acceptedBuyers': JSON.stringify(acceptedBuyers),
          ':totalCommittedQuantity': totalCommittedQuantity,
          ':status': newStatus,
          ':updatedAt': new Date().toISOString()
        }
      });

      await client.send(updateCommand);

      // Send notification to seller
      try {
        const seller = await User.findById(request.seller_id);
        if (seller && seller.fcm_token) {
          await sendVendorNotification(
            seller.fcm_token,
            'Bulk Sell Request Accepted',
            `${buyer.name || 'A buyer'} has accepted your bulk sell request. Committed: ${committedQty} kg`,
            {
              type: 'bulk_sell_accepted',
              request_id: String(requestIdNum),
              buyer_id: buyerIdNum,
              buyer_name: buyer.name || null
            }
          );
        }
      } catch (notifErr) {
        console.error('❌ Error sending notification to seller:', notifErr);
      }

      console.log(`✅ Buyer ${buyerIdNum} accepted bulk sell request ${requestIdNum}`);

      return res.json({
        status: 'success',
        msg: 'Bulk sell request accepted successfully',
        data: {
          request_id: requestIdNum,
          buyer_id: buyerIdNum,
          committed_quantity: committedQty,
          total_committed_quantity: totalCommittedQuantity,
          request_status: newStatus
        }
      });
    } catch (error) {
      console.error('❌ V2BulkSellController.acceptBulkSellRequest error:', error);
      return res.status(500).json({
        status: 'error',
        msg: 'Internal server error',
        data: null
      });
    }
  }

  /**
   * POST /api/v2/bulk-sell/requests/:requestId/reject
   * Reject a bulk sell request
   * Body: { buyer_id: number, user_type: string, rejection_reason?: string }
   */
  static async rejectBulkSellRequest(req, res) {
    try {
      const { requestId } = req.params;
      const { buyer_id, user_type, rejection_reason } = req.body;

      if (!buyer_id || !user_type) {
        return res.status(400).json({
          status: 'error',
          msg: 'Missing required fields: buyer_id, user_type',
          data: null
        });
      }

      const requestIdNum = typeof requestId === 'string' ? parseInt(requestId) : (typeof requestId === 'number' ? requestId : parseInt(String(requestId)));
      if (isNaN(requestIdNum)) {
        return res.status(400).json({
          status: 'error',
          msg: 'Invalid request ID',
          data: null
        });
      }

      // Get the request
      const client = getDynamoDBClient();
      const getCommand = new GetCommand({
        TableName: 'bulk_sell_requests',
        Key: { id: requestIdNum }
      });

      const response = await client.send(getCommand);
      if (!response.Item) {
        return res.status(404).json({
          status: 'error',
          msg: 'Bulk sell request not found',
          data: null
        });
      }

      // Parse rejected_buyers
      let rejectedBuyers = [];
      if (response.Item.rejected_buyers) {
        try {
          rejectedBuyers = typeof response.Item.rejected_buyers === 'string'
            ? JSON.parse(response.Item.rejected_buyers)
            : response.Item.rejected_buyers;
        } catch (e) {
          console.warn('⚠️  Could not parse rejected_buyers:', e.message);
        }
      }

      // Add buyer to rejected_buyers if not already there
      const buyerIdNum = typeof buyer_id === 'string' ? parseInt(buyer_id) : (typeof buyer_id === 'number' ? buyer_id : parseInt(String(buyer_id)));
      const alreadyRejected = rejectedBuyers.some(b => {
        const bid = typeof b.user_id === 'string' ? parseInt(b.user_id) : (typeof b.user_id === 'number' ? b.user_id : parseInt(String(b.user_id)));
        return bid === buyerIdNum;
      });

      if (!alreadyRejected) {
        rejectedBuyers.push({
          user_id: buyerIdNum,
          user_type: user_type,
          rejected_at: new Date().toISOString(),
          rejection_reason: rejection_reason || null
        });

        const updateCommand = new UpdateCommand({
          TableName: 'bulk_sell_requests',
          Key: { id: requestIdNum },
          UpdateExpression: 'SET rejected_buyers = :rejectedBuyers, updated_at = :updatedAt',
          ExpressionAttributeValues: {
            ':rejectedBuyers': JSON.stringify(rejectedBuyers),
            ':updatedAt': new Date().toISOString()
          }
        });

        await client.send(updateCommand);
      }

      return res.json({
        status: 'success',
        msg: 'Bulk sell request rejected',
        data: {
          request_id: requestIdNum,
          buyer_id: buyerIdNum
        }
      });
    } catch (error) {
      console.error('❌ V2BulkSellController.rejectBulkSellRequest error:', error);
      return res.status(500).json({
        status: 'error',
        msg: 'Internal server error',
        data: null
      });
    }
  }
}

module.exports = V2BulkSellController;
