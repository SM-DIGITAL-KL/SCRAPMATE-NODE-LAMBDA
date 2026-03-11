/**
 * V2 Order Controller
 * Handles pickup request orders from user app (U type) 
 * and allows R, S, SR, D users to accept them
 */

const Order = require('../models/Order');
const User = require('../models/User');
const Shop = require('../models/Shop');
const Customer = require('../models/Customer');
const Address = require('../models/Address');
const RedisCache = require('../utils/redisCache');
const { sendVendorNotification } = require('../utils/fcmNotification');

/**
 * Place a pickup request order (User type 'U' from user app)
 */
class V2OrderController {
  /**
   * POST /api/v2/orders/pickup-request
   * Place a pickup request order from user app (user type 'U')
   * Body: {
   *   customer_id: number,
   *   orderdetails: JSON string or object,
   *   customerdetails: string (address),
   *   latitude: number,
   *   longitude: number,
   *   estim_weight: number,
   *   estim_price: number,
   *   preferred_pickup_time?: string,
   *   images: [File]
   * }
   */
  static async placePickupRequest(req, res) {
    try {
      console.log('📥 [V2OrderController.placePickupRequest] Request received');
      console.log('   Body keys:', Object.keys(req.body || {}));
      console.log('   Body data:', {
        customer_id: req.body?.customer_id,
        has_orderdetails: !!req.body?.orderdetails,
        has_customerdetails: !!req.body?.customerdetails,
        latitude: req.body?.latitude,
        longitude: req.body?.longitude,
        estim_weight: req.body?.estim_weight,
        estim_price: req.body?.estim_price,
      });
      console.log('   Files:', req.files ? Object.keys(req.files) : 'none');

      const {
        customer_id,
        orderdetails,
        customerdetails,
        latitude,
        longitude,
        estim_weight,
        estim_price,
        preferred_pickup_time
      } = req.body;

      // Handle multiple image uploads to S3 with compression
      const { uploadFileToS3 } = require('../utils/fileUpload');
      const { compressImage } = require('../utils/imageCompression');
      let image1 = req.body.image1 || '';
      let image2 = req.body.image2 || '';
      let image3 = req.body.image3 || '';
      let image4 = req.body.image4 || '';
      let image5 = req.body.image5 || '';
      let image6 = req.body.image6 || '';

      // Helper function to compress and upload image
      const compressAndUploadImage = async (file, imageNumber) => {
        try {
          if (!file || !file.buffer) {
            console.error(`⚠️  Image${imageNumber}: No file buffer provided`);
            return '';
          }

          console.log(`📤 Compressing and uploading image${imageNumber}...`);
          console.log(`   Original size: ${(file.buffer.length / 1024).toFixed(2)}KB`);

          // Compress image to 50KB
          const compressedBuffer = await compressImage(file.buffer);
          console.log(`   Compressed size: ${(compressedBuffer.length / 1024).toFixed(2)}KB`);

          // Create a new file object with compressed buffer
          const compressedFile = {
            ...file,
            buffer: compressedBuffer,
            size: compressedBuffer.length
          };

          // Upload compressed image to S3
          const result = await uploadFileToS3(compressedFile, 'order-images');
          console.log(`✅ Image${imageNumber} uploaded successfully`);
          return result.s3Url || result.filename;
        } catch (err) {
          console.error(`❌ Error uploading image${imageNumber}:`, err);
          return '';
        }
      };

      // Upload images to S3 if files are provided
      if (req.files?.image1?.[0]) {
        image1 = await compressAndUploadImage(req.files.image1[0], 1);
      }
      if (req.files?.image2?.[0]) {
        image2 = await compressAndUploadImage(req.files.image2[0], 2);
      }
      if (req.files?.image3?.[0]) {
        image3 = await compressAndUploadImage(req.files.image3[0], 3);
      }
      if (req.files?.image4?.[0]) {
        image4 = await compressAndUploadImage(req.files.image4[0], 4);
      }
      if (req.files?.image5?.[0]) {
        image5 = await compressAndUploadImage(req.files.image5[0], 5);
      }
      if (req.files?.image6?.[0]) {
        image6 = await compressAndUploadImage(req.files.image6[0], 6);
      }

      // Validation
      if (!customer_id || !orderdetails || !customerdetails) {
        return res.status(400).json({
          status: 'error',
          msg: 'Missing required fields: customer_id, orderdetails, customerdetails',
          data: null
        });
      }

      // Verify user type is 'U' (user app customer) or 'C' (customer app)
      const user = await User.findById(customer_id);
      if (!user) {
        console.log(`❌ [V2OrderController.placePickupRequest] User not found: ${customer_id}`);
        return res.status(404).json({
          status: 'error',
          msg: 'User not found',
          data: null
        });
      }

      console.log(`✅ [V2OrderController.placePickupRequest] User found: ID=${user.id}, Type=${user.user_type}, App=${user.app_type}`);

      // Allow all customer app users (app_type='customer_app') to place pickup requests
      // Also allow 'U' type users (legacy user app customers)
      const isCustomerAppUser = user.app_type === 'customer_app';
      const isLegacyUserApp = user.user_type === 'U';

      if (!isCustomerAppUser && !isLegacyUserApp) {
        console.log(`❌ [V2OrderController.placePickupRequest] Invalid user: Type=${user.user_type}, App=${user.app_type} (expected customer_app or user_type='U')`);
        return res.status(403).json({
          status: 'error',
          msg: `Only customer app users can place pickup requests. Your app type is: ${user.app_type || 'unknown'}, user type: ${user.user_type}`,
          data: null
        });
      }

      // Determine customer zone and enforce vendor notifications within that zone only.
      // For zone admin logins (zone1..zone48@scrapmate.co.in), enforce that exact zone scope.
      let customerZone = '';
      let zoneVendorSet = null;
      try {
        const requestEmail = String(
          req.user?.email ||
          req.session?.userEmail ||
          req.headers['x-user-email'] ||
          ''
        ).trim().toLowerCase();
        const zoneEmailMatch = requestEmail.match(/^zone(\d{1,2})@scrapmate\.co\.in$/i);
        const enforcedZone = zoneEmailMatch ? `zone${parseInt(zoneEmailMatch[1], 10)}` : '';

        if (enforcedZone) {
          customerZone = Address.normalizeZone(enforcedZone);
          const zoneVendorIds = await Address.findCustomerIdsByZone(enforcedZone);
          zoneVendorSet = new Set(
            (zoneVendorIds || []).map((id) => (
              typeof id === 'string' && !isNaN(id) ? parseInt(id, 10) : id
            ))
          );

          const selectedCustomerId = typeof customer_id === 'string' && !isNaN(customer_id)
            ? parseInt(customer_id, 10)
            : customer_id;
          if (selectedCustomerId === null || selectedCustomerId === undefined || !zoneVendorSet.has(selectedCustomerId)) {
            return res.status(403).json({
              status: 'error',
              msg: `Selected customer is outside ${customerZone || enforcedZone.toUpperCase()} scope`,
              data: null
            });
          }

          console.log(`🧭 Zone admin request scope enforced: ${customerZone} (${zoneVendorSet.size} zone users)`);
        } else {
          const addresses = await Address.findByCustomerId(parseInt(customer_id));
          if (Array.isArray(addresses) && addresses.length > 0) {
            const latestAddress = [...addresses].sort((a, b) => {
              const aTs = new Date(a.updated_at || a.created_at || 0).getTime();
              const bTs = new Date(b.updated_at || b.created_at || 0).getTime();
              return bTs - aTs;
            })[0];
            customerZone = Address.normalizeZone(latestAddress?.zone || '');
          }

          if (customerZone) {
            const zoneVendorIds = await Address.findCustomerIdsByZone(customerZone);
            zoneVendorSet = new Set(
              (zoneVendorIds || []).map((id) => (
                typeof id === 'string' && !isNaN(id) ? parseInt(id, 10) : id
              ))
            );
            console.log(`🧭 Zone-scoped notifications enabled: ${customerZone} (${zoneVendorSet.size} zone users)`);
          } else {
            console.log('🧭 No customer zone found. Zone filter skipped for pickup notifications.');
          }
        }
      } catch (zoneError) {
        console.error('❌ Failed to resolve customer zone for pickup notification scoping:', zoneError.message);
      }

      // Get last order number and generate new one in standard format
      const lastOrderNumber = await Order.getLastOrderNumber();
      let orderNumber = 10000;
      if (lastOrderNumber && !isNaN(lastOrderNumber)) {
        const lastNum = typeof lastOrderNumber === 'string' ? parseInt(lastOrderNumber) : lastOrderNumber;
        // Ensure order number is in valid range (10000 to 999999999)
        if (lastNum >= 10000 && lastNum < 999999999) {
          orderNumber = lastNum + 1;
        } else {
          // If last order number is invalid, start from 10000
          console.log(`⚠️  Invalid last order number (${lastOrderNumber}), starting from 10000`);
          orderNumber = 10000;
        }
      }

      console.log(`📝 Generated order number: ${orderNumber} (last was: ${lastOrderNumber || 'none'})`);

      // Format lat/lng for storage
      const latLog = latitude && longitude ? `${latitude},${longitude}` : '';

      // Find all B2C vendors with progressive radius expansion (15km -> 30km -> 45km...) until at least one vendor is found
      let notifiedVendorIds = []; // Array to store notified vendor user IDs
      let notifiedShopIds = []; // Array to store notified shop IDs
      let orderStatus = 1; // Default: pending (available for pickup)

      if (latitude && longitude && !isNaN(parseFloat(latitude)) && !isNaN(parseFloat(longitude))) {
        try {
          const orderLat = parseFloat(latitude);
          const orderLng = parseFloat(longitude);
          const maxRadius = 150; // Maximum radius to search (150km) to prevent infinite expansion
          const radiusIncrement = 15; // Expand by 15km each iteration
          
          let allVendors = [];
          let currentRadius = 15; // Start with 15km
          let finalSearchRadius = 15;
          const vendorZoneEligibilityCache = new Map();

          const isVendorEligibleForCustomerZone = async (vendorUserId) => {
            const normalizedCustomerZone = Address.normalizeZone(customerZone);
            if (!normalizedCustomerZone || !zoneVendorSet) {
              return true;
            }

            const uid = typeof vendorUserId === 'string' && !isNaN(vendorUserId)
              ? parseInt(vendorUserId, 10)
              : vendorUserId;

            if (uid === null || uid === undefined || isNaN(uid)) {
              return false;
            }

            if (zoneVendorSet.has(uid)) {
              return true;
            }

            if (vendorZoneEligibilityCache.has(uid)) {
              return vendorZoneEligibilityCache.get(uid);
            }

            try {
              // Fallback: check vendor's own address zone. If vendor has no zone data,
              // keep them in list (nearby + unknown zone) instead of dropping silently.
              const vendorAddresses = await Address.findByCustomerId(uid);
              const vendorZones = [...new Set(
                (vendorAddresses || [])
                  .map(addr => Address.normalizeZone(addr?.zone || ''))
                  .filter(Boolean)
              )];

              const eligible = vendorZones.length === 0 || vendorZones.includes(normalizedCustomerZone);
              vendorZoneEligibilityCache.set(uid, eligible);
              return eligible;
            } catch (zoneLookupErr) {
              console.warn(`⚠️  Zone lookup failed for vendor ${uid}; keeping vendor as fallback: ${zoneLookupErr.message}`);
              vendorZoneEligibilityCache.set(uid, true);
              return true;
            }
          };
          
          console.log(`🔍 Finding B2C vendors with progressive radius expansion starting at ${currentRadius}km for pickup request at ${latitude}, ${longitude}`);

          // Pre-fetch all vendor users and shops once (outside loop for efficiency)
          const { getDynamoDBClient } = require('../config/dynamodb');
          const { ScanCommand } = require('@aws-sdk/lib-dynamodb');
          const client = getDynamoDBClient();
          
          // Find all vendor_app users with user_type R or SR (fetch once)
          let allVendorUsers = [];
          let lastKey = null;
          do {
            const userParams = {
              TableName: 'users',
              FilterExpression: 'app_type = :appType AND (user_type = :typeR OR user_type = :typeSR) AND (attribute_not_exists(del_status) OR del_status <> :deleted)',
              ExpressionAttributeValues: {
                ':appType': 'vendor_app',
                ':typeR': 'R',
                ':typeSR': 'SR',
                ':deleted': 2
              }
            };
            if (lastKey) {
              userParams.ExclusiveStartKey = lastKey;
            }
            const userCommand = new ScanCommand(userParams);
            const userResponse = await client.send(userCommand);
            if (userResponse.Items) {
              allVendorUsers.push(...userResponse.Items);
            }
            lastKey = userResponse.LastEvaluatedKey;
          } while (lastKey);

          // Fetch all shops in one scan and create a map by user_id (fetch once)
          const userIdsSet = new Set(allVendorUsers.map(u => parseInt(u.id)));
          const shopsMap = new Map(); // Map<user_id, shop>
          let shopLastKey = null;
          do {
            const shopScanParams = {
              TableName: 'shops',
              ProjectionExpression: 'id, user_id, lat_log, shop_type, del_status'
            };
            if (shopLastKey) {
              shopScanParams.ExclusiveStartKey = shopLastKey;
            }
            const shopScanCommand = new ScanCommand(shopScanParams);
            const shopResponse = await client.send(shopScanCommand);
            if (shopResponse.Items) {
              shopResponse.Items.forEach(shop => {
                const shopUserId = parseInt(shop.user_id);
                if (userIdsSet.has(shopUserId)) {
                  if (!shopsMap.has(shopUserId) || shop.del_status === 1) {
                    shopsMap.set(shopUserId, shop);
                  }
                }
              });
            }
            shopLastKey = shopResponse.LastEvaluatedKey;
          } while (shopLastKey);

          console.log(`   Pre-fetched ${allVendorUsers.length} vendor users and ${shopsMap.size} shops for radius filtering`);

          // Progressive radius expansion: ONLY expand if NO vendors found in current radius
          // If at least one vendor is found, STOP and use only those vendors (don't expand to 30km, 45km, etc.)
          while (currentRadius <= maxRadius) {
            console.log(`\n🔍 Searching within ${currentRadius}km radius...`);
            
            // Reset allVendors for this radius search
            allVendors = [];
            
            // Shop-based search within current radius
            const nearbyShops = await Shop.getShopsByLocation(
              orderLat,
              orderLng,
              currentRadius
            );

            // Filter for B2C vendors (shop_type 2 = Retailer/Door Step Buyer, shop_type 3 = Retailer B2C)
            // Also include shop_type 1 (Industrial) for SR users who can access both B2B and B2C
            const b2cShops = nearbyShops.filter(shop => {
              const shopType = typeof shop.shop_type === 'string' ? parseInt(shop.shop_type) : shop.shop_type;
              // Include shop_type 2, 3 (B2C), and shop_type 1 (for SR users who can do B2C)
              return shopType === 1 || shopType === 2 || shopType === 3;
            });

            // Get all B2C vendors from shop-based search (already sorted by distance)
            const shopBasedVendors = b2cShops.map(v => ({
              user_id: v.user_id,
              shop_id: v.id,
              distance: v.distance
            }));

            console.log(`   Found ${shopBasedVendors.length} vendor(s) from shop-based search within ${currentRadius}km`);

            // Also find B2C vendors directly by user_type (R or SR) and app_type (vendor_app)
            // This ensures vendors without active shops or with del_status = 2 shops are still included
            // Use pre-fetched allVendorUsers and shopsMap (already fetched outside loop)
            console.log(`   🔍 Filtering pre-fetched vendors by distance within ${currentRadius}km...`);
            const userBasedVendors = [];

            try {
              // For each vendor user, get shop from pre-fetched map and calculate distance
              for (const vendorUser of allVendorUsers) {
                try {
                  const vendorShop = shopsMap.get(parseInt(vendorUser.id));

                  if (vendorShop && vendorShop.lat_log) {
                    const [shopLat, shopLng] = vendorShop.lat_log.split(',').map(Number);
                    if (shopLat && shopLng) {
                      // Calculate distance using Haversine formula
                      const R = 6371; // Earth's radius in km
                      const dLat = (shopLat - orderLat) * Math.PI / 180;
                      const dLng = (shopLng - orderLng) * Math.PI / 180;
                      const a =
                        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                        Math.cos(orderLat * Math.PI / 180) * Math.cos(shopLat * Math.PI / 180) *
                        Math.sin(dLng / 2) * Math.sin(dLng / 2);
                      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
                      const distance = R * c;

                      if (distance <= currentRadius) {
                        // Check if shop is B2C type (1, 2, or 3), or if no shop type, include vendor anyway
                        // shop_type 1 (Industrial) is included for SR users who can access both B2B and B2C
                        const shopType = vendorShop.shop_type ? (typeof vendorShop.shop_type === 'string' ? parseInt(vendorShop.shop_type) : vendorShop.shop_type) : null;
                        if (!shopType || shopType === 1 || shopType === 2 || shopType === 3) {
                          userBasedVendors.push({
                            user_id: vendorUser.id,
                            shop_id: vendorShop.id,
                            distance: distance,
                            shop_type: shopType,
                            del_status: vendorShop.del_status || 1
                          });
                        }
                      }
                    }
                  }
                } catch (vendorError) {
                  console.error(`   ❌ Error processing vendor ${vendorUser.id}:`, vendorError.message);
                }
              }

              console.log(`   Found ${userBasedVendors.length} vendor(s) from user-based search within ${currentRadius}km`);
            } catch (userSearchError) {
              console.error('❌ Error finding vendors by user_type:', userSearchError);
            }

            // Combine shop-based and user-based vendors, avoiding duplicates, sort by distance
            const allVendorsMap = new Map();

            // Add shop-based vendors first
            for (const vendor of shopBasedVendors) {
              const userId = parseInt(vendor.user_id);
              if (!allVendorsMap.has(userId) || allVendorsMap.get(userId).distance > vendor.distance) {
                allVendorsMap.set(userId, vendor);
              }
            }

            // Add user-based vendors (will overwrite if already exists with better distance)
            for (const vendor of userBasedVendors) {
              const userId = parseInt(vendor.user_id);
              if (!allVendorsMap.has(userId) || allVendorsMap.get(userId).distance > vendor.distance) {
                allVendorsMap.set(userId, vendor);
              }
            }

            // Convert to array, sort by distance
            allVendors = Array.from(allVendorsMap.values())
              .sort((a, b) => (a.distance || 999) - (b.distance || 999));

            // Enforce same-zone notification delivery (customer zone -> vendor zone).
            if (customerZone && zoneVendorSet) {
              const beforeZoneFilterCount = allVendors.length;
              let strictZoneMatches = 0;
              let fallbackZoneMatches = 0;
              let excludedVendors = 0;
              const filteredVendors = [];

              for (const vendor of allVendors) {
                const vendorUserId = typeof vendor.user_id === 'string' && !isNaN(vendor.user_id)
                  ? parseInt(vendor.user_id, 10)
                  : vendor.user_id;

                if (zoneVendorSet.has(vendorUserId)) {
                  strictZoneMatches++;
                  filteredVendors.push(vendor);
                  continue;
                }

                const fallbackEligible = await isVendorEligibleForCustomerZone(vendorUserId);
                if (fallbackEligible) {
                  fallbackZoneMatches++;
                  filteredVendors.push(vendor);
                } else {
                  excludedVendors++;
                }
              }

              allVendors = filteredVendors;
              console.log(`🧭 Zone filter ${customerZone}: ${beforeZoneFilterCount} -> ${allVendors.length} vendors within ${currentRadius}km (strict=${strictZoneMatches}, fallback=${fallbackZoneMatches}, excluded=${excludedVendors})`);
            }

            // CRITICAL: If at least one vendor found, STOP and use only those vendors
            // Do NOT expand to 30km, 45km, etc. if vendors are already found
            if (allVendors.length > 0) {
              finalSearchRadius = currentRadius;
              console.log(`   ✅ Found ${allVendors.length} vendor(s) within ${currentRadius}km radius - STOPPING search (will not expand to larger radius)`);
              break; // Exit loop immediately when vendors are found
            } else {
              // Only expand radius if NO vendors found in current radius
              console.log(`   ⚠️  No vendors found within ${currentRadius}km, expanding search radius to ${currentRadius + radiusIncrement}km...`);
              currentRadius += radiusIncrement;
            }
          }

          // Update notified lists
          notifiedVendorIds = [];
          notifiedShopIds = [];

          // Special routing rule:
          // If customer phone is 7736068251, notify only non-subscribed vendors
          // (exclude vendors having active paid monthly/yearly subscriptions).
          const normalizePhone = (phone) => {
            if (!phone && phone !== 0) return '';
            let cleaned = String(phone).replace(/[^\d]/g, '');
            if (cleaned.startsWith('91') && cleaned.length > 10) {
              cleaned = cleaned.substring(cleaned.length - 10);
            }
            if (cleaned.startsWith('0') && cleaned.length > 10) {
              cleaned = cleaned.substring(cleaned.length - 10);
            }
            return cleaned;
          };

          const customerPhoneNormalized = normalizePhone(user.mob_num || user.mobile || user.phone || '');
          const specialCustomerPhone = '7736068251';

          if (customerPhoneNormalized === specialCustomerPhone && allVendors.length > 0) {
            try {
              console.log(`🎯 Special routing active for customer ${specialCustomerPhone} - excluding subscribed vendors`);
              const Invoice = require('../models/Invoice');
              const candidateVendorIds = new Set(
                allVendors.map(v => parseInt(v.user_id)).filter(id => !isNaN(id))
              );

              const allInvoices = await Invoice.getAll();
              const now = new Date();
              const subscribedVendorIds = new Set();

              allInvoices.forEach((invoice) => {
                const vendorUserId = parseInt(invoice.user_id);
                if (isNaN(vendorUserId) || !candidateVendorIds.has(vendorUserId)) {
                  return;
                }

                const invoiceType = String(invoice.type || '').toLowerCase();
                if (invoiceType !== 'paid') {
                  return;
                }

                const approvalStatus = String(invoice.approval_status || 'pending').toLowerCase();
                if (approvalStatus === 'rejected') {
                  return;
                }

                if (!invoice.to_date) {
                  return;
                }

                const toDate = new Date(invoice.to_date);
                if (isNaN(toDate.getTime()) || toDate <= now) {
                  return;
                }

                subscribedVendorIds.add(vendorUserId);
              });

              const beforeCount = allVendors.length;
              allVendors = allVendors.filter(v => !subscribedVendorIds.has(parseInt(v.user_id)));
              console.log(`🎯 Special routing applied: ${beforeCount - allVendors.length} subscribed vendor(s) excluded, ${allVendors.length} non-subscribed vendor(s) remaining`);
            } catch (subscriptionFilterError) {
              console.error('⚠️  Error applying special subscription filter:', subscriptionFilterError);
              console.error('   Falling back to default vendor list');
            }
          }

          for (const vendor of allVendors) {
            if (vendor.user_id) {
              notifiedVendorIds.push(parseInt(vendor.user_id));
            }
            if (vendor.shop_id) {
              notifiedShopIds.push(parseInt(vendor.shop_id));
            }
          }

          if (allVendors.length > 0) {
            console.log(`\n✅ Found ${allVendors.length} B2C vendor(s) to notify within ${finalSearchRadius}km radius (including vendors with deleted shops):`);
            allVendors.forEach(v => {
              console.log(`   - User ID: ${v.user_id}, Shop ID: ${v.shop_id || 'none'}, Distance: ${v.distance?.toFixed(2) || 'N/A'} km`);
            });

            // Keep status as 1 (Scheduled) - vendors still need to accept
            // Status 2 (Accepted) is only set when vendor explicitly accepts the order
            orderStatus = 1;
          } else {
            console.log(`\n⚠️  No B2C vendors found within ${maxRadius}km radius. Order will remain unassigned.`);
          }
        } catch (error) {
          console.error('❌ Error finding nearest B2C vendors:', error);
          // Continue without notification if there's an error
        }
      } else {
        console.log('⚠️  No valid location provided. Order will remain unassigned.');
      }

      const orderData = {
        order_number: orderNumber,
        customer_id: parseInt(customer_id),
        shop_id: null, // Not auto-assigned - first vendor to accept gets it
        orderdetails: typeof orderdetails === 'string' ? orderdetails : JSON.stringify(orderdetails),
        customerdetails: customerdetails,
        shopdetails: '', // No shop details initially
        del_type: 'pickup', // Pickup request
        estim_weight: parseFloat(estim_weight) || 0,
        estim_price: parseFloat(estim_price) || 0,
        status: orderStatus, // 1 = Scheduled (vendor needs to accept)
        address: customerdetails,
        lat_log: latLog,
        date: new Date().toISOString().split('T')[0],
        image1: image1,
        image2: image2,
        image3: image3,
        image4: image4,
        image5: image5,
        image6: image6,
        preferred_pickup_time: preferred_pickup_time || null,
        notified_vendor_ids: notifiedVendorIds.length > 0 ? JSON.stringify(notifiedVendorIds) : null, // Store notified vendor user IDs as JSON string
        notified_shop_ids: notifiedShopIds.length > 0 ? JSON.stringify(notifiedShopIds) : null // Store notified shop IDs as JSON string
      };

      // Log the data being saved
      console.log(`💾 Saving order with notified_vendor_ids:`, {
        notified_vendor_ids: orderData.notified_vendor_ids,
        notified_shop_ids: orderData.notified_shop_ids,
        vendor_count: notifiedVendorIds.length,
        shop_count: notifiedShopIds.length
      });

      const order = await Order.create(orderData);

      // Invalidate v2 API caches
      try {
        // Invalidate available pickup requests cache (new order is now available)
        await RedisCache.invalidateV2ApiCache('available_pickup_requests', null, {
          user_id: 'all',
          user_type: 'all'
        });
        // Also invalidate for customer's active pickup (if any)
        await RedisCache.invalidateV2ApiCache('active_pickup', customer_id, {
          user_type: 'U'
        });
        console.log(`🗑️  Invalidated v2 order caches after placing pickup request`);
      } catch (err) {
        console.error('Cache invalidation error:', err);
      }

      console.log(`✅ [V2OrderController.placePickupRequest] Order created successfully:`, {
        order_id: order.id,
        order_number: order.order_number,
        status: order.status,
        shop_id: order.shop_id,
        notified_vendor_count: notifiedVendorIds.length,
        notified_vendor_ids: notifiedVendorIds,
        notified_shop_ids: notifiedShopIds,
        has_notified_vendor_ids: !!order.notified_vendor_ids,
        has_notified_shop_ids: !!order.notified_shop_ids,
      });

      // Send push notifications to all vendors within 15km radius
      if (notifiedVendorIds.length > 0) {
        try {
          console.log(`📤 Sending notifications to ${notifiedVendorIds.length} vendor(s)...`);

          // Parse order details for notification
          let orderDetailsText = 'New pickup request';
          try {
            const orderDetailsObj = typeof order.orderdetails === 'string'
              ? JSON.parse(order.orderdetails)
              : order.orderdetails;

            if (orderDetailsObj && Array.isArray(orderDetailsObj) && orderDetailsObj.length > 0) {
              const materialCount = orderDetailsObj.length;
              const totalQty = orderDetailsObj.reduce((sum, item) => {
                const qty = parseFloat(item.expected_weight_kg || item.quantity || item.qty || 0);
                return sum + qty;
              }, 0);
              orderDetailsText = `${materialCount} material(s), ${totalQty} kg`;
            }
          } catch (parseErr) {
            console.warn('⚠️  Could not parse order details for notification:', parseErr.message);
          }

          // Create notification content
          const notificationTitle = `📦 New Pickup Request #${order.order_number}`;
          const addressPreview = order.customerdetails
            ? (order.customerdetails.length > 50
              ? order.customerdetails.substring(0, 50) + '...'
              : order.customerdetails)
            : 'Address not provided';
          const notificationBody = `${orderDetailsText} | Weight: ${order.estim_weight || 0} kg | Price: ₹${order.estim_price || 0} | ${addressPreview}`;

          // Send notification to each vendor
          const notificationPromises = notifiedVendorIds.map(async (vendorUserId) => {
            try {
              const vendorUser = await User.findById(vendorUserId);

              if (vendorUser && vendorUser.fcm_token) {
                await sendVendorNotification(
                  vendorUser.fcm_token,
                  notificationTitle,
                  notificationBody,
                  {
                    type: 'pickup_request',
                    order_id: order.id.toString(),
                    order_number: order.order_number.toString(),
                    customer_id: customer_id.toString(),
                    status: '1', // pending - available for acceptance
                    timestamp: new Date().toISOString()
                  }
                );

                console.log(`✅ Notification sent to vendor (user_id: ${vendorUserId})`);
                return { success: true, user_id: vendorUserId };
              } else {
                console.warn(`⚠️  Vendor user (user_id: ${vendorUserId}) not found or has no FCM token`);
                return { success: false, user_id: vendorUserId, reason: 'no_fcm_token' };
              }
            } catch (err) {
              console.error(`❌ Error sending notification to vendor (user_id: ${vendorUserId}):`, err);
              return { success: false, user_id: vendorUserId, error: err.message };
            }
          });

          // Wait for all notifications to be sent (but don't fail if some fail)
          const results = await Promise.allSettled(notificationPromises);
          const successCount = results.filter(r => r.status === 'fulfilled' && r.value?.success).length;
          console.log(`✅ Sent FCM notifications to ${successCount}/${notifiedVendorIds.length} vendors`);
          
          // Send SMS notifications to vendors using template: "Scrapmate pickup request {#var#}. Payable amount Rs{#var#}. Open B2C dashboard to accept."
          try {
            console.log(`📱 [SMS] Starting SMS notification process for order ${order.id} (${order.order_number || order.order_no})`);
            console.log(`📱 [SMS] Notified vendor IDs: ${notifiedVendorIds.join(', ')}`);
            console.log(`📱 [SMS] Sending SMS notifications to ${notifiedVendorIds.length} vendor(s)...`);
            
            // Extract material name from order details for SMS
            let materialName = 'scrap';
            try {
              const orderDetailsObj = typeof order.orderdetails === 'string'
                ? JSON.parse(order.orderdetails)
                : order.orderdetails;
              
              if (orderDetailsObj && Array.isArray(orderDetailsObj) && orderDetailsObj.length > 0) {
                // Get first material name
                const firstItem = orderDetailsObj[0];
                materialName = firstItem.material_name || firstItem.name || firstItem.category_name || 'scrap';
              } else if (orderDetailsObj && typeof orderDetailsObj === 'object') {
                // Try to extract from nested structure
                const firstKey = Object.keys(orderDetailsObj)[0];
                if (firstKey) {
                  materialName = firstKey;
                }
              }
            } catch (parseErr) {
              console.warn('⚠️  Could not parse order details for SMS material name:', parseErr.message);
            }
            
            // Build SMS message using template: "Scrapmate pickup request {#var#}. Payable amount Rs{#var#}. Open B2C dashboard to accept."
            // Example: "Scrapmate pickup request ORD12345 of Books scrap. Payable amount Rs1200. Open B2C dashboard to accept."
            const orderNumber = order.order_number || order.order_no || 'N/A';
            const payableAmount = Math.round(order.estim_price || order.estimated_price || 0);
            
            // First variable: order number + "of" + material name (e.g., "ORD12345 of Books scrap")
            const firstVar = `${orderNumber} of ${materialName}`;
            // Second variable: just the amount number (e.g., "1200")
            const secondVar = `${payableAmount}`;
            
            // Build message - replace {#var#} placeholders with actual values
            // Template: "Scrapmate pickup request {#var#}. Payable amount Rs{#var#}. Open B2C dashboard to accept."
            // Example: "Scrapmate pickup request ORD12345 of Books scrap. Payable amount Rs1200. Open B2C dashboard to accept."
            const smsMessage = `Scrapmate pickup request ${firstVar}. Payable amount Rs${secondVar}. Open B2C dashboard to accept.`;
            
            console.log(`📱 SMS message: ${smsMessage}`);
            console.log(`   Order: ${orderNumber}, Material: ${materialName}, Amount: Rs${payableAmount}`);
            console.log(`   First var: ${firstVar}, Second var: ${secondVar}`);
            
            // Send SMS to each vendor
            const BulkMessageNotification = require('../models/BulkMessageNotification');
            const http = require('http');
            const querystring = require('querystring');
            
            const SMS_CONFIG = {
              username: 'scrapmate',
              sendername: 'SCRPMT',
              smstype: 'TRANS',
              apikey: '1bf0131f-d1f2-49ed-9c57-19f1b4400f32',
              peid: '1701173389563945545',
              templateid: '1707176812500484578' // Template ID for pickup request SMS
            };
            
            // Helper function to send SMS
            const sendSMS = (phoneNumber, message) => {
              return new Promise((resolve, reject) => {
                const params = querystring.stringify({
                  username: SMS_CONFIG.username,
                  message: message,
                  sendername: SMS_CONFIG.sendername,
                  smstype: SMS_CONFIG.smstype,
                  numbers: phoneNumber,
                  apikey: SMS_CONFIG.apikey,
                  peid: SMS_CONFIG.peid,
                  templateid: SMS_CONFIG.templateid,
                });
                
                const options = {
                  hostname: 'sms.bulksmsind.in',
                  path: `/v2/sendSMS?${params}`,
                  method: 'GET',
                  timeout: 30000, // 30 second timeout
                };
                
                const req = http.request(options, (res) => {
                  let data = '';
                  
                  res.on('data', (chunk) => { 
                    data += chunk; 
                  });
                  
                  res.on('end', () => {
                    try {
                      const response = JSON.parse(data);
                      console.log(`📱 [SMS] API Response for ${phoneNumber}:`, JSON.stringify(response));
                      resolve(response);
                    } catch (e) {
                      console.warn(`⚠️  [SMS] Failed to parse response for ${phoneNumber}, raw data:`, data);
                      resolve({ raw: data, parseError: e.message });
                    }
                  });
                  
                  res.on('error', (error) => {
                    console.error(`❌ [SMS] Response error for ${phoneNumber}:`, error);
                    reject(error);
                  });
                });
                
                req.on('error', (error) => {
                  console.error(`❌ [SMS] Request error for ${phoneNumber}:`, error);
                  reject(error);
                });
                
                req.on('timeout', () => {
                  console.error(`❌ [SMS] Request timeout for ${phoneNumber} after 30 seconds`);
                  req.destroy();
                  reject(new Error('SMS request timeout'));
                });
                
                req.setTimeout(30000); // Set timeout
                req.end();
              });
            };
            
            // Helper function to extract phone number
            const extractPhoneNumber = (phone) => {
              if (!phone) return null;
              // Convert to string if it's a number
              let phoneStr = String(phone);
              let cleaned = phoneStr.replace(/\s+/g, '').replace(/[^\d+]/g, '');
              if (cleaned.startsWith('+91')) {
                cleaned = cleaned.substring(3);
              } else if (cleaned.startsWith('91') && cleaned.length === 12) {
                cleaned = cleaned.substring(2);
              }
              if (cleaned.length === 10 && /^[6-9]\d{9}$/.test(cleaned)) {
                return cleaned;
              }
              return null;
            };
            
            // OPTIMIZED: Batch fetch all users at once instead of one-by-one
            console.log(`📱 [SMS] Batch fetching ${notifiedVendorIds.length} vendor users...`);
            const { BatchGetCommand } = require('@aws-sdk/lib-dynamodb');
            const usersClient = require('../config/dynamodb').getDynamoDBClient();
            const usersMap = new Map();
            
            // Batch get users (DynamoDB allows up to 100 items per batch)
            const batchSize = 100;
            for (let i = 0; i < notifiedVendorIds.length; i += batchSize) {
              const batch = notifiedVendorIds.slice(i, i + batchSize);
              const keys = batch.map(id => ({ id: parseInt(id) }));
              
              try {
                // Use ExpressionAttributeNames to handle reserved keyword 'name'
                const batchCommand = new BatchGetCommand({
                  RequestItems: {
                    'users': {
                      Keys: keys,
                      ProjectionExpression: 'id, #name, mob_num', // Use alias for reserved keyword
                      ExpressionAttributeNames: {
                        '#name': 'name' // Alias for reserved keyword 'name'
                      }
                    }
                  }
                });
                const batchResponse = await usersClient.send(batchCommand);
                
                if (batchResponse.Responses && batchResponse.Responses['users']) {
                  batchResponse.Responses['users'].forEach(user => {
                    usersMap.set(parseInt(user.id), user);
                  });
                  console.log(`📱 [SMS] Batch ${i}-${i + batch.length}: Fetched ${batchResponse.Responses['users'].length} users`);
                }
              } catch (batchErr) {
                console.error(`❌ [SMS] Batch get error for batch ${i}-${i + batch.length}:`, batchErr.message);
                console.error(`   [SMS] Error details:`, batchErr);
                // Fallback: Try fetching users one by one if batch fails
                console.log(`📱 [SMS] Falling back to individual user fetches for batch ${i}-${i + batch.length}...`);
                for (const vendorId of batch) {
                  try {
                    const User = require('../models/User');
                    const vendorUser = await User.findById(parseInt(vendorId));
                    if (vendorUser) {
                      usersMap.set(parseInt(vendorId), vendorUser);
                      console.log(`📱 [SMS] Fetched user ${vendorId} via fallback method`);
                    }
                  } catch (fallbackErr) {
                    console.error(`❌ [SMS] Fallback fetch error for user ${vendorId}:`, fallbackErr.message);
                  }
                }
              }
            }
            
            console.log(`📱 [SMS] Fetched ${usersMap.size} users from ${notifiedVendorIds.length} requested`);
            
            // Send SMS to each vendor
            console.log(`📱 [SMS] Creating SMS promises for ${notifiedVendorIds.length} vendors...`);
            const smsPromises = notifiedVendorIds.map(async (vendorUserId) => {
              try {
                console.log(`📱 [SMS] Processing SMS for vendor user_id: ${vendorUserId}`);
                // Get user from pre-fetched map
                const vendorUser = usersMap.get(parseInt(vendorUserId));
                
                if (!vendorUser) {
                  console.warn(`⚠️  [SMS] Vendor user (user_id: ${vendorUserId}) not found in database`);
                  return { success: false, user_id: vendorUserId, reason: 'user_not_found' };
                }
                
                console.log(`📱 [SMS] Vendor found: ${vendorUser.name || 'N/A'}, Phone: ${vendorUser.mob_num || 'N/A'}`);
                
                if (vendorUser.mob_num) {
                  const phoneNumber = extractPhoneNumber(vendorUser.mob_num);
                  
                  if (phoneNumber) {
                    console.log(`📱 [SMS] Extracted phone number: ${phoneNumber} (from ${vendorUser.mob_num})`);
                    
                    // Send SMS
                    console.log(`📱 [SMS] Sending SMS to ${phoneNumber} (vendor ${vendorUserId})...`);
                    console.log(`📱 [SMS] Message: ${smsMessage}`);
                    let smsResult = null;
                    try {
                      smsResult = await sendSMS(phoneNumber, smsMessage);
                      console.log(`📱 [SMS] API response for ${phoneNumber}:`, JSON.stringify(smsResult));
                    } catch (smsApiError) {
                      console.error(`❌ [SMS ERROR] SMS API error for ${phoneNumber} (vendor ${vendorUserId}):`, smsApiError);
                      console.error(`   [SMS ERROR] Error name:`, smsApiError.name);
                      console.error(`   [SMS ERROR] Error message:`, smsApiError.message);
                      console.error(`   [SMS ERROR] Error stack:`, smsApiError.stack);
                      smsResult = { error: smsApiError.message, status: 'error' };
                    }
                    
                    // Save to bulk_message_notifications table
                    try {
                      const notificationRecord = await BulkMessageNotification.save({
                        phone_number: phoneNumber,
                        business_data: {
                          order_id: order.id,
                          order_number: orderNumber,
                          vendor_user_id: vendorUserId,
                          material_name: materialName,
                          amount: payableAmount
                        },
                        message: smsMessage,
                        status: (() => {
                          // Check if SMS was successful - handle array response format
                          if (Array.isArray(smsResult) && smsResult.length > 0) {
                            return smsResult[0].status === 'success' ? 'sent' : 'failed';
                          } else if (smsResult && typeof smsResult === 'object') {
                            return (smsResult.status === 'success' || smsResult.success === true) ? 'sent' : 'failed';
                          }
                          return 'failed';
                        })(),
                        language: 'en'
                      });
                      console.log(`📱 [SMS] ✅ Saved SMS record to database: ${notificationRecord.id}`);
                    } catch (dbErr) {
                      console.error(`❌ [SMS ERROR] Error saving SMS to database for vendor ${vendorUserId}:`, dbErr);
                      console.error(`   [SMS ERROR] DB Error message:`, dbErr.message);
                      console.error(`   [SMS ERROR] DB Error stack:`, dbErr.stack);
                    }
                    
                    // Check if SMS was successful - API returns array with object containing status
                    let isSuccess = false;
                    if (Array.isArray(smsResult) && smsResult.length > 0) {
                      // API returns array: [{ status: 'success', msg: '...', msgid: '...' }]
                      isSuccess = smsResult[0].status === 'success';
                    } else if (smsResult && typeof smsResult === 'object') {
                      // Check for direct status or success field
                      isSuccess = smsResult.status === 'success' || smsResult.success === true;
                    }
                    
                    if (isSuccess) {
                      console.log(`✅ [SMS] SMS sent successfully to vendor (user_id: ${vendorUserId}, phone: ${phoneNumber})`);
                      if (Array.isArray(smsResult) && smsResult[0].msgid) {
                        console.log(`📱 [SMS] Message ID: ${smsResult[0].msgid}`);
                      }
                    } else {
                      console.warn(`⚠️  [SMS] SMS may have failed for vendor (user_id: ${vendorUserId}, phone: ${phoneNumber}):`, smsResult);
                    }
                    return { success: isSuccess, user_id: vendorUserId, phone: phoneNumber, smsResult };
                  } else {
                    console.warn(`⚠️  [SMS] Invalid phone number for vendor (user_id: ${vendorUserId}): ${vendorUser.mob_num}`);
                    return { success: false, user_id: vendorUserId, reason: 'invalid_phone', original_phone: vendorUser.mob_num };
                  }
                } else {
                  console.warn(`⚠️  [SMS] Vendor user (user_id: ${vendorUserId}) has no phone number (mob_num is null/undefined)`);
                  return { success: false, user_id: vendorUserId, reason: 'no_phone' };
                }
              } catch (err) {
                console.error(`❌ [SMS ERROR] Error sending SMS to vendor (user_id: ${vendorUserId}):`, err);
                console.error(`   [SMS ERROR] Error name:`, err.name);
                console.error(`   [SMS ERROR] Error message:`, err.message);
                console.error(`   [SMS ERROR] Error stack:`, err.stack);
                return { success: false, user_id: vendorUserId, error: err.message };
              }
            });
            
            // Wait for all SMS to be sent (but don't fail if some fail)
            console.log(`📱 [SMS] Waiting for all SMS promises to complete...`);
            const smsResults = await Promise.allSettled(smsPromises);
            console.log(`📱 [SMS] All SMS promises completed. Total results: ${smsResults.length}`);
            
            const smsSuccessCount = smsResults.filter(r => r.status === 'fulfilled' && r.value?.success).length;
            const smsFailedResults = smsResults.filter(r => r.status === 'fulfilled' && !r.value?.success);
            const smsRejectedResults = smsResults.filter(r => r.status === 'rejected');
            
            console.log(`📱 [SMS] Summary: ${smsSuccessCount} successful, ${smsFailedResults.length} failed, ${smsRejectedResults.length} rejected`);
            console.log(`✅ [SMS] Sent SMS notifications to ${smsSuccessCount}/${notifiedVendorIds.length} vendors`);
            if (smsFailedResults.length > 0) {
              console.warn(`⚠️  [SMS] ${smsFailedResults.length} SMS failed:`);
              smsFailedResults.forEach(r => {
                const result = r.value;
                console.warn(`   [SMS] - Vendor ${result?.user_id}: ${result?.reason || result?.error || 'unknown error'}`);
                if (result?.phone) {
                  console.warn(`     [SMS] Phone: ${result.phone}`);
                } else if (result?.original_phone) {
                  console.warn(`     [SMS] Original phone: ${result.original_phone}`);
                }
                if (result?.smsResult) {
                  console.warn(`     [SMS] API Response:`, JSON.stringify(result.smsResult));
                }
              });
            }
            
            if (smsRejectedResults.length > 0) {
              console.error(`❌ [SMS ERROR] ${smsRejectedResults.length} SMS promises were rejected (threw exceptions):`);
              smsRejectedResults.forEach((r, index) => {
                console.error(`   [SMS ERROR] Rejected promise ${index + 1}:`, r.reason);
                console.error(`   [SMS ERROR] Error message:`, r.reason?.message || 'Unknown error');
                console.error(`   [SMS ERROR] Error stack:`, r.reason?.stack || 'No stack trace');
              });
            }
            
            // Check if vendor with phone 9074135121 is in the list
            const targetPhone = '9074135121';
            const targetVendorResult = smsResults.find(r => {
              const result = r.value;
              return result && (result.phone === targetPhone || result.original_phone === targetPhone);
            });
            if (targetVendorResult) {
              const result = targetVendorResult.value;
              console.log(`📱 SMS status for vendor ${targetPhone}:`, result);
            } else {
              // Check if vendor with this phone is in notified_vendor_ids
              try {
                const vendorWithPhone = await User.findByMobile(targetPhone);
                if (vendorWithPhone) {
                  const isInNotifiedList = notifiedVendorIds.includes(vendorWithPhone.id) || 
                                          notifiedVendorIds.includes(String(vendorWithPhone.id)) ||
                                          notifiedVendorIds.includes(Number(vendorWithPhone.id));
                  console.log(`🔍 Vendor with phone ${targetPhone} found:`, {
                    user_id: vendorWithPhone.id,
                    name: vendorWithPhone.name,
                    is_in_notified_list: isInNotifiedList,
                    notified_vendor_ids: notifiedVendorIds
                  });
                  if (!isInNotifiedList) {
                    console.warn(`⚠️  Vendor ${vendorWithPhone.id} (phone: ${targetPhone}) is NOT in notified_vendor_ids list!`);
                  }
                } else {
                  console.warn(`⚠️  Vendor with phone ${targetPhone} not found in database`);
                }
              } catch (findErr) {
                console.error(`❌ Error finding vendor with phone ${targetPhone}:`, findErr);
              }
            }
          } catch (smsError) {
            // Don't fail the order placement if SMS fails, but log extensively
            console.error('❌ [SMS ERROR] CRITICAL: Error in SMS notification block:', smsError);
            console.error('   [SMS ERROR] Error name:', smsError.name);
            console.error('   [SMS ERROR] Error message:', smsError.message);
            console.error('   [SMS ERROR] Error stack:', smsError.stack);
            console.error('   [SMS ERROR] Order ID:', order.id);
            console.error('   [SMS ERROR] Order Number:', order.order_number || order.order_no);
            console.error('   [SMS ERROR] Notified Vendor IDs:', notifiedVendorIds);
            console.error('   [SMS ERROR] Notified Vendor IDs count:', notifiedVendorIds.length);
            console.error('   [SMS ERROR] This error prevented SMS from being sent to any vendors');
            console.error('   [SMS ERROR] Order was still created successfully');
            
            // Also log to CloudWatch/console with a clear marker for monitoring
            console.error('🚨 SMS_SENDING_FAILED 🚨', {
              order_id: order.id,
              order_number: order.order_number || order.order_no,
              vendor_count: notifiedVendorIds.length,
              error: smsError.message,
              timestamp: new Date().toISOString()
            });
          }
        } catch (notifError) {
          // Don't fail the order placement if notification fails
          console.error('❌ Error sending notifications to vendors:', notifError);
          console.error('   Order was still created successfully');
        }
      } else {
        console.log('ℹ️  No vendors to notify, skipping notifications');
      }

      return res.json({
        status: 'success',
        msg: 'Pickup request placed successfully',
        data: {
          order_number: order.order_number,
          order_id: order.id,
          status: order.status
        }
      });
    } catch (error) {
      console.error('❌ [V2OrderController.placePickupRequest] Error:', error);
      console.error('   Error message:', error.message);
      console.error('   Error stack:', error.stack);
      return res.status(500).json({
        status: 'error',
        msg: error.message || 'Failed to place pickup request',
        data: null
      });
    }
  }

  /**
   * GET /api/v2/orders/pickup-requests/available
   * Get available pickup requests that can be accepted by R, S, SR, or D users
   * Query params: ?user_id=number&user_type=R|S|SR|D&latitude=number&longitude=number&radius=number(km)
   */
  static async getAvailablePickupRequests(req, res) {
    try {
      const { user_id, user_type, latitude, longitude, radius = 10 } = req.query;

      if (!user_id || !user_type) {
        return res.status(400).json({
          status: 'error',
          msg: 'Missing required query params: user_id, user_type',
          data: null
        });
      }

      // Validate user type
      const validTypes = ['R', 'S', 'SR', 'D'];
      if (!validTypes.includes(user_type)) {
        return res.status(400).json({
          status: 'error',
          msg: 'Invalid user_type. Must be R, S, SR, or D',
          data: null
        });
      }

      // Check Redis cache first (only if location is provided, as results vary by location)
      // For location-based queries, cache key includes location and radius
      // Also include user_id since different vendors see different assigned orders
      let cacheKey = null;
      if (latitude && longitude) {
        const latRounded = Math.round(parseFloat(latitude) * 100) / 100; // Round to 2 decimals
        const lngRounded = Math.round(parseFloat(longitude) * 100) / 100;
        cacheKey = RedisCache.listKey('available_pickup_requests', {
          user_id: parseInt(user_id),
          user_type,
          lat: latRounded,
          lng: lngRounded,
          radius: parseFloat(radius)
        });
      } else {
        // Without location, cache by user_id and user_type
        cacheKey = RedisCache.listKey('available_pickup_requests', {
          user_id: parseInt(user_id),
          user_type
        });
      }

      // Temporarily disable caching to ensure real-time order updates
      // Cache will be re-enabled once we have proper cache invalidation
      // try {
      //   const cached = await RedisCache.get(cacheKey);
      //   if (cached !== null && cached !== undefined) {
      //     console.log('⚡ Available pickup requests cache hit');
      //     return res.json({
      //       status: 'success',
      //       msg: 'Available pickup requests retrieved successfully',
      //       data: cached,
      //       hitBy: 'Redis'
      //     });
      //   }
      // } catch (err) {
      //   console.error('Redis get error:', err);
      // }

      // Get vendor's shop_id(s) if they have one (for R, S, SR types)
      // For SR users, they have both B2C (shop_type = 3) and B2B (shop_type = 1 or 4) shops
      let vendorShopIds = [];
      if (user_type === 'R' || user_type === 'S' || user_type === 'SR') {
        try {
          const Shop = require('../models/Shop');
          if (user_type === 'SR') {
            // For SR users, find all shops (B2C + B2B)
            const allShops = await Shop.findAllByUserId(parseInt(user_id));
            if (allShops && allShops.length > 0) {
              vendorShopIds = allShops.map(s => parseInt(s.id));
              console.log(`✅ Found ${allShops.length} shop(s) for SR vendor: shop_ids=${vendorShopIds.join(', ')}, user_id=${user_id}`);
            }
          } else {
            // For R and S users, use findByUserId (single shop)
            const shop = await Shop.findByUserId(parseInt(user_id));
            if (shop && shop.id) {
              vendorShopIds = [parseInt(shop.id)];
              console.log(`✅ Found shop for vendor: shop_id=${vendorShopIds[0]}, user_id=${user_id}`);
            }
          }
        } catch (shopErr) {
          console.warn('⚠️  Could not find shop for vendor:', shopErr.message);
        }
      }

      // Get orders that are available for this vendor:
      // 1. Unassigned orders (status = 1, shop_id = null) - available for any vendor
      // 2. Orders assigned to this vendor's shop (status = 1, shop_id = vendor's shop_id) - auto-assigned but not yet accepted
      //    Note: Status 1 = Scheduled (user sent request), only status 1 orders are available for acceptance
      const client = require('../config/dynamodb').getDynamoDBClient();
      const { ScanCommand } = require('@aws-sdk/lib-dynamodb');

      let allOrders = [];

      // OPTIMIZED: Use Order.findByStatus() which uses GSI instead of Scan
      // Get all orders with status = 1 (available pickup requests)
      let lastKey = null;
      let status1Orders = [];
      do {
        const result = await Order.findByStatus(1, 1000, lastKey);
        if (result.items) {
          status1Orders.push(...result.items);
        }
        lastKey = result.lastEvaluatedKey;
      } while (lastKey);

      // Filter for unassigned orders (shop_id = null)
      allOrders = status1Orders.filter(order => !order.shop_id || order.shop_id === null);
      console.log(`📦 Found ${allOrders.length} unassigned orders (status=1, shop_id=null) out of ${status1Orders.length} total status=1 orders`);

      // Safety check: Log any orders that somehow have status != 1 (shouldn't happen with FilterExpression)
      allOrders.forEach(order => {
        const orderStatus = typeof order.status === 'string' ? parseInt(order.status) : order.status;
        if (orderStatus !== 1) {
          console.warn(`⚠️  WARNING: Found order ${order.order_number || order.id} with status ${orderStatus} in unassigned query (should be 1)`);
        }
      });

      // OPTIMIZED: Get orders assigned to this vendor's shop(s) using Order.findByShopId()
      // Status 1 with shop_id = auto-assigned but pending acceptance
      // For SR users, check all their shops (B2C + B2B) in one query
      if (vendorShopIds.length > 0) {
        const existingOrderIds = new Set(allOrders.map(o => o.id));
        
        // OPTIMIZATION: Use Order.findByShopId() which uses GSI instead of Scan
        // Query each shop separately (can be parallelized in future)
        const assignedPendingOrders = [];
        for (const shopId of vendorShopIds) {
          try {
            const shopOrders = await Order.findByShopId(shopId, 1, 0, 1000); // status=1, no offset, limit 1000
            assignedPendingOrders.push(...shopOrders);
          } catch (shopErr) {
            console.warn(`⚠️  Error fetching orders for shop ${shopId}:`, shopErr.message);
          }
        }
        
        console.log(`📦 Found ${assignedPendingOrders.length} orders assigned to vendor shops (status=1, shop_ids: ${vendorShopIds.join(', ')}) - scheduled, pending acceptance`);

        // Safety check: Log any orders that somehow have status != 1
        assignedPendingOrders.forEach(order => {
          const orderStatus = typeof order.status === 'string' ? parseInt(order.status) : order.status;
          if (orderStatus !== 1) {
            console.warn(`⚠️  WARNING: Found order ${order.order_number || order.id} with status ${orderStatus} in assigned query (should be 1)`);
          }
        });

        // Combine all sets of orders (avoid duplicates)
        // Only status 1 orders are available for acceptance
        assignedPendingOrders.forEach(order => {
          if (!existingOrderIds.has(order.id)) {
            allOrders.push(order);
            existingOrderIds.add(order.id);
          }
        });
      }

      let orders = allOrders;

      // Filter out orders that were cancelled by this vendor
      // Also explicitly filter out orders that have been accepted by other vendors (status = 2, 3, 4, 5)
      // IMPORTANT: Only show orders to vendors who were notified (in notified_vendor_ids)
      const userIdNum = parseInt(user_id);
      orders = orders.filter(order => {
        // First, ensure we only show status 1 orders (double-check to prevent any status 2+ orders from showing)
        const orderStatus = typeof order.status === 'string' ? parseInt(order.status) : order.status;
        if (orderStatus !== 1) {
          console.log(`🚫 Filtering out order ${order.order_number || order.id} - status is ${orderStatus} (not available for acceptance)`);
          return false;
        }

        // Additional safety check: If order has shop_id set but it's not this vendor's shop_id, filter it out
        // This handles edge cases where an order might have shop_id set but status is still 1 (shouldn't happen, but safety check)
        // If order is assigned to this vendor's shop(s), they can see it (auto-assigned orders)
        // For SR users, check if order is assigned to any of their shops (B2C + B2B)
        const orderShopId = order.shop_id ? (typeof order.shop_id === 'string' ? parseInt(order.shop_id) : order.shop_id) : null;
        const isAssignedToThisVendor = vendorShopIds.length > 0 && orderShopId !== null && vendorShopIds.includes(orderShopId);

        if (order.shop_id && order.shop_id !== null && !isAssignedToThisVendor) {
          console.log(`🚫 Filtering out order ${order.order_number || order.id} - assigned to different shop (shop_id: ${orderShopId}, vendor shop_ids: ${vendorShopIds.join(', ')})`);
          return false;
        }

        // CRITICAL: Only show unassigned orders to vendors who were notified (in notified_vendor_ids)
        // This ensures only the 5 nearby vendors who were notified can see and accept unassigned orders
        // Exception: If order is assigned to this vendor's shop, they can see it regardless (auto-assigned)
        let isVendorNotified = false;
        if (!isAssignedToThisVendor) {
          if (order.notified_vendor_ids) {
            try {
              let notifiedVendorIds = order.notified_vendor_ids;
              if (typeof notifiedVendorIds === 'string') {
                notifiedVendorIds = JSON.parse(notifiedVendorIds);
              }

              // Ensure it's an array
              if (!Array.isArray(notifiedVendorIds)) {
                notifiedVendorIds = [notifiedVendorIds];
              }

              // Check if current vendor is in the notified list
              isVendorNotified = notifiedVendorIds.some(id => {
                const notifiedId = typeof id === 'string' ? parseInt(id) : id;
                return notifiedId === userIdNum;
              });

              if (!isVendorNotified) {
                console.log(`🚫 Filtering out order ${order.order_number || order.id} - vendor ${userIdNum} was not notified (not in notified_vendor_ids)`);
                return false;
              }

              // Mark order as notified so location filter knows to skip distance check
              order._isVendorNotified = true;
              console.log(`✅ Order ${order.order_number || order.id} - vendor ${userIdNum} is in notified_vendor_ids - WILL SHOW regardless of location/radius`);
            } catch (parseErr) {
              console.warn(`⚠️  Could not parse notified_vendor_ids for order ${order.order_number || order.id}:`, parseErr.message);
              // If we can't parse notified_vendor_ids, filter out the order for safety
              console.log(`🚫 Filtering out order ${order.order_number || order.id} - could not parse notified_vendor_ids`);
              return false;
            }
          } else {
            // If order has no notified_vendor_ids, filter it out (shouldn't happen for new orders, but safety check)
            console.log(`🚫 Filtering out order ${order.order_number || order.id} - no notified_vendor_ids field`);
            return false;
          }
        } else {
          // Order is assigned to this vendor's shop - they can see it (auto-assigned)
          isVendorNotified = true; // Mark as notified so location filter doesn't apply
          order._isVendorNotified = true; // Mark order so location filter knows to skip distance check
          console.log(`✅ Order ${order.order_number || order.id} - assigned to vendor's shop (shop_id: ${orderShopId}), showing regardless of notified_vendor_ids`);
        }

        // Check if this vendor cancelled this order
        if (order.vendor_cancellations) {
          try {
            const cancellations = typeof order.vendor_cancellations === 'string'
              ? JSON.parse(order.vendor_cancellations)
              : order.vendor_cancellations;

            if (Array.isArray(cancellations)) {
              // Check if this vendor (user_id) cancelled this order
              const hasCancelled = cancellations.some(cancellation => {
                const cancelUserId = typeof cancellation.user_id === 'string'
                  ? parseInt(cancellation.user_id)
                  : cancellation.user_id;
                return cancelUserId === userIdNum;
              });

              if (hasCancelled) {
                console.log(`🚫 Filtering out order ${order.order_number || order.id} - cancelled by vendor ${userIdNum}`);
                return false;
              }
            }
          } catch (parseErr) {
            console.warn('⚠️  Could not parse vendor_cancellations:', parseErr.message);
          }
        }
        return true;
      });

      // If location provided, filter by distance
      // IMPORTANT: If vendor is in notified_vendor_ids, they should see the order regardless of distance
      if (latitude && longitude) {
        const userLat = parseFloat(latitude);
        const userLng = parseFloat(longitude);
        const radiusKm = parseFloat(radius);

        orders = orders.filter(order => {
          // If vendor is in notified_vendor_ids (marked in previous filter), always show the order (skip distance check)
          if (order._isVendorNotified) {
            console.log(`✅ Order ${order.order_number || order.id} - vendor ${userIdNum} is notified, showing regardless of distance`);
            // Still calculate distance for display purposes
            if (order.lat_log) {
              const [orderLat, orderLng] = order.lat_log.split(',').map(Number);
              if (!isNaN(orderLat) && !isNaN(orderLng)) {
                const distance = calculateDistance(userLat, userLng, orderLat, orderLng);
                order.distance_km = distance;
              }
            }
            return true;
          }

          // For orders where vendor is NOT in notified_vendor_ids, apply distance filter
          // (This shouldn't happen since we already filtered by notified_vendor_ids above, but safety check)
          if (!order.lat_log) return false;
          const [orderLat, orderLng] = order.lat_log.split(',').map(Number);
          if (isNaN(orderLat) || isNaN(orderLng)) return false;

          // Calculate distance using Haversine formula
          const distance = calculateDistance(userLat, userLng, orderLat, orderLng);
          order.distance_km = distance;
          return distance <= radiusKm;
        });

        // Sort by distance (notified orders will have their distance calculated, others filtered by radius)
        orders.sort((a, b) => (a.distance_km || Infinity) - (b.distance_km || Infinity));
      }

      // OPTIMIZED: Batch fetch customers instead of N+1 queries
      const customerIds = [...new Set(orders.map(o => o.customer_id).filter(Boolean))];
      const customerMap = {};
      const User = require('../models/User');
      
      if (customerIds.length > 0) {
        try {
          // Batch fetch customers by IDs
          const customers = await Customer.findByIds(customerIds);
          customers.forEach(c => {
            if (c) {
              customerMap[c.id] = c;
              if (c.user_id && c.user_id !== c.id) {
                customerMap[c.user_id] = c;
              }
            }
          });
          console.log(`✅ Batch fetched ${customers.length} customers for ${customerIds.length} customer IDs`);
          
          // For any customer IDs not found, try batch fetching from User table
          const missingCustomerIds = customerIds.filter(id => !customerMap[id]);
          if (missingCustomerIds.length > 0) {
            console.log(`📦 Fetching ${missingCustomerIds.length} missing customers from User table...`);
            const users = await User.findByIds(missingCustomerIds);
            users.forEach(user => {
              if (user && !customerMap[user.id]) {
                // Create customer-like object from user data
                customerMap[user.id] = {
                  id: user.id,
                  name: user.name || null,
                  contact: user.mob_num || null
                };
              }
            });
            console.log(`✅ Batch fetched ${users.length} users as customer fallback`);
          }
        } catch (batchErr) {
          console.error('Error batch fetching customers:', batchErr.message);
          // Fallback to individual fetches if batch fails
          const customers = await Promise.all(
            customerIds.map(async (id) => {
              try {
                let customer = await Customer.findById(id);
                if (customer) return customer;
                customer = await Customer.findByUserId(id);
                if (customer) return customer;
                const user = await User.findById(id);
                if (user) {
                  return { id: id, name: user.name || null, contact: user.mob_num || null };
                }
                return null;
              } catch (err) {
                console.error(`Error fetching customer ${id}:`, err);
                return null;
              }
            })
          );
          customers.forEach(c => {
            if (c) {
              customerMap[c.id] = c;
              if (c.user_id && c.user_id !== c.id) {
                customerMap[c.user_id] = c;
              }
            }
          });
        }
      }
      
      // Ensure all customer IDs are mapped (handle edge cases)
      customerIds.forEach(customerId => {
        if (!customerMap[customerId]) {
          // Try to find in existing map by checking user_id
          const found = Object.values(customerMap).find(c => c && (c.id === customerId || c.user_id === customerId));
          if (found) {
            customerMap[customerId] = found;
          }
        }
      });

      // Get vendor's custom prices to recalculate order prices
      let vendorPriceMap = new Map();
      if (user_type !== 'D') {
        try {
          const User = require('../models/User');
          const vendorUser = await User.findById(parseInt(user_id));
          if (vendorUser && vendorUser.operating_subcategories && Array.isArray(vendorUser.operating_subcategories)) {
            vendorUser.operating_subcategories.forEach(userSubcat => {
              const subcatId = userSubcat.subcategory_id || userSubcat.subcategoryId;
              const customPrice = userSubcat.custom_price || '';
              if (subcatId && customPrice && customPrice.trim() !== '') {
                const priceValue = parseFloat(customPrice);
                if (!isNaN(priceValue)) {
                  vendorPriceMap.set(parseInt(subcatId), priceValue);
                }
              }
            });
            console.log(`💰 [getAvailablePickupRequests] Vendor ${user_id} has ${vendorPriceMap.size} subcategories with custom prices`);
          }
        } catch (priceErr) {
          console.warn('⚠️  [getAvailablePickupRequests] Error fetching vendor prices:', priceErr.message);
        }
      }

      // Format orders for response
      const formattedOrders = orders.map(order => {
        const [lat, lng] = order.lat_log ? order.lat_log.split(',').map(Number) : [null, null];

        // Get customer info
        // Try to find customer by customer_id, or by user_id if customer_id is actually a user_id
        let customer = order.customer_id ? customerMap[order.customer_id] : null;
        if (!customer && order.customer_id) {
          // Try to find by user_id in the map
          const found = Object.values(customerMap).find(c => c && c.user_id === order.customer_id);
          if (found) customer = found;
        }
        const customer_name = customer?.name || null;
        const customer_phone = customer?.contact ? String(customer.contact) : null;

        // Parse orderdetails to get scrap description and recalculate price with vendor's custom prices
        let scrapDescription = 'Mixed Recyclables';
        let totalWeight = parseFloat(order.estim_weight) || 0;
        let recalculatedPrice = parseFloat(order.estim_price) || 0;

        try {
          const details = typeof order.orderdetails === 'string'
            ? JSON.parse(order.orderdetails)
            : order.orderdetails;

          if (details && typeof details === 'object') {
            // Extract scrap types and weights from orderdetails
            const items = [];
            if (Array.isArray(details)) {
              items.push(...details);
            } else if (details.orders) {
              Object.entries(details.orders).forEach(([category, subcats]) => {
                if (Array.isArray(subcats)) {
                  items.push(...subcats);
                }
              });
            }

            if (items.length > 0) {
              const categories = [...new Set(items.map(item => item.name || item.category_name))];
              scrapDescription = categories.length > 0
                ? categories.join(', ')
                : 'Mixed Recyclables';
              
              // Recalculate price using vendor's custom prices if available
              if (vendorPriceMap.size > 0) {
                let totalRecalculatedPrice = 0;
                items.forEach(item => {
                  const materialId = item.material_id || item.subcategory_id;
                  const weight = parseFloat(item.expected_weight_kg || item.weight || 0);
                  let itemPricePerKg = parseFloat(item.price_per_kg || item.price || 0);
                  
                  if (materialId && vendorPriceMap.has(parseInt(materialId))) {
                    itemPricePerKg = vendorPriceMap.get(parseInt(materialId));
                  }
                  
                  totalRecalculatedPrice += itemPricePerKg * weight;
                });
                recalculatedPrice = totalRecalculatedPrice;
                console.log(`💰 [getAvailablePickupRequests] Recalculated price for order ${order.order_number || order.id}: ${order.estim_price} → ${recalculatedPrice}`);
              }
            }
          }
        } catch (e) {
          console.error('Error parsing orderdetails:', e);
        }

        // Format pickup time from customer app format: "YYYY-MM-DD 9:00 AM - 12:00 PM"
        let pickupTimeDisplay = 'Today';
        let formattedDate = null;
        let timeSlot = null;

        console.log(`🔍 [getAvailablePickupRequests] Processing order ${order.order_number || order.id}:`);
        console.log(`   preferred_pickup_time:`, order.preferred_pickup_time);

        if (order.preferred_pickup_time) {
          const timeStr = String(order.preferred_pickup_time);
          console.log(`   Parsing preferred_pickup_time: "${timeStr}"`);

          // Parse format: "YYYY-MM-DD 9:00 AM - 12:00 PM" or "YYYY-MM-DD HH:MM AM/PM"
          const dateTimeMatch = timeStr.match(/(\d{4}-\d{2}-\d{2})\s+(.+)/);

          if (dateTimeMatch) {
            const dateStr = dateTimeMatch[1]; // "YYYY-MM-DD"
            timeSlot = dateTimeMatch[2]; // "9:00 AM - 12:00 PM" or "10:00 AM"
            console.log(`   ✅ Matched date: ${dateStr}, time slot: ${timeSlot}`);

            try {
              const pickupDate = new Date(dateStr);
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              const tomorrow = new Date(today);
              tomorrow.setDate(tomorrow.getDate() + 1);
              const dateOnly = new Date(pickupDate);
              dateOnly.setHours(0, 0, 0, 0);

              const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
              const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

              if (dateOnly.getTime() === today.getTime()) {
                formattedDate = 'Today';
                pickupTimeDisplay = `Today, ${timeSlot}`;
                console.log(`   ✅ Formatted as: Today, ${timeSlot}`);
              } else if (dateOnly.getTime() === tomorrow.getTime()) {
                formattedDate = 'Tomorrow';
                pickupTimeDisplay = `Tomorrow, ${timeSlot}`;
                console.log(`   ✅ Formatted as: Tomorrow, ${timeSlot}`);
              } else {
                const dayName = days[pickupDate.getDay()];
                const day = pickupDate.getDate();
                const month = months[pickupDate.getMonth()];
                const year = pickupDate.getFullYear();
                formattedDate = `${dayName}, ${day} ${month} ${year}`;
                pickupTimeDisplay = `${formattedDate}, ${timeSlot}`;
                console.log(`   ✅ Formatted as: ${formattedDate}, ${timeSlot}`);
              }
            } catch (e) {
              console.error(`   ❌ Error parsing preferred_pickup_time date:`, e);
              // Fallback to original format
              if (timeStr.includes('AM') || timeStr.includes('PM')) {
                pickupTimeDisplay = `Today, ${timeStr}`;
                console.log(`   ⚠️  Fallback to: ${pickupTimeDisplay}`);
              }
            }
          } else if (timeStr.includes('AM') || timeStr.includes('PM')) {
            // Fallback for old format
            pickupTimeDisplay = `Today, ${timeStr}`;
            console.log(`   ⚠️  Old format detected, using: ${pickupTimeDisplay}`);
          } else {
            console.log(`   ⚠️  No date/time pattern matched for: "${timeStr}"`);
          }
        } else {
          console.log(`   ⚠️  No preferred_pickup_time found for order ${order.order_number || order.id}`);
          console.log(`   Using default: pickupTimeDisplay = "Today"`);
        }

        const result = {
          order_id: order.id,
          order_number: order.order_number,
          customer_id: order.customer_id,
          customer_name: customer_name,
          customer_phone: customer_phone,
          address: order.address || order.customerdetails,
          latitude: lat,
          longitude: lng,
          scrap_description: scrapDescription,
          estimated_weight_kg: totalWeight,
          estimated_price: recalculatedPrice, // Use recalculated price based on vendor's custom prices
          status: order.status,
          preferred_pickup_time: order.preferred_pickup_time || null,
          pickup_time_display: pickupTimeDisplay,
          preferred_pickup_date: formattedDate || null,
          preferred_pickup_time_slot: timeSlot || null,
          created_at: order.created_at,
          distance_km: order.distance_km || null,
          images: [
            order.image1,
            order.image2,
            order.image3,
            order.image4,
            order.image5,
            order.image6
          ].filter(Boolean)
        };

        console.log(`   📤 [getAvailablePickupRequests] Returning for order ${order.order_number || order.id}:`);
        console.log(`      preferred_pickup_time: ${result.preferred_pickup_time}`);
        console.log(`      preferred_pickup_date: ${result.preferred_pickup_date}`);
        console.log(`      preferred_pickup_time_slot: ${result.preferred_pickup_time_slot}`);
        console.log(`      pickup_time_display: ${result.pickup_time_display}`);

        return result;
      });

      // Temporarily disable caching to ensure real-time order updates
      // Cache will be re-enabled once we have proper cache invalidation
      // if (cacheKey) {
      //   try {
      //     await RedisCache.set(cacheKey, formattedOrders, 'short');
      //     console.log('💾 Available pickup requests cached');
      //   } catch (err) {
      //     console.error('Redis cache set error:', err);
      //   }
      // }

      return res.json({
        status: 'success',
        msg: 'Available pickup requests retrieved successfully',
        data: formattedOrders,
        hitBy: 'DynamoDB'
      });
    } catch (error) {
      console.error('Error fetching available pickup requests:', error);
      return res.status(500).json({
        status: 'error',
        msg: 'Failed to fetch available pickup requests',
        data: null
      });
    }
  }

  /**
   * POST /api/v2/orders/pickup-request/:orderId/accept
   * Accept a pickup request (R, S, SR, or D users)
   * Body: { user_id: number, user_type: 'R'|'S'|'SR'|'D' }
   */
  static async acceptPickupRequest(req, res) {
    try {
      console.log('📥 [acceptPickupRequest] Request received:', {
        orderId: req.params.orderId,
        user_id: req.body.user_id,
        user_type: req.body.user_type
      });

      const { orderId } = req.params;
      const { user_id, user_type } = req.body;

      if (!user_id || !user_type) {
        console.error('❌ [acceptPickupRequest] Missing required fields');
        return res.status(400).json({
          status: 'error',
          msg: 'Missing required fields: user_id, user_type',
          data: null
        });
      }

      // Validate user type
      const validTypes = ['R', 'S', 'SR', 'D'];
      if (!validTypes.includes(user_type)) {
        return res.status(400).json({
          status: 'error',
          msg: 'Invalid user_type. Must be R, S, SR, or D',
          data: null
        });
      }

      // Find order by order number or ID
      // Try to parse as number first (order_number), otherwise try as string (order_no) or ID
      const orderIdNum = !isNaN(orderId) ? parseInt(orderId) : null;

      let orders = [];
      if (orderIdNum) {
        orders = await Order.findByOrderNo(orderIdNum);
      } else {
        // Try finding by ID directly
        const client = require('../config/dynamodb').getDynamoDBClient();
        const { GetCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');

        // Try by ID first
        try {
          const getCommand = new GetCommand({
            TableName: 'orders',
            Key: { id: orderId }
          });
          const response = await client.send(getCommand);
          if (response.Item) {
            orders = [response.Item];
          }
        } catch (e) {
          // If not found by ID, try by order_no
          const scanCommand = new ScanCommand({
            TableName: 'orders',
            FilterExpression: 'order_no = :orderNo',
            ExpressionAttributeValues: {
              ':orderNo': orderId
            }
          });
          const response = await client.send(scanCommand);
          orders = response.Items || [];
        }
      }

      if (!orders || orders.length === 0) {
        console.error(`❌ [acceptPickupRequest] Order not found: ${orderId}`);
        return res.status(404).json({
          status: 'error',
          msg: 'Order not found',
          data: null
        });
      }

      const order = orders[0];
      console.log(`✅ [acceptPickupRequest] Order found: ${order.order_number || order.id}, status: ${order.status}, shop_id: ${order.shop_id}`);

      // Get vendor's shop_id if they have one (for R, S, SR types)
      let vendorShopId = null;
      if (user_type === 'R' || user_type === 'S' || user_type === 'SR') {
        try {
          const Shop = require('../models/Shop');
          if (user_type === 'R') {
            // For R users (B2C), find B2C shop (shop_type = 3) to ensure consistency with getActivePickup
            const allShops = await Shop.findAllByUserId(parseInt(user_id));
            const b2cShop = allShops.find(s => parseInt(s.shop_type) === 3);
            if (b2cShop && b2cShop.id) {
              vendorShopId = parseInt(b2cShop.id);
              console.log(`✅ [acceptPickupRequest] Found B2C shop ${vendorShopId} (shop_type=3) for R user ${user_id}`);
            }
          } else {
            // For S and SR users, use findByUserId
            const shop = await Shop.findByUserId(parseInt(user_id));
            if (shop && shop.id) {
              vendorShopId = parseInt(shop.id);
            }
          }
        } catch (shopErr) {
          console.warn('⚠️  Could not find shop for vendor:', shopErr.message);
        }
      }

      // Check if order was already accepted by current user (idempotent check only)
      // If already accepted by current user, return success immediately
      if (order.status === 2 || order.status === 3 || order.status === 4 || order.status === 5) {
        let alreadyAcceptedByCurrentUser = false;
        if (user_type === 'D') {
          alreadyAcceptedByCurrentUser = order.delv_id === parseInt(user_id);
        } else {
          const userIdInt = parseInt(user_id);
          const vendorShopIdInt = vendorShopId ? parseInt(vendorShopId) : null;
          const shopIdToSet = vendorShopId || userIdInt;
          const orderShopId = order.shop_id ? parseInt(order.shop_id) : null;

          alreadyAcceptedByCurrentUser =
            (vendorShopIdInt && orderShopId === vendorShopIdInt) ||
            (orderShopId === userIdInt) ||
            (orderShopId === shopIdToSet);
        }

        if (alreadyAcceptedByCurrentUser) {
          console.log(`✅ [acceptPickupRequest] Order ${order.order_number || order.id} was already accepted by current user (idempotent operation - pre-check)`);
          return res.json({
            status: 'success',
            msg: 'Pickup request already accepted by you',
            data: {
              order_id: order.id,
              order_number: order.order_number || order.order_no,
              status: order.status
            }
          });
        }
      }

      // Determine if order is unassigned or auto-assigned to this vendor for condition expression
      const isUnassigned = order.status === 1 && (!order.shop_id || order.shop_id === null);
      const isAutoAssignedToVendor = vendorShopId && order.status === 1 && parseInt(order.shop_id) === vendorShopId;

      // Update order with shop_id/vendor_id and change status to 2 (Accepted)
      // Use ConditionExpression to ensure atomicity - only update if order is still available
      const UpdateCommand = require('@aws-sdk/lib-dynamodb').UpdateCommand;
      const client = require('../config/dynamodb').getDynamoDBClient();

      // For D type (delivery), set delv_id
      // For R, S, SR types, set shop_id (use vendorShopId if available, otherwise user_id)
      // If order already has shop_id and it matches vendorShopId, keep it; otherwise update it
      // Ensure shopIdToSet is always a number (GSI requires number type)
      const shopIdToSet = vendorShopId ? (typeof vendorShopId === 'number' ? vendorShopId : parseInt(vendorShopId)) : (typeof user_id === 'number' ? user_id : parseInt(user_id));

      // Get vendor's custom prices and update orderdetails with vendor prices
      let updatedOrderdetails = order.orderdetails;
      let recalculatedEstimPrice = order.estim_price; // Initialize with original estim_price
      if (user_type !== 'D' && order.orderdetails) {
        try {
          // Get vendor's User record to access operating_subcategories with custom prices
          // Use findById which directly queries DynamoDB (no cache) to ensure we get the latest prices
          const vendorUser = await User.findById(parseInt(user_id));
          
          if (!vendorUser) {
            console.warn(`⚠️  [acceptPickupRequest] Vendor user ${user_id} not found - using original order prices`);
          } else if (!vendorUser.operating_subcategories || !Array.isArray(vendorUser.operating_subcategories)) {
            console.warn(`⚠️  [acceptPickupRequest] Vendor ${user_id} has no operating_subcategories - using original order prices`);
          } else {
            // Create a map of vendor's custom prices by subcategory_id
            const vendorPriceMap = new Map();
            vendorUser.operating_subcategories.forEach(userSubcat => {
              const subcatId = userSubcat.subcategory_id || userSubcat.subcategoryId;
              const customPrice = userSubcat.custom_price || '';
              // Only add to map if custom_price exists and is not empty
              if (subcatId && customPrice && customPrice.trim() !== '') {
                const priceValue = parseFloat(customPrice);
                if (!isNaN(priceValue)) {
                  vendorPriceMap.set(parseInt(subcatId), priceValue);
                  console.log(`💰 [acceptPickupRequest] Found custom price for subcategory ${subcatId}: ₹${priceValue}/kg`);
                } else {
                  console.warn(`⚠️  [acceptPickupRequest] Invalid custom_price for subcategory ${subcatId}: "${customPrice}"`);
                }
              }
            });

            console.log(`💰 [acceptPickupRequest] Vendor ${user_id} has ${vendorPriceMap.size} subcategories with custom prices`);

            // Parse orderdetails
            let orderdetailsParsed = order.orderdetails;
            if (typeof orderdetailsParsed === 'string') {
              try {
                orderdetailsParsed = JSON.parse(orderdetailsParsed);
              } catch (parseErr) {
                console.error('❌ [acceptPickupRequest] Error parsing orderdetails:', parseErr);
                orderdetailsParsed = order.orderdetails;
              }
            }

            // Update prices in orderdetails if vendor has custom prices
            if (Array.isArray(orderdetailsParsed) && vendorPriceMap.size > 0) {
              let pricesUpdated = 0;
              let itemsWithVendorPrice = 0;
              let totalPrice = 0;
              orderdetailsParsed = orderdetailsParsed.map(item => {
                // Match by material_id (subcategory_id) or subcategory_id
                const materialId = item.material_id || item.subcategory_id;
                const weight = parseFloat(item.expected_weight_kg || item.weight || 0);
                let itemPricePerKg = parseFloat(item.price_per_kg || item.price || 0);
                
                if (materialId && vendorPriceMap.has(parseInt(materialId))) {
                  const vendorPrice = vendorPriceMap.get(parseInt(materialId));
                  const oldPrice = itemPricePerKg;
                  item.price_per_kg = vendorPrice;
                  itemPricePerKg = vendorPrice; // Update for calculation
                  // Also update price field if it exists
                  if (item.price !== undefined) {
                    item.price = vendorPrice;
                  }
                  itemsWithVendorPrice++;
                  // Only count as "updated" if price actually changed
                  if (Math.abs(vendorPrice - oldPrice) >= 0.01) {
                    pricesUpdated++;
                    console.log(`💰 [acceptPickupRequest] Updated price for subcategory ${materialId}: ${oldPrice} → ${vendorPrice}`);
                  } else {
                    console.log(`💰 [acceptPickupRequest] Applied vendor price for subcategory ${materialId}: ₹${vendorPrice}/kg (matches original price)`);
                  }
                }
                
                // Calculate total price for this item (price_per_kg * weight)
                totalPrice += itemPricePerKg * weight;
                
                return item;
              });

              // Always update orderdetails and estim_price if vendor has custom prices for any items
              // This ensures orderdetails explicitly reflects vendor prices at acceptance time
              if (itemsWithVendorPrice > 0) {
                updatedOrderdetails = JSON.stringify(orderdetailsParsed);
                recalculatedEstimPrice = totalPrice;
                console.log(`✅ [acceptPickupRequest] Updated ${itemsWithVendorPrice} item(s) in orderdetails with vendor custom prices`);
                if (pricesUpdated > 0) {
                  console.log(`💰 [acceptPickupRequest] Recalculated estim_price: ${order.estim_price} → ${recalculatedEstimPrice} (${pricesUpdated} price change(s))`);
                } else {
                  console.log(`💰 [acceptPickupRequest] Recalculated estim_price: ${order.estim_price} → ${recalculatedEstimPrice} (prices matched, but orderdetails updated with vendor prices)`);
                }
              }
            }
          }
        } catch (priceUpdateError) {
          // Non-blocking error - log but continue with order acceptance
          console.error('⚠️  [acceptPickupRequest] Error updating orderdetails with vendor prices:', priceUpdateError);
          console.error('   Order acceptance will continue with original prices');
        }
      }

      // Build update expression - include orderdetails and estim_price if prices were updated
      // Note: If order was created without shop_id (omitted), SET will add it
      // If order has shop_id as null, we'll SET it (DynamoDB handles this)
      const hasPriceUpdates = updatedOrderdetails !== order.orderdetails || recalculatedEstimPrice !== order.estim_price;
      const updateExpression = user_type === 'D'
        ? 'SET delv_id = :userId, delv_boy_id = :userId, #status = :status, accepted_at = :acceptedAt, updated_at = :updatedAt'
        : hasPriceUpdates
          ? 'SET shop_id = :shopId, #status = :status, accepted_at = :acceptedAt, updated_at = :updatedAt, orderdetails = :orderdetails, estim_price = :estimPrice'
          : 'SET shop_id = :shopId, #status = :status, accepted_at = :acceptedAt, updated_at = :updatedAt';

      // Build condition expression to ensure order is still available
      // For unassigned orders: status must be 1 AND shop_id must be null
      // For auto-assigned orders: status must be 1 AND shop_id must match vendor's shop_id
      let conditionExpression;
      if (user_type === 'D') {
        // For delivery, check status is 1 and delv_id is null
        conditionExpression = '#status = :currentStatus AND (attribute_not_exists(delv_id) OR delv_id = :nullShopId)';
      } else if (isAutoAssignedToVendor) {
        // For auto-assigned orders, check status is 1 and shop_id matches
        conditionExpression = '#status = :currentStatus AND shop_id = :currentShopId';
      } else {
        // For unassigned orders, check status is 1 and shop_id is null
        conditionExpression = '#status = :currentStatus AND (attribute_not_exists(shop_id) OR shop_id = :nullShopId)';
      }

      // Build expression attribute values - only include what's actually used in expressions
      const expressionAttributeValues = user_type === 'D'
        ? {
          ':userId': parseInt(user_id),
          ':status': 2, // 2 = Accepted
          ':acceptedAt': new Date().toISOString(),
          ':updatedAt': new Date().toISOString(),
          ':currentStatus': 1, // Only update if status is still 1 (Scheduled)
          ':nullShopId': null
        }
        : isAutoAssignedToVendor
          ? hasPriceUpdates
            ? {
              ':shopId': shopIdToSet, // Ensure this is a number for GSI
              ':status': 2, // 2 = Accepted
              ':acceptedAt': new Date().toISOString(),
              ':updatedAt': new Date().toISOString(),
              ':orderdetails': updatedOrderdetails, // Updated orderdetails with vendor prices
              ':estimPrice': recalculatedEstimPrice, // Recalculated estim_price based on vendor prices
              ':currentStatus': 1, // Only update if status is still 1 (Scheduled)
              ':currentShopId': shopIdToSet // Used in condition expression for auto-assigned orders
            }
            : {
              ':shopId': shopIdToSet, // Ensure this is a number for GSI
              ':status': 2, // 2 = Accepted
              ':acceptedAt': new Date().toISOString(),
              ':updatedAt': new Date().toISOString(),
              ':currentStatus': 1, // Only update if status is still 1 (Scheduled)
              ':currentShopId': shopIdToSet // Used in condition expression for auto-assigned orders
            }
          : hasPriceUpdates
            ? {
              ':shopId': shopIdToSet, // Ensure this is a number for GSI
              ':status': 2, // 2 = Accepted
              ':acceptedAt': new Date().toISOString(),
              ':updatedAt': new Date().toISOString(),
              ':orderdetails': updatedOrderdetails, // Updated orderdetails with vendor prices
              ':estimPrice': recalculatedEstimPrice, // Recalculated estim_price based on vendor prices
              ':currentStatus': 1, // Only update if status is still 1 (Scheduled)
              ':nullShopId': null // Used in condition expression for unassigned orders
            }
            : {
              ':shopId': shopIdToSet, // Ensure this is a number for GSI
              ':status': 2, // 2 = Accepted
              ':acceptedAt': new Date().toISOString(),
              ':updatedAt': new Date().toISOString(),
              ':currentStatus': 1, // Only update if status is still 1 (Scheduled)
              ':nullShopId': null // Used in condition expression for unassigned orders
            };

      // Before attempting update, check if order was already accepted by current user (idempotent check)
      // This prevents unnecessary ConditionalCheckFailedException and ensures correct response
      const currentOrderCheck = await client.send(new (require('@aws-sdk/lib-dynamodb').GetCommand)({
        TableName: 'orders',
        Key: { id: order.id }
      }));

      if (currentOrderCheck.Item) {
        const checkOrder = currentOrderCheck.Item;
        const checkStatus = checkOrder.status;
        const checkShopId = checkOrder.shop_id ? parseInt(checkOrder.shop_id) : null;
        const checkDelvId = checkOrder.delv_id ? parseInt(checkOrder.delv_id) : null;

        // Check if order is already accepted by current user (status 2-5)
        if (checkStatus === 2 || checkStatus === 3 || checkStatus === 4 || checkStatus === 5) {
          let alreadyAcceptedByCurrentUser = false;
          if (user_type === 'D') {
            alreadyAcceptedByCurrentUser = checkDelvId === parseInt(user_id);
          } else {
            const userIdInt = parseInt(user_id);
            const shopIdToSetInt = typeof shopIdToSet === 'number' ? shopIdToSet : parseInt(shopIdToSet);
            const vendorShopIdInt = vendorShopId ? parseInt(vendorShopId) : null;

            // Primary check: compare with vendorShopId if it exists
            if (vendorShopIdInt && checkShopId === vendorShopIdInt) {
              alreadyAcceptedByCurrentUser = true;
            }
            // Secondary check: compare with user_id (for vendors without shop)
            else if (checkShopId === userIdInt) {
              alreadyAcceptedByCurrentUser = true;
            }
            // Fallback check: compare with shopIdToSet
            else if (checkShopId === shopIdToSetInt) {
              alreadyAcceptedByCurrentUser = true;
            }

            console.log(`🔍 [acceptPickupRequest] Pre-check - Order acceptance status:`);
            console.log(`   checkShopId: ${checkShopId}, vendorShopId: ${vendorShopIdInt}, user_id: ${userIdInt}, shopIdToSet: ${shopIdToSetInt}`);
            console.log(`   alreadyAcceptedByCurrentUser: ${alreadyAcceptedByCurrentUser}`);
          }

          if (alreadyAcceptedByCurrentUser) {
            console.log(`✅ [acceptPickupRequest] Order ${order.order_number || order.id} was already accepted by current user (idempotent operation - pre-check)`);
            return res.json({
              status: 'success',
              msg: 'Pickup request already accepted by you',
              data: {
                order_id: checkOrder.id,
                order_number: checkOrder.order_number || checkOrder.order_no,
                status: checkStatus
              }
            });
          }
        }
      }

      const command = new UpdateCommand({
        TableName: 'orders',
        Key: { id: order.id },
        UpdateExpression: updateExpression,
        ConditionExpression: conditionExpression, // Atomic check - only update if condition is met
        ExpressionAttributeNames: {
          '#status': 'status'
        },
        ExpressionAttributeValues: expressionAttributeValues
      });

      let updateSucceeded = false; // Flag to track if update succeeded (including PutItem workaround)
      
      try {
        console.log(`🔄 [acceptPickupRequest] Attempting to update order ${order.order_number || order.id}...`);
        console.log(`   Current order status: ${order.status}, shop_id: ${order.shop_id} (type: ${typeof order.shop_id})`);
        console.log(`   Updating to status: 2 (Accepted), shop_id: ${shopIdToSet} (type: ${typeof shopIdToSet})`);
        console.log(`   shopIdToSet value: ${shopIdToSet}, isNumber: ${typeof shopIdToSet === 'number'}`);
        
        // Ensure shopIdToSet is a number for GSI compatibility
        if (typeof shopIdToSet !== 'number' || isNaN(shopIdToSet)) {
          throw new Error(`Invalid shop_id type: ${typeof shopIdToSet}, value: ${shopIdToSet}. Must be a number for GSI compatibility.`);
        }
        
        await client.send(command);
        console.log(`✅ [acceptPickupRequest] Order ${order.order_number || order.id} accepted successfully by user_id ${user_id}`);
        console.log(`   ✅ Order status changed from 1 to 2 (Accepted)`);
        console.log(`   ✅ Order shop_id set to: ${shopIdToSet}`);
        updateSucceeded = true;
      } catch (updateError) {
        console.error(`❌ [acceptPickupRequest] Error updating order:`, updateError);
        console.error('   Error name:', updateError.name);
        console.error('   Error message:', updateError.message);
        console.error('   shopIdToSet:', shopIdToSet, 'type:', typeof shopIdToSet);
        console.error('   order.shop_id:', order.shop_id, 'type:', typeof order.shop_id);
        
        // Handle "Schema violation against backfilling index" error
        // This can happen when GSI is backfilling and we try to SET shop_id on an order that doesn't have it
        // Workaround: Use PutItem to replace the entire item (works during GSI backfill)
        if (updateError.message && updateError.message.includes('Schema violation against backfilling index')) {
          console.error('   ⚠️  GSI backfilling issue detected. Order may have been created without shop_id.');
          console.error('   💡 Attempting PutItem workaround (replaces entire item, works during GSI backfill)...');
          
          try {
            const { PutCommand } = require('@aws-sdk/lib-dynamodb');
            
            // Build the updated order object with all fields preserved
            // IMPORTANT: Only include GSI key attributes if they have valid values (not null/undefined)
            // This prevents "Type mismatch" errors during GSI backfill
            const updatedOrder = {
              ...order,
              shop_id: shopIdToSet,
              status: 2, // Accepted
              accepted_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            };
            
            // Remove GSI key attributes if they are null/undefined to prevent type mismatch errors
            // Only include them if they have valid numeric values
            if (updatedOrder.delv_id === null || updatedOrder.delv_id === undefined) {
              delete updatedOrder.delv_id;
            }
            if (updatedOrder.delv_boy_id === null || updatedOrder.delv_boy_id === undefined) {
              delete updatedOrder.delv_boy_id;
            }
            // shop_id is already set to shopIdToSet (a valid number), so we keep it
            
            // Update orderdetails and estim_price if prices were updated
            if (hasPriceUpdates) {
              updatedOrder.orderdetails = updatedOrderdetails;
              updatedOrder.estim_price = recalculatedEstimPrice;
            }
            
            // Ensure all required fields are present
            if (!updatedOrder.created_at) {
              updatedOrder.created_at = order.created_at || new Date().toISOString();
            }
            
            // Use PutItem with condition to ensure order status is still 1 (atomic check)
            const putCommand = new PutCommand({
              TableName: 'orders',
              Item: updatedOrder,
              ConditionExpression: '#status = :currentStatus',
              ExpressionAttributeNames: { '#status': 'status' },
              ExpressionAttributeValues: { ':currentStatus': 1 }
            });
            
            await client.send(putCommand);
            console.log(`✅ [acceptPickupRequest] Order ${order.order_number || order.id} accepted successfully (using PutItem workaround for GSI backfill)`);
            console.log(`   ✅ Order status changed from 1 to 2 (Accepted)`);
            console.log(`   ✅ Order shop_id set to: ${shopIdToSet}`);
            
            // Mark update as succeeded so we can continue with success flow
            updateSucceeded = true;
          } catch (putError) {
            console.error('   ❌ PutItem workaround also failed:', putError.message);
            console.error('   Error name:', putError.name);
            
            // If PutItem fails due to condition check, order might have been accepted
            if (putError.name === 'ConditionalCheckFailedException') {
              console.log(`⚠️  PutItem condition check failed - order may have been accepted. Checking current state...`);
              // Fall through to the ConditionalCheckFailedException handler below
              updateError = putError; // Replace error so it's handled by the condition check handler
            } else {
              // Other PutItem error - return error response
              return res.status(500).json({
                status: 'error',
                msg: 'Unable to accept order at this time due to a temporary system issue. Please try again in a few moments.',
                data: {
                  order_id: order.id,
                  order_number: order.order_number || order.order_no,
                  error_type: 'gsi_backfilling_putitem_failed',
                  retry_suggested: true
                }
              });
            }
          }
          
          // If PutItem succeeded, skip the rest of the error handling and continue
          // We'll break out of the catch block by not returning/throwing
          // But we need to check if we should continue or return
          // Actually, if PutItem succeeded, we should continue to the success flow below
          // Let me check the code structure...
        }
        
        // Skip error handling if update succeeded via PutItem workaround
        if (updateSucceeded) {
          // Update succeeded via PutItem workaround, continue with success flow
          // Break out of catch block - the code after the catch will handle success
        }
        // Check if error is due to condition not being met (order already accepted)
        else if (updateError.name === 'ConditionalCheckFailedException' || 
            (updateError.message && updateError.message.includes('backfilling index') && updateError.message.includes('PutItem'))) {
          console.log(`⚠️  Conditional check failed - checking if order was accepted by current user...`);

          // Re-fetch the order to get current status and see who accepted it
          const { GetCommand } = require('@aws-sdk/lib-dynamodb');
          const getCommand = new GetCommand({
            TableName: 'orders',
            Key: { id: order.id }
          });
          const currentOrderResponse = await client.send(getCommand);
          const currentOrder = currentOrderResponse.Item;

          if (currentOrder) {
            const currentStatus = currentOrder.status;
            const currentShopId = currentOrder.shop_id ? parseInt(currentOrder.shop_id) : null;
            const currentDelvId = currentOrder.delv_id ? parseInt(currentOrder.delv_id) : null;

            console.log(`🔍 [acceptPickupRequest] Checking order acceptance status:`);
            console.log(`   Current order status: ${currentStatus}`);
            console.log(`   Current shop_id: ${currentShopId} (type: ${typeof currentShopId})`);
            console.log(`   Current delv_id: ${currentDelvId}`);
            console.log(`   Current user_id: ${user_id} (type: ${typeof user_id})`);
            console.log(`   shopIdToSet: ${shopIdToSet} (type: ${typeof shopIdToSet})`);
            console.log(`   vendorShopId: ${vendorShopId} (type: ${typeof vendorShopId})`);

            // Check if order was accepted by the current user (idempotent operation)
            let acceptedByCurrentUser = false;
            if (user_type === 'D') {
              // For delivery, check if delv_id matches current user_id
              acceptedByCurrentUser = currentDelvId === parseInt(user_id);
              console.log(`   Delivery check: currentDelvId ${currentDelvId} === user_id ${parseInt(user_id)} = ${acceptedByCurrentUser}`);
            } else {
              // For vendors, check if shop_id matches any of these:
              // 1. The vendorShopId (if vendor has a shop)
              // 2. The user_id (if vendor doesn't have a shop, shop_id is set to user_id)
              // Also check shopIdToSet as a fallback
              const userIdInt = parseInt(user_id);
              const shopIdToSetInt = typeof shopIdToSet === 'number' ? shopIdToSet : parseInt(shopIdToSet);
              const vendorShopIdInt = vendorShopId ? parseInt(vendorShopId) : null;

              // Primary check: compare with vendorShopId if it exists
              if (vendorShopIdInt && currentShopId === vendorShopIdInt) {
                acceptedByCurrentUser = true;
              }
              // Secondary check: compare with user_id (for vendors without shop)
              else if (currentShopId === userIdInt) {
                acceptedByCurrentUser = true;
              }
              // Fallback check: compare with shopIdToSet
              else if (currentShopId === shopIdToSetInt) {
                acceptedByCurrentUser = true;
              }

              console.log(`   Vendor check:`);
              console.log(`     currentShopId: ${currentShopId} (type: ${typeof currentShopId})`);
              console.log(`     vendorShopId: ${vendorShopIdInt} (type: ${typeof vendorShopIdInt})`);
              console.log(`     user_id: ${userIdInt} (type: ${typeof userIdInt})`);
              console.log(`     shopIdToSet: ${shopIdToSetInt} (type: ${typeof shopIdToSetInt})`);
              console.log(`     Check 1 - vendorShopId match: ${vendorShopIdInt ? currentShopId === vendorShopIdInt : false}`);
              console.log(`     Check 2 - user_id match: ${currentShopId === userIdInt}`);
              console.log(`     Check 3 - shopIdToSet match: ${currentShopId === shopIdToSetInt}`);
              console.log(`     Final result: acceptedByCurrentUser = ${acceptedByCurrentUser}`);
            }

            if (acceptedByCurrentUser && (currentStatus === 2 || currentStatus === 3 || currentStatus === 4 || currentStatus === 5)) {
              // Order was already accepted by the current user - treat as success (idempotent)
              console.log(`✅ [acceptPickupRequest] Order ${order.order_number || order.id} was already accepted by current user (idempotent operation)`);
              return res.json({
                status: 'success',
                msg: 'Pickup request already accepted by you',
                data: {
                  order_id: currentOrder.id,
                  order_number: currentOrder.order_number || currentOrder.order_no,
                  status: currentStatus // Return current status
                }
              });
            }

            // Order status changed - handle gracefully
            if (currentStatus === 2 || currentStatus === 3 || currentStatus === 4 || currentStatus === 5) {
              // Order is already accepted/in progress
              // If accepted by current user, return success (idempotent)
              if (acceptedByCurrentUser) {
                console.log(`✅ [acceptPickupRequest] Order ${order.order_number || order.id} was already accepted by current user`);
                return res.json({
                  status: 'success',
                  msg: 'Pickup request already accepted by you',
                  data: {
                    order_id: currentOrder.id,
                    order_number: currentOrder.order_number || currentOrder.order_no,
                    status: currentStatus
                  }
                });
              }
              // Otherwise, just return a generic error (don't specify "another vendor")
              console.warn(`⚠️  Order ${order.order_number || order.id} is already accepted/in progress (status: ${currentStatus})`);
              return res.status(409).json({
                status: 'error',
                msg: 'Order is no longer available for pickup',
                data: {
                  order_number: currentOrder.order_number || currentOrder.order_no,
                  current_status: currentStatus
                }
              });
            } else if (currentStatus !== 1) {
              // Order status changed to something unexpected
              console.warn(`⚠️  Order ${order.order_number || order.id} is no longer available (status: ${currentStatus})`);
              return res.status(409).json({
                status: 'error',
                msg: 'Order is no longer available for pickup',
                data: {
                  order_number: currentOrder.order_number || currentOrder.order_no,
                  current_status: currentStatus
                }
              });
            } else {
              // Status is still 1, but conditional check failed - this shouldn't happen often
              // Could be a race condition or the order condition doesn't match anymore
              console.warn(`⚠️  Conditional check failed but order status is still 1 - possible race condition`);
              console.warn(`   Order shop_id: ${currentShopId}, Expected: ${shopIdToSet}, vendorShopId: ${vendorShopId}, user_id: ${user_id}`);
              return res.status(409).json({
                status: 'error',
                msg: 'Order state has changed. Please refresh and try again.',
                data: {
                  order_number: currentOrder.order_number || currentOrder.order_no,
                  current_status: currentStatus
                }
              });
            }
          }

          // If we can't determine the current state, return generic error
          console.warn(`⚠️  Conditional check failed but couldn't determine current order state`);
          return res.status(409).json({
            status: 'error',
            msg: 'Order state has changed. Please refresh and try again.',
            data: null
          });
        } else {
          // Some other error occurred
          console.error('❌ Error updating order:', updateError);
          throw updateError;
        }
      }

      // If update succeeded (either via UpdateCommand or PutItem workaround), continue with success flow
      // Invalidate v2 API caches FIRST to ensure fresh data is available when vendors refetch
      try {
        // Invalidate available pickup requests (order is no longer available - status changed to 2)
        await RedisCache.invalidateV2ApiCache('available_pickup_requests', null, {
          user_id: 'all',
          user_type: 'all'
        });
        console.log(`🗑️  Invalidated available_pickup_requests cache (order status changed to 2)`);
      } catch (cacheErr) {
        console.error('⚠️  Cache invalidation error (non-blocking):', cacheErr);
      }

      // Send FCM notification to other vendors (excluding the accepting vendor) to refresh their dashboard
      try {
        console.log(`🔔 [acceptPickupRequest] Preparing to send FCM notifications to other vendors...`);
        console.log(`   Order ID: ${order.id}`);
        console.log(`   Order notified_vendor_ids field exists: ${!!order.notified_vendor_ids}`);
        console.log(`   Order notified_vendor_ids value: ${order.notified_vendor_ids}`);
        console.log(`   Order notified_vendor_ids type: ${typeof order.notified_vendor_ids}`);

        // Get list of vendors who were notified about this order
        let notifiedVendorIds = [];
        if (order.notified_vendor_ids) {
          try {
            notifiedVendorIds = typeof order.notified_vendor_ids === 'string'
              ? JSON.parse(order.notified_vendor_ids)
              : order.notified_vendor_ids;

            if (!Array.isArray(notifiedVendorIds)) {
              console.warn(`⚠️  notified_vendor_ids is not an array, it's:`, typeof notifiedVendorIds, notifiedVendorIds);
              notifiedVendorIds = [];
            } else {
              console.log(`✅ Parsed notified_vendor_ids:`, notifiedVendorIds);
            }
          } catch (parseErr) {
            console.error('❌ Could not parse notified_vendor_ids:', parseErr.message);
            console.error('   Raw value:', order.notified_vendor_ids);
            notifiedVendorIds = [];
          }
        } else {
          console.warn(`⚠️  Order ${order.id} has no notified_vendor_ids field - no vendors were notified about this order`);
        }

        console.log(`📋 Total notified vendors: ${notifiedVendorIds.length}`);
        console.log(`📋 Notified vendor IDs:`, notifiedVendorIds);
        console.log(`📋 Accepting vendor user_id: ${user_id}`);

        // Filter out the accepting vendor from the list
        const otherVendorIds = notifiedVendorIds
          .map(id => parseInt(id))
          .filter(id => !isNaN(id) && id !== parseInt(user_id));

        console.log(`📋 Other vendor IDs (excluding accepting vendor):`, otherVendorIds);

        if (otherVendorIds.length > 0) {
          console.log(`📤 Sending refresh notifications to ${otherVendorIds.length} other vendor(s) (excluding accepting vendor ${user_id})...`);

          const { sendVendorNotification } = require('../utils/fcmNotification');
          const User = require('../models/User');

          // Send notifications to all other vendors in parallel for instant delivery
          const notificationPromises = otherVendorIds.map(async (vendorId) => {
            try {
              console.log(`   🔍 [Vendor ${vendorId}] Looking up vendor user...`);
              const vendorUser = await User.findById(vendorId);
              if (!vendorUser) {
                console.warn(`   ❌ [Vendor ${vendorId}] Vendor not found in database`);
                return { success: false, vendorId, reason: 'vendor_not_found' };
              }

              console.log(`   ✅ [Vendor ${vendorId}] Found vendor: ${vendorUser.name || 'No name'}`);
              console.log(`      - app_type: ${vendorUser.app_type}`);
              console.log(`      - has_fcm_token: ${!!vendorUser.fcm_token}`);

              if (!vendorUser.fcm_token) {
                console.warn(`   ⚠️  [Vendor ${vendorId}] No FCM token registered`);
                return { success: false, vendorId, reason: 'no_fcm_token' };
              }

              // Allow both vendor_app and partner_app users to receive notifications
              if (vendorUser.app_type !== 'vendor_app' && vendorUser.app_type !== 'partner_app') {
                console.warn(`   ⚠️  [Vendor ${vendorId}] Not a vendor/partner app user (app_type: ${vendorUser.app_type})`);
                return { success: false, vendorId, reason: 'not_vendor_app' };
              }

              const orderNumber = order.order_number || order.order_no || order.id;
              console.log(`   📤 [Vendor ${vendorId}] Sending FCM notification for order #${orderNumber}...`);

              await sendVendorNotification(
                vendorUser.fcm_token,
                'Order Accepted',
                `Order #${orderNumber} accepted from other vendor`,
                {
                  type: 'order_list_updated',
                  order_id: String(order.id),
                  order_number: String(orderNumber),
                  screen: 'Dashboard',
                  action: 'refresh_orders',
                  message: 'Order accepted from other vendor'
                }
              );

              console.log(`   ✅ [Vendor ${vendorId}] FCM notification sent successfully - Order #${orderNumber} accepted from other vendor`);
              return { success: true, vendorId };
            } catch (vendorNotifErr) {
              console.error(`❌ Error sending notification to vendor ${vendorId}:`, vendorNotifErr);
              return { success: false, vendorId, error: vendorNotifErr.message };
            }
          });

          // Wait for all notifications to be sent and log results
          const notificationResults = await Promise.all(notificationPromises);
          const successCount = notificationResults.filter(r => r.success).length;
          const failedCount = notificationResults.filter(r => !r.success).length;
          console.log(`📊 [acceptPickupRequest] Notification summary: ${successCount}/${otherVendorIds.length} notifications sent successfully`);
          if (failedCount > 0) {
            console.warn(`⚠️  [acceptPickupRequest] ${failedCount} notification(s) failed:`);
            notificationResults.filter(r => !r.success).forEach(r => {
              console.warn(`   - Vendor ${r.vendorId}: ${r.reason || r.error || 'unknown error'}`);
            });
          }
          if (successCount > 0) {
            console.log(`✅ [acceptPickupRequest] Successfully sent FCM notifications to ${successCount} vendor(s)`);
          }
        } else {
          console.log(`ℹ️  No other vendors to notify`);
          console.log(`   - Total notified vendors: ${notifiedVendorIds.length}`);
          console.log(`   - Accepting vendor: ${user_id}`);
          if (notifiedVendorIds.length === 0) {
            console.warn(`   ⚠️  Order has no notified_vendor_ids - vendors may not have been notified when order was created`);
          } else if (notifiedVendorIds.length === 1 && parseInt(notifiedVendorIds[0]) === parseInt(user_id)) {
            console.log(`   ℹ️  Only the accepting vendor was notified about this order`);
          }
        }
      } catch (otherVendorsNotifErr) {
        console.error('❌ Error notifying other vendors:', otherVendorsNotifErr);
        // Don't fail the request if notification fails
      }

      // Send FCM notification to customer when pickup request is accepted
      // This is critical - customer must be notified when their pickup request is accepted
      console.log(`📢 [acceptPickupRequest] Starting customer notification process for order ${order.id}, customer_id: ${order.customer_id}`);

      try {
        // Get vendor/partner name
        let partnerName = 'Partner';
        if (user_type === 'R' || user_type === 'S' || user_type === 'SR') {
          const Shop = require('../models/Shop');
          const shop = await Shop.findByUserId(parseInt(user_id));
          console.log(`🔍 [acceptPickupRequest] Getting partner name for user_id=${user_id}, user_type=${user_type}, shop=${shop ? `found (id: ${shop.id})` : 'not found'}`);

          if (shop) {
            // For B2B users (S, SR with company_name), prioritize company_name
            if ((user_type === 'S' || user_type === 'SR') && shop.company_name && shop.company_name.trim() !== '') {
              partnerName = shop.company_name;
              console.log(`✅ Using company_name: ${partnerName}`);
            }
            // For B2C users (R) or when company_name is not available, check shopname and ownername
            // Skip placeholder shopnames (starting with "User_" or "user_")
            else if (shop.shopname && shop.shopname.trim() !== '' && !shop.shopname.startsWith('User_') && !shop.shopname.startsWith('user_')) {
              partnerName = shop.shopname;
              console.log(`✅ Using shopname: ${partnerName}`);
            } else if (shop.ownername && shop.ownername.trim() !== '') {
              partnerName = shop.ownername;
              console.log(`✅ Using ownername: ${partnerName}`);
            } else {
              // Fallback to user name only if it's not a placeholder (doesn't start with 'user_')
              // IMPORTANT: Ensure we get the vendor_app user, not customer_app user
              const vendorUser = await User.findById(parseInt(user_id));
              console.log(`🔍 [acceptPickupRequest] Fallback to user name - vendorUser: ${vendorUser ? `found (id: ${vendorUser.id}, app_type: ${vendorUser.app_type}, name: ${vendorUser.name})` : 'not found'}`);

              if (vendorUser) {
                // CRITICAL: Only use vendor_app users, not customer_app users
                if (vendorUser.app_type === 'vendor_app' && vendorUser.name && vendorUser.name.trim() !== '' && !vendorUser.name.startsWith('user_') && !vendorUser.name.startsWith('User_')) {
                  partnerName = vendorUser.name;
                  console.log(`✅ Using vendor_app user name: ${partnerName}`);
                } else if (!vendorUser.app_type && vendorUser.user_type !== 'C' && vendorUser.name && vendorUser.name.trim() !== '' && !vendorUser.name.startsWith('user_') && !vendorUser.name.startsWith('User_')) {
                  // Fallback for v1 users (no app_type) - ensure it's not a customer type
                  partnerName = vendorUser.name;
                  console.log(`✅ Using v1 vendor user name: ${partnerName}`);
                } else {
                  console.warn(`⚠️  Skipping user name - app_type: ${vendorUser.app_type}, user_type: ${vendorUser.user_type}, name: ${vendorUser.name}`);
                }
              }
            }
          } else {
            // No shop found, try to get user name (but not placeholder names)
            // IMPORTANT: Ensure we get the vendor_app user, not customer_app user
            const vendorUser = await User.findById(parseInt(user_id));
            console.log(`🔍 [acceptPickupRequest] No shop found - checking user: ${vendorUser ? `found (id: ${vendorUser.id}, app_type: ${vendorUser.app_type}, name: ${vendorUser.name})` : 'not found'}`);

            if (vendorUser) {
              // CRITICAL: Only use vendor_app users, not customer_app users
              if (vendorUser.app_type === 'vendor_app' && vendorUser.name && vendorUser.name.trim() !== '' && !vendorUser.name.startsWith('user_') && !vendorUser.name.startsWith('User_')) {
                partnerName = vendorUser.name;
                console.log(`✅ Using vendor_app user name: ${partnerName}`);
              } else if (!vendorUser.app_type && vendorUser.user_type !== 'C' && vendorUser.name && vendorUser.name.trim() !== '' && !vendorUser.name.startsWith('user_') && !vendorUser.name.startsWith('User_')) {
                // Fallback for v1 users (no app_type) - ensure it's not a customer type
                partnerName = vendorUser.name;
                console.log(`✅ Using v1 vendor user name: ${partnerName}`);
              } else {
                console.warn(`⚠️  Skipping user name - app_type: ${vendorUser.app_type}, user_type: ${vendorUser.user_type}, name: ${vendorUser.name}`);
              }
            }
          }
        } else if (user_type === 'D') {
          const DeliveryBoy = require('../models/DeliveryBoy');
          const deliveryBoy = await DeliveryBoy.findByUserId(parseInt(user_id));
          if (deliveryBoy && deliveryBoy.name) {
            partnerName = deliveryBoy.name;
          } else {
            const vendorUser = await User.findById(parseInt(user_id));
            if (vendorUser && vendorUser.name) {
              partnerName = vendorUser.name;
            }
          }
        }

        console.log(`📢 [acceptPickupRequest] Final partner name for notification: ${partnerName}`);

        // Get customer FCM token
        // IMPORTANT: Must find customer_app user, not vendor_app user
        let customerFcmToken = null;
        if (order.customer_id) {
          let customerUser = null;
          try {
            const Customer = require('../models/Customer');
            let customer = await Customer.findById(order.customer_id);
            if (!customer) {
              customer = await Customer.findByUserId(order.customer_id);
            }

            if (customer && customer.user_id) {
              // Found customer record, get the user
              customerUser = await User.findById(customer.user_id);
              console.log(`🔍 [acceptPickupRequest] Found customer record - user_id: ${customer.user_id}, customerUser: ${customerUser ? `found (id: ${customerUser.id}, app_type: ${customerUser.app_type})` : 'not found'}`);
            } else {
              // customer_id might be user_id directly - try to find customer_app user
              customerUser = await User.findById(order.customer_id);
              console.log(`🔍 [acceptPickupRequest] customer_id is user_id - customerUser: ${customerUser ? `found (id: ${customerUser.id}, app_type: ${customerUser.app_type})` : 'not found'}`);
            }

            // CRITICAL: Ensure we have a customer_app user, not vendor_app user
            if (customerUser) {
              if (customerUser.app_type === 'customer_app' && customerUser.fcm_token) {
                customerFcmToken = customerUser.fcm_token;
                console.log(`✅ Found customer_app user with FCM token for customer_id ${order.customer_id}`);
              } else if (customerUser.app_type !== 'customer_app') {
                // If user is not customer_app, try to find customer_app user by phone number
                console.log(`⚠️  User ${customerUser.id} is not customer_app (app_type: ${customerUser.app_type}), trying to find customer_app user by phone...`);
                if (customerUser.mob_num) {
                  // Find all users with this phone number and get customer_app user
                  const { getDynamoDBClient } = require('../config/dynamodb');
                  const { ScanCommand } = require('@aws-sdk/lib-dynamodb');
                  const client = getDynamoDBClient();

                  let lastKey = null;
                  const allUsers = [];

                  do {
                    const params = {
                      TableName: 'users',
                      FilterExpression: 'mob_num = :mobile AND (attribute_not_exists(del_status) OR del_status <> :deleted)',
                      ExpressionAttributeValues: {
                        ':mobile': customerUser.mob_num,
                        ':deleted': 2
                      }
                    };

                    if (lastKey) {
                      params.ExclusiveStartKey = lastKey;
                    }

                    const command = new ScanCommand(params);
                    const response = await client.send(command);

                    if (response.Items && response.Items.length > 0) {
                      allUsers.push(...response.Items);
                    }

                    lastKey = response.LastEvaluatedKey;
                  } while (lastKey);

                  // Find customer_app user with FCM token
                  const customerAppUser = allUsers.find(u => u.app_type === 'customer_app' && u.fcm_token);
                  if (customerAppUser) {
                    customerFcmToken = customerAppUser.fcm_token;
                    console.log(`✅ Found customer_app user with FCM token by phone lookup (user_id: ${customerAppUser.id})`);
                  } else {
                    console.warn(`⚠️  No customer_app user with FCM token found for phone ${customerUser.mob_num}`);
                  }
                }
              } else if (customerUser.app_type === 'customer_app' && !customerUser.fcm_token) {
                console.warn(`⚠️  Customer_app user ${customerUser.id} found but has no FCM token`);
              }
            }
          } catch (customerErr) {
            console.error('❌ Error fetching customer FCM token:', customerErr);
            console.error('   Error details:', customerErr.message);
          }
        }

        // Send notification to customer if FCM token exists
        // CRITICAL: Customer must be notified when pickup request is accepted
        if (customerFcmToken) {
          console.log(`📤 [acceptPickupRequest] Sending notification to customer_app user with FCM token`);
          console.log(`   Customer ID: ${order.customer_id}`);
          console.log(`   Partner Name: ${partnerName}`);
          console.log(`   Order ID: ${order.id}`);
          console.log(`   Order Number: ${order.order_number || order.order_no || 'N/A'}`);

          // Use customer app Firebase service account for customer notifications
          const { sendCustomerNotification } = require('../utils/fcmNotification');
          try {
            const notificationResult = await sendCustomerNotification(
              customerFcmToken,
              'Pickup Accepted',
              `${partnerName} accepted your pickup request`,
              {
                type: 'order_accepted',
                order_id: String(order.id),
                order_number: String(order.order_number || order.order_no || ''),
                partner_name: partnerName,
                screen: 'MyOrders'
              }
            );

            if (notificationResult && notificationResult.success) {
              console.log(`✅ [acceptPickupRequest] Successfully sent FCM notification to customer ${order.customer_id} about pickup request acceptance`);
              console.log(`   Message ID: ${notificationResult.messageId || 'N/A'}`);
            } else {
              console.error(`❌ [acceptPickupRequest] Failed to send notification - result:`, notificationResult);
            }
          } catch (sendErr) {
            console.error(`❌ [acceptPickupRequest] Error calling sendCustomerNotification:`, sendErr);
            console.error(`   Error message: ${sendErr.message}`);
            console.error(`   Error stack: ${sendErr.stack}`);
            // Don't fail the request, but log the error
          }
        } else {
          console.warn(`⚠️  [acceptPickupRequest] No FCM token found for customer ${order.customer_id}`);
          console.warn(`   This means the customer will NOT receive a notification about their pickup request being accepted`);
          console.warn(`   Customer ID: ${order.customer_id}`);
          console.warn(`   Please ensure the customer_app user has registered their FCM token`);
        }
      } catch (notificationErr) {
        console.error('❌ [acceptPickupRequest] Critical error in customer notification process:', notificationErr);
        console.error('   Error name:', notificationErr.name);
        console.error('   Error message:', notificationErr.message);
        console.error('   Error stack:', notificationErr.stack);
        // Don't fail the request if notification fails, but log the error clearly
      }

      // Invalidate remaining v2 API caches
      try {
        // Available pickup requests already invalidated above
        // Invalidate active pickup for the accepting user
        await RedisCache.invalidateV2ApiCache('active_pickup', user_id, {
          user_type: user_type
        });
        // Invalidate active pickup for the customer
        if (order.customer_id) {
          await RedisCache.invalidateV2ApiCache('active_pickup', order.customer_id, {
            user_type: 'U'
          });
        }
        // Invalidate order cache
        await RedisCache.invalidateV2ApiCache('order', null, {
          order_id: order.id,
          customer_id: order.customer_id,
          user_id: user_id,
          user_type: user_type
        });
        console.log(`🗑️  Invalidated v2 order caches after accepting pickup request`);
      } catch (err) {
        console.error('Cache invalidation error:', err);
      }

      return res.json({
        status: 'success',
        msg: 'Pickup request accepted successfully',
        data: {
          order_id: order.id,
          order_number: order.order_number,
          status: 2 // 2 = Accepted
        }
      });
    } catch (error) {
      console.error('❌ [acceptPickupRequest] Error accepting pickup request:', error);
      console.error('   Error name:', error.name);
      console.error('   Error message:', error.message);
      console.error('   Error stack:', error.stack);
      console.error('   Request params:', { orderId: req.params.orderId, user_id: req.body.user_id, user_type: req.body.user_type });

      // Provide more detailed error message
      let errorMessage = 'Failed to accept pickup request';
      let statusCode = 500;

      // Check for specific error types
      if (error.name === 'ConditionalCheckFailedException') {
        errorMessage = 'Order state has changed. Please refresh and try again.';
        statusCode = 409;
      } else if (error.message) {
        // Include the actual error message if available
        errorMessage = error.message;
      }

      // In development/debug mode, include more details
      const isDevelopment = process.env.NODE_ENV !== 'production';
      const errorResponse = {
        status: 'error',
        msg: errorMessage,
        data: null
      };

      if (isDevelopment) {
        errorResponse.debug = {
          error_name: error.name,
          error_message: error.message,
          error_stack: error.stack?.split('\n').slice(0, 5) // First 5 lines of stack
        };
      }

      return res.status(statusCode).json(errorResponse);
    }
  }

  /**
   * POST /api/v2/orders/pickup-request/:orderId/cancel
   * Cancel/decline a pickup request (vendor declines the order)
   * Body: { 
   *   user_id: number, 
   *   user_type: 'R'|'S'|'SR'|'D',
   *   cancellation_reason: string (required)
   * }
   */
  static async cancelPickupRequest(req, res) {
    try {
      const { orderId } = req.params;
      const { user_id, user_type, cancellation_reason } = req.body;

      if (!user_id || !user_type) {
        return res.status(400).json({
          status: 'error',
          msg: 'Missing required fields: user_id, user_type',
          data: null
        });
      }

      if (!cancellation_reason || cancellation_reason.trim() === '') {
        return res.status(400).json({
          status: 'error',
          msg: 'Cancellation reason is required',
          data: null
        });
      }

      // Validate user type
      const validTypes = ['R', 'S', 'SR', 'D'];
      if (!validTypes.includes(user_type)) {
        return res.status(400).json({
          status: 'error',
          msg: 'Invalid user_type. Must be R, S, SR, or D',
          data: null
        });
      }

      // Find order by order number or ID
      const orderIdNum = !isNaN(orderId) ? parseInt(orderId) : null;

      let orders = [];
      if (orderIdNum) {
        orders = await Order.findByOrderNo(orderIdNum);
      } else {
        // Try finding by ID directly
        const client = require('../config/dynamodb').getDynamoDBClient();
        const { GetCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');

        try {
          const getCommand = new GetCommand({
            TableName: 'orders',
            Key: { id: orderId }
          });
          const response = await client.send(getCommand);
          if (response.Item) {
            orders = [response.Item];
          }
        } catch (e) {
          // Fallback: Use Order model's findByOrderNo (already handles both order_no and order_number)
          console.warn('⚠️  [cancelPickupRequest] GetCommand failed, trying findByOrderNo:', e.message);
          orders = await Order.findByOrderNo(orderId);
        }
      }

      if (!orders || orders.length === 0) {
        return res.status(404).json({
          status: 'error',
          msg: 'Order not found',
          data: null
        });
      }

      const order = orders[0];

      // Check if order is still available (status 1)
      if (order.status !== 1) {
        return res.status(400).json({
          status: 'error',
          msg: 'Order is no longer available for cancellation',
          data: null
        });
      }

      // Update order with cancellation reason
      // We'll store the cancellation in a separate field and remove the vendor from notified_vendor_ids
      const UpdateCommand = require('@aws-sdk/lib-dynamodb').UpdateCommand;
      const client = require('../config/dynamodb').getDynamoDBClient();

      // Get vendor's shop_id if they have one (for R, S, SR types)
      let vendorShopId = null;
      if (user_type === 'R' || user_type === 'S' || user_type === 'SR') {
        try {
          const Shop = require('../models/Shop');
          const shop = await Shop.findByUserId(parseInt(user_id));
          if (shop && shop.id) {
            vendorShopId = parseInt(shop.id);
          }
        } catch (shopErr) {
          console.warn('⚠️  Could not find shop for vendor:', shopErr.message);
        }
      }

      // Remove this vendor from notified_vendor_ids if they were notified
      let updatedNotifiedVendorIds = [];
      if (order.notified_vendor_ids) {
        try {
          const notifiedIds = typeof order.notified_vendor_ids === 'string'
            ? JSON.parse(order.notified_vendor_ids)
            : order.notified_vendor_ids;

          if (Array.isArray(notifiedIds)) {
            updatedNotifiedVendorIds = notifiedIds
              .map(id => parseInt(id))
              .filter(id => !isNaN(id) && id !== parseInt(user_id));
          }
        } catch (parseErr) {
          console.warn('⚠️  Could not parse notified_vendor_ids:', parseErr.message);
        }
      }

      // Store cancellation record
      const cancellationRecord = {
        user_id: parseInt(user_id),
        user_type: user_type,
        shop_id: vendorShopId,
        cancellation_reason: cancellation_reason.trim(),
        cancelled_at: new Date().toISOString()
      };

      // Get existing cancellations or create new array
      let cancellations = [];
      if (order.vendor_cancellations) {
        try {
          cancellations = typeof order.vendor_cancellations === 'string'
            ? JSON.parse(order.vendor_cancellations)
            : order.vendor_cancellations;
        } catch (parseErr) {
          console.warn('⚠️  Could not parse vendor_cancellations:', parseErr.message);
        }
      }

      // Add new cancellation
      cancellations.push(cancellationRecord);

      // Update order: remove vendor from notified list and add cancellation record
      const updateExpression = 'SET vendor_cancellations = :cancellations, notified_vendor_ids = :notifiedIds, updated_at = :updatedAt';

      const command = new UpdateCommand({
        TableName: 'orders',
        Key: { id: order.id },
        UpdateExpression: updateExpression,
        ExpressionAttributeValues: {
          ':cancellations': JSON.stringify(cancellations),
          ':notifiedIds': updatedNotifiedVendorIds.length > 0 ? JSON.stringify(updatedNotifiedVendorIds) : null,
          ':updatedAt': new Date().toISOString()
        }
      });

      await client.send(command);

      console.log(`✅ Order ${order.order_number || order.id} cancelled by user_id ${user_id}`);
      console.log(`   Cancellation reason: ${cancellation_reason}`);
      console.log(`   Remaining notified vendors: ${updatedNotifiedVendorIds.length}`);

      // Invalidate cache
      try {
        const RedisCache = require('../utils/redisCache');
        await RedisCache.delete(RedisCache.orderKey(order.id));
        await RedisCache.delete(RedisCache.dashboardKey('vendor', user_id));
        // Invalidate available pickup requests cache
        await RedisCache.delete(`available_pickup_requests:${user_id}:${user_type}`);
      } catch (cacheErr) {
        console.warn('⚠️  Cache invalidation error:', cacheErr.message);
      }

      return res.json({
        status: 'success',
        msg: 'Order cancelled successfully',
        data: {
          order_number: order.order_number || order.order_no,
          cancellation_reason: cancellation_reason,
          cancelled_at: cancellationRecord.cancelled_at
        }
      });
    } catch (error) {
      console.error('Error cancelling pickup request:', error);
      return res.status(500).json({
        status: 'error',
        msg: 'Failed to cancel pickup request',
        data: null
      });
    }
  }

  /**
   * GET /api/v2/orders/active-pickup/:userId
   * Get active pickup orders for a user (R, S, SR, D)
   * Query params: ?user_type=R|S|SR|D
   */
  static async getActivePickup(req, res) {
    try {
      const { userId } = req.params;
      const { user_type } = req.query;

      if (!user_type) {
        return res.status(400).json({
          status: 'error',
          msg: 'Missing required query param: user_type',
          data: null
        });
      }

      const userIdNum = parseInt(userId);

      // Check Redis cache first
      const cacheKey = RedisCache.userKey(userIdNum, `active_pickup_${user_type}`);
      try {
        const cached = await RedisCache.get(cacheKey);
        if (cached !== null && cached !== undefined) {
          console.log('⚡ Active pickup cache hit');
          return res.json({
            status: 'success',
            msg: 'Active pickup retrieved successfully',
            data: cached,
            hitBy: 'Redis'
          });
        }
      } catch (err) {
        console.error('Redis get error:', err);
      }
      const client = require('../config/dynamodb').getDynamoDBClient();
      const { ScanCommand } = require('@aws-sdk/lib-dynamodb');

      // Find orders assigned to this user with status 3 (pickup assigned/scheduled)
      let filterExpression;
      let expressionAttributeValues;

      if (user_type === 'D') {
        filterExpression = '(delv_id = :userId OR delv_boy_id = :userId) AND #status = :status';
        expressionAttributeValues = {
          ':userId': userIdNum,
          ':status': 3
        };
      } else {
        // For R, S, SR types, we need to find the shop_id(s) first
        // For SR users, they have both B2C (shop_type = 3) and B2B (shop_type = 1 or 4) shops
        let vendorShopIds = [];
        try {
          const Shop = require('../models/Shop');
          
          if (user_type === 'SR') {
            // For SR users, find all shops (B2C + B2B)
            const allShops = await Shop.findAllByUserId(userIdNum);
            if (allShops && allShops.length > 0) {
              vendorShopIds = allShops.map(s => parseInt(s.id));
              console.log(`✅ [getActivePickup] Found ${allShops.length} shop(s) for SR user ${userIdNum}: ${vendorShopIds.join(', ')}`);
            } else {
              console.warn(`⚠️  [getActivePickup] No shops found for SR user ${userIdNum}`);
              return res.json({
                status: 'success',
                msg: 'Active pickup retrieved successfully',
                data: null,
                hitBy: 'DynamoDB'
              });
            }
          } else if (user_type === 'R') {
            // For R users (B2C), find B2C shop (shop_type = 3)
            // Use findAllByUserId and filter for B2C shop to ensure we get the correct shop
            const allShops = await Shop.findAllByUserId(userIdNum);
            const b2cShop = allShops.find(s => parseInt(s.shop_type) === 3);
            if (b2cShop && b2cShop.id) {
              vendorShopIds = [parseInt(b2cShop.id)];
              console.log(`✅ [getActivePickup] Found B2C shop ${vendorShopIds[0]} (shop_type=3) for R user ${userIdNum}`);
            } else {
              console.warn(`⚠️  [getActivePickup] No B2C shop (shop_type=3) found for R user ${userIdNum}`);
              return res.json({
                status: 'success',
                msg: 'Active pickup retrieved successfully',
                data: null,
                hitBy: 'DynamoDB'
              });
            }
          } else {
            // For S users, use findByUserId (single shop)
            const shop = await Shop.findByUserId(userIdNum);
            if (shop && shop.id) {
              vendorShopIds = [parseInt(shop.id)];
              console.log(`✅ [getActivePickup] Found shop ${vendorShopIds[0]} for user ${userIdNum}`);
            } else {
              console.warn(`⚠️  [getActivePickup] No shop found for user ${userIdNum}`);
              return res.json({
                status: 'success',
                msg: 'Active pickup retrieved successfully',
                data: null,
                hitBy: 'DynamoDB'
              });
            }
          }
        } catch (shopErr) {
          console.error('Error finding shop for vendor:', shopErr);
          return res.status(500).json({
            status: 'error',
            msg: 'Failed to find vendor shop',
            data: null
          });
        }

        // Filter orders by all shop_ids (for SR users, this includes both B2C and B2B shops)
        // DynamoDB doesn't support IN clause, so we use OR conditions
        if (vendorShopIds.length === 1) {
          filterExpression = 'shop_id = :shopId AND (#status = :status2 OR #status = :status3 OR #status = :status4)';
          expressionAttributeValues = {
            ':shopId': vendorShopIds[0],
            ':status2': 2, // Accepted
            ':status3': 3, // Pickup Initiated
            ':status4': 4  // Arrived Location
          };
        } else {
          // Multiple shops - use OR conditions
          const shopIdConditions = vendorShopIds.map((shopId, i) => `shop_id = :shopId${i}`).join(' OR ');
          filterExpression = `(${shopIdConditions}) AND (#status = :status2 OR #status = :status3 OR #status = :status4)`;
          expressionAttributeValues = {
            ':status2': 2, // Accepted
            ':status3': 3, // Pickup Initiated
            ':status4': 4  // Arrived Location
          };
          vendorShopIds.forEach((shopId, i) => {
            expressionAttributeValues[`:shopId${i}`] = shopId;
          });
        }
      }

      const command = new ScanCommand({
        TableName: 'orders',
        FilterExpression: filterExpression,
        ExpressionAttributeNames: {
          '#status': 'status'
        },
        ExpressionAttributeValues: expressionAttributeValues
      });

      const response = await client.send(command);
      const orders = response.Items || [];
      
      console.log(`🔍 [getActivePickup] Query result for user ${userIdNum} (type: ${user_type}): Found ${orders.length} order(s)`);
      if (orders.length > 0) {
        orders.forEach((order, idx) => {
          console.log(`   Order ${idx + 1}: order_id=${order.id}, order_number=${order.order_number || order.order_no}, shop_id=${order.shop_id}, status=${order.status}`);
        });
      } else {
        console.log(`   Filter used: ${filterExpression}`);
        console.log(`   Expression values:`, JSON.stringify(expressionAttributeValues));
      }

      // Get unique customer IDs and fetch customer data
      const customerIds = [...new Set(orders.map(o => o.customer_id).filter(Boolean))];
      const customers = await Promise.all(
        customerIds.map(async (id) => {
          try {
            // First try to find by customer ID
            let customer = await Customer.findById(id);
            if (customer) {
              console.log(`✅ [getActivePickup] Found customer by ID ${id}:`, customer.name || 'No name');
              return customer;
            }
            // If not found, try to find by user_id (customer_id might be user_id)
            customer = await Customer.findByUserId(id);
            if (customer) {
              console.log(`✅ [getActivePickup] Found customer by user_id ${id}:`, customer.name || 'No name');
              return customer;
            }
            // If still not found, try to get from User table as fallback
            const User = require('../models/User');
            const user = await User.findById(id);
            if (user) {
              console.log(`✅ [getActivePickup] Found user ${id}, using as customer fallback:`, user.name || 'No name');
              // Return a customer-like object from user data
              return {
                id: id,
                name: user.name || null,
                contact: user.mob_num || null
              };
            }
            console.log(`❌ [getActivePickup] No customer or user found for ID ${id}`);
            return null;
          } catch (err) {
            console.error(`Error fetching customer ${id}:`, err);
            return null;
          }
        })
      );
      const customerMap = {};
      customers.forEach(c => {
        if (c) {
          // Map by both customer.id and the original customer_id
          customerMap[c.id] = c;
          // Also check if we need to map by a different key
          if (c.user_id && c.user_id !== c.id) {
            customerMap[c.user_id] = c;
          }
        }
      });

      // Also map customer_id to customer if customer_id is user_id
      customerIds.forEach(customerId => {
        if (!customerMap[customerId]) {
          // Try to find customer that matches this ID
          const found = customers.find(c => c && (c.id === customerId || c.user_id === customerId));
          if (found) {
            customerMap[customerId] = found;
          }
        }
      });

      // Format orders for Active Pickup section
      const formattedOrders = orders.slice(0, 1).map(order => { // Get most recent active pickup
        const [lat, lng] = order.lat_log ? order.lat_log.split(',').map(Number) : [null, null];

        // Get customer info
        // Try to find customer by customer_id, or by user_id if customer_id is actually a user_id
        let customer = order.customer_id ? customerMap[order.customer_id] : null;
        if (!customer && order.customer_id) {
          // Try to find by user_id in the map
          const found = Object.values(customerMap).find(c => c && c.user_id === order.customer_id);
          if (found) customer = found;
        }
        const customer_name = customer?.name || null;
        const customer_phone = customer?.contact ? String(customer.contact) : null;

        // Parse orderdetails
        let scrapDescription = 'Mixed Recyclables';
        let totalWeight = parseFloat(order.estim_weight) || 0;

        try {
          const details = typeof order.orderdetails === 'string'
            ? JSON.parse(order.orderdetails)
            : order.orderdetails;

          if (details && typeof details === 'object') {
            const items = [];
            if (Array.isArray(details)) {
              items.push(...details);
            } else if (details.orders) {
              Object.entries(details.orders).forEach(([category, subcats]) => {
                if (Array.isArray(subcats)) {
                  items.push(...subcats);
                }
              });
            }

            if (items.length > 0) {
              const categories = [...new Set(items.map(item => item.name || item.category_name))];
              scrapDescription = categories.length > 0
                ? categories.join(', ')
                : 'Mixed Recyclables';
            }
          }
        } catch (e) {
          console.error('Error parsing orderdetails:', e);
        }

        // Format pickup time from customer app format: "YYYY-MM-DD 9:00 AM - 12:00 PM"
        let pickupTimeDisplay = 'Today';
        let formattedDate = null;
        let timeSlot = null;

        if (order.preferred_pickup_time) {
          const timeStr = order.preferred_pickup_time;

          // Parse format: "YYYY-MM-DD 9:00 AM - 12:00 PM" or "YYYY-MM-DD HH:MM AM/PM"
          const dateTimeMatch = timeStr.match(/(\d{4}-\d{2}-\d{2})\s+(.+)/);

          if (dateTimeMatch) {
            const dateStr = dateTimeMatch[1]; // "YYYY-MM-DD"
            timeSlot = dateTimeMatch[2]; // "9:00 AM - 12:00 PM" or "10:00 AM"

            try {
              const pickupDate = new Date(dateStr);
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              const tomorrow = new Date(today);
              tomorrow.setDate(tomorrow.getDate() + 1);
              const dateOnly = new Date(pickupDate);
              dateOnly.setHours(0, 0, 0, 0);

              const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
              const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

              if (dateOnly.getTime() === today.getTime()) {
                formattedDate = 'Today';
                pickupTimeDisplay = `Today, ${timeSlot}`;
              } else if (dateOnly.getTime() === tomorrow.getTime()) {
                formattedDate = 'Tomorrow';
                pickupTimeDisplay = `Tomorrow, ${timeSlot}`;
              } else {
                const dayName = days[pickupDate.getDay()];
                const day = pickupDate.getDate();
                const month = months[pickupDate.getMonth()];
                const year = pickupDate.getFullYear();
                formattedDate = `${dayName}, ${day} ${month} ${year}`;
                pickupTimeDisplay = `${formattedDate}, ${timeSlot}`;
              }
            } catch (e) {
              console.error('Error parsing preferred_pickup_time date:', e);
              // Fallback to original format
              if (timeStr.includes('AM') || timeStr.includes('PM')) {
                pickupTimeDisplay = `Today, ${timeStr}`;
              }
            }
          } else if (timeStr.includes('AM') || timeStr.includes('PM')) {
            // Fallback for old format
            pickupTimeDisplay = `Today, ${timeStr}`;
          }
        }

        // Parse orderdetails to get individual items
        let orderItems = [];
        try {
          const details = typeof order.orderdetails === 'string'
            ? JSON.parse(order.orderdetails)
            : order.orderdetails;

          if (details && typeof details === 'object') {
            if (Array.isArray(details)) {
              orderItems = details;
            } else if (details.orders) {
              Object.entries(details.orders).forEach(([category, subcats]) => {
                if (Array.isArray(subcats)) {
                  orderItems.push(...subcats);
                }
              });
            }
          }
        } catch (e) {
          console.error('Error parsing orderdetails for items:', e);
        }

        // Get status label
        let statusLabel = 'Scheduled';
        if (order.status === 2) statusLabel = 'Accepted';
        else if (order.status === 3) statusLabel = 'Pickup Initiated';
        else if (order.status === 4) statusLabel = 'Arrived Location';

        return {
          order_id: order.id,
          order_number: order.order_number,
          order_no: order.order_no,
          customer_id: order.customer_id,
          customer_name: customer_name,
          customer_phone: customer_phone,
          address: order.address || order.customerdetails,
          latitude: lat,
          longitude: lng,
          scrap_description: scrapDescription,
          estimated_weight_kg: totalWeight,
          estimated_price: parseFloat(order.estim_price) || 0,
          status: order.status,
          status_label: statusLabel,
          preferred_pickup_time: order.preferred_pickup_time || null,
          pickup_time_display: pickupTimeDisplay,
          preferred_pickup_date: formattedDate || null,
          preferred_pickup_time_slot: timeSlot || null,
          created_at: order.created_at,
          accepted_at: order.accepted_at,
          pickup_initiated_at: order.pickup_initiated_at,
          arrived_at: order.arrived_at,
          images: [
            order.image1,
            order.image2,
            order.image3,
            order.image4,
            order.image5,
            order.image6
          ].filter(Boolean),
          orderdetails: orderItems // Include parsed order items
        };
      });

      const result = formattedOrders[0] || null;

      // Cache the result (cache for 2 minutes - active pickup can change)
      try {
        await RedisCache.set(cacheKey, result, 'short');
        console.log('💾 Active pickup cached');
      } catch (err) {
        console.error('Redis cache set error:', err);
      }

      return res.json({
        status: 'success',
        msg: 'Active pickup retrieved successfully',
        data: result,
        hitBy: 'DynamoDB'
      });
    } catch (error) {
      console.error('Error fetching active pickup:', error);
      return res.status(500).json({
        status: 'error',
        msg: 'Failed to fetch active pickup',
        data: null
      });
    }
  }

  /**
   * GET /api/v2/orders/active-pickups/:userId
   * Get all active pickup orders for a user (R, S, SR, D)
   * Query params: ?user_type=R|S|SR|D
   * Returns array of all active pickups (status 2, 3, 4)
   */
  static async getAllActivePickups(req, res) {
    try {
      const { userId } = req.params;
      const { user_type } = req.query;

      if (!user_type) {
        return res.status(400).json({
          status: 'error',
          msg: 'Missing required query param: user_type',
          data: null
        });
      }

      const userIdNum = parseInt(userId);
      const client = require('../config/dynamodb').getDynamoDBClient();
      const { ScanCommand } = require('@aws-sdk/lib-dynamodb');

      // Find orders assigned to this user with status 2 (Accepted), 3 (Pickup Initiated), or 4 (Arrived Location)
      let filterExpression;
      let expressionAttributeValues;

      if (user_type === 'D') {
        filterExpression = '(delv_id = :userId OR delv_boy_id = :userId) AND (#status = :status2 OR #status = :status3 OR #status = :status4)';
        expressionAttributeValues = {
          ':userId': userIdNum,
          ':status2': 2, // Accepted
          ':status3': 3, // Pickup Initiated
          ':status4': 4  // Arrived Location
        };
      } else {
        // For R, S, SR types, we need to find the shop_id(s) first
        // For SR users, they have both B2C (shop_type = 3) and B2B (shop_type = 1 or 4) shops
        let vendorShopIds = [];
        try {
          const Shop = require('../models/Shop');
          
          if (user_type === 'SR') {
            // For SR users, find all shops (B2C + B2B)
            const allShops = await Shop.findAllByUserId(userIdNum);
            if (allShops && allShops.length > 0) {
              vendorShopIds = allShops.map(s => parseInt(s.id));
              console.log(`✅ [getAllActivePickups] Found ${allShops.length} shop(s) for SR user ${userIdNum}: ${vendorShopIds.join(', ')}`);
            } else {
              console.warn(`⚠️  [getAllActivePickups] No shops found for SR user ${userIdNum}`);
              return res.json({
                status: 'success',
                msg: 'Active pickups retrieved successfully',
                data: [],
                hitBy: 'DynamoDB'
              });
            }
          } else if (user_type === 'R') {
            // For R users (B2C), find B2C shop (shop_type = 3)
            // Use findAllByUserId and filter for B2C shop to ensure we get the correct shop
            const allShops = await Shop.findAllByUserId(userIdNum);
            const b2cShop = allShops.find(s => parseInt(s.shop_type) === 3);
            if (b2cShop && b2cShop.id) {
              vendorShopIds = [parseInt(b2cShop.id)];
              console.log(`✅ [getAllActivePickups] Found B2C shop ${vendorShopIds[0]} (shop_type=3) for R user ${userIdNum}`);
            } else {
              console.warn(`⚠️  [getAllActivePickups] No B2C shop (shop_type=3) found for R user ${userIdNum}`);
              return res.json({
                status: 'success',
                msg: 'Active pickups retrieved successfully',
                data: [],
                hitBy: 'DynamoDB'
              });
            }
          } else {
            // For S users, use findByUserId (single shop)
            const shop = await Shop.findByUserId(userIdNum);
            if (shop && shop.id) {
              vendorShopIds = [parseInt(shop.id)];
              console.log(`✅ [getAllActivePickups] Found shop ${vendorShopIds[0]} for user ${userIdNum}`);
            } else {
              console.warn(`⚠️  [getAllActivePickups] No shop found for user ${userIdNum}`);
              return res.json({
                status: 'success',
                msg: 'Active pickups retrieved successfully',
                data: [],
                hitBy: 'DynamoDB'
              });
            }
          }
        } catch (shopErr) {
          console.error('Error finding shop for vendor:', shopErr);
          return res.status(500).json({
            status: 'error',
            msg: 'Failed to find vendor shop',
            data: null
          });
        }

        // Filter orders by all shop_ids (for SR users, this includes both B2C and B2B shops)
        // DynamoDB doesn't support IN clause, so we use OR conditions
        if (vendorShopIds.length === 1) {
          filterExpression = 'shop_id = :shopId AND (#status = :status2 OR #status = :status3 OR #status = :status4)';
          expressionAttributeValues = {
            ':shopId': vendorShopIds[0],
            ':status2': 2, // Accepted
            ':status3': 3, // Pickup Initiated
            ':status4': 4  // Arrived Location
          };
        } else {
          // Multiple shops - use OR conditions
          const shopIdConditions = vendorShopIds.map((shopId, i) => `shop_id = :shopId${i}`).join(' OR ');
          filterExpression = `(${shopIdConditions}) AND (#status = :status2 OR #status = :status3 OR #status = :status4)`;
          expressionAttributeValues = {
            ':status2': 2, // Accepted
            ':status3': 3, // Pickup Initiated
            ':status4': 4  // Arrived Location
          };
          vendorShopIds.forEach((shopId, i) => {
            expressionAttributeValues[`:shopId${i}`] = shopId;
          });
        }
      }

      const command = new ScanCommand({
        TableName: 'orders',
        FilterExpression: filterExpression,
        ExpressionAttributeNames: {
          '#status': 'status'
        },
        ExpressionAttributeValues: expressionAttributeValues
      });

      const response = await client.send(command);
      const orders = response.Items || [];

      // Get unique customer IDs and fetch customer data
      const Customer = require('../models/Customer');
      const customerIds = [...new Set(orders.map(o => o.customer_id).filter(Boolean))];
      const customers = await Promise.all(
        customerIds.map(async (id) => {
          try {
            let customer = await Customer.findById(id);
            if (customer) return customer;
            customer = await Customer.findByUserId(id);
            if (customer) return customer;
            const User = require('../models/User');
            const user = await User.findById(id);
            if (user) {
              return {
                id: id,
                name: user.name || null,
                contact: user.mob_num || null
              };
            }
            return null;
          } catch (err) {
            console.error(`Error fetching customer ${id}:`, err);
            return null;
          }
        })
      );
      const customerMap = {};
      customers.forEach(c => {
        if (c) {
          customerMap[c.id] = c;
          if (c.user_id && c.user_id !== c.id) {
            customerMap[c.user_id] = c;
          }
        }
      });
      customerIds.forEach(customerId => {
        if (!customerMap[customerId]) {
          const found = customers.find(c => c && (c.id === customerId || c.user_id === customerId));
          if (found) {
            customerMap[customerId] = found;
          }
        }
      });

      // Format all orders for Active Pickups list
      const formattedOrders = orders.map(order => {
        const [lat, lng] = order.lat_log ? order.lat_log.split(',').map(Number) : [null, null];

        let customer = order.customer_id ? customerMap[order.customer_id] : null;
        if (!customer && order.customer_id) {
          const found = Object.values(customerMap).find(c => c && c.user_id === order.customer_id);
          if (found) customer = found;
        }
        const customer_name = customer?.name || null;
        const customer_phone = customer?.contact ? String(customer.contact) : null;

        // Parse orderdetails
        let scrapDescription = 'Mixed Recyclables';
        let totalWeight = parseFloat(order.estim_weight) || 0;

        try {
          const details = typeof order.orderdetails === 'string'
            ? JSON.parse(order.orderdetails)
            : order.orderdetails;

          if (details && typeof details === 'object') {
            const items = [];
            if (Array.isArray(details)) {
              items.push(...details);
            } else if (details.orders) {
              Object.entries(details.orders).forEach(([category, subcats]) => {
                if (Array.isArray(subcats)) {
                  items.push(...subcats);
                }
              });
            }

            if (items.length > 0) {
              const categories = [...new Set(items.map(item => item.name || item.category_name))];
              scrapDescription = categories.length > 0
                ? categories.join(', ')
                : 'Mixed Recyclables';
            }
          }
        } catch (e) {
          console.error('Error parsing orderdetails:', e);
        }

        // Format pickup time from customer app format: "YYYY-MM-DD 9:00 AM - 12:00 PM"
        let pickupTimeDisplay = 'Today';
        let formattedDate = null;
        let timeSlot = null;

        if (order.preferred_pickup_time) {
          const timeStr = order.preferred_pickup_time;

          // Parse format: "YYYY-MM-DD 9:00 AM - 12:00 PM" or "YYYY-MM-DD HH:MM AM/PM"
          const dateTimeMatch = timeStr.match(/(\d{4}-\d{2}-\d{2})\s+(.+)/);

          if (dateTimeMatch) {
            const dateStr = dateTimeMatch[1]; // "YYYY-MM-DD"
            timeSlot = dateTimeMatch[2]; // "9:00 AM - 12:00 PM" or "10:00 AM"

            try {
              const pickupDate = new Date(dateStr);
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              const tomorrow = new Date(today);
              tomorrow.setDate(tomorrow.getDate() + 1);
              const dateOnly = new Date(pickupDate);
              dateOnly.setHours(0, 0, 0, 0);

              const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
              const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

              if (dateOnly.getTime() === today.getTime()) {
                formattedDate = 'Today';
                pickupTimeDisplay = `Today, ${timeSlot}`;
              } else if (dateOnly.getTime() === tomorrow.getTime()) {
                formattedDate = 'Tomorrow';
                pickupTimeDisplay = `Tomorrow, ${timeSlot}`;
              } else {
                const dayName = days[pickupDate.getDay()];
                const day = pickupDate.getDate();
                const month = months[pickupDate.getMonth()];
                const year = pickupDate.getFullYear();
                formattedDate = `${dayName}, ${day} ${month} ${year}`;
                pickupTimeDisplay = `${formattedDate}, ${timeSlot}`;
              }
            } catch (e) {
              console.error('Error parsing preferred_pickup_time date:', e);
              // Fallback to original format
              if (timeStr.includes('AM') || timeStr.includes('PM')) {
                pickupTimeDisplay = `Today, ${timeStr}`;
              }
            }
          } else if (timeStr.includes('AM') || timeStr.includes('PM')) {
            // Fallback for old format
            pickupTimeDisplay = `Today, ${timeStr}`;
          }
        }

        // Parse orderdetails to get individual items
        let orderItems = [];
        try {
          const details = typeof order.orderdetails === 'string'
            ? JSON.parse(order.orderdetails)
            : order.orderdetails;

          if (details && typeof details === 'object') {
            if (Array.isArray(details)) {
              orderItems = details;
            } else if (details.orders) {
              Object.entries(details.orders).forEach(([category, subcats]) => {
                if (Array.isArray(subcats)) {
                  orderItems.push(...subcats);
                }
              });
            }
          }
        } catch (e) {
          console.error('Error parsing orderdetails for items:', e);
        }

        // Get status label
        let statusLabel = 'Scheduled';
        if (order.status === 2) statusLabel = 'Accepted';
        else if (order.status === 3) statusLabel = 'Pickup Initiated';
        else if (order.status === 4) statusLabel = 'Arrived Location';

        const result = {
          order_id: order.id,
          order_number: order.order_number,
          order_no: order.order_no,
          customer_id: order.customer_id,
          customer_name: customer_name,
          customer_phone: customer_phone,
          address: order.address || order.customerdetails,
          latitude: lat,
          longitude: lng,
          scrap_description: scrapDescription,
          estimated_weight_kg: totalWeight,
          estimated_price: parseFloat(order.estim_price) || 0,
          status: order.status,
          status_label: statusLabel,
          preferred_pickup_time: order.preferred_pickup_time || null,
          pickup_time_display: pickupTimeDisplay,
          preferred_pickup_date: formattedDate || null,
          preferred_pickup_time_slot: timeSlot || null,
          created_at: order.created_at,
          accepted_at: order.accepted_at,
          pickup_initiated_at: order.pickup_initiated_at,
          arrived_at: order.arrived_at,
          images: [
            order.image1,
            order.image2,
            order.image3,
            order.image4,
            order.image5,
            order.image6
          ].filter(Boolean),
          orderdetails: orderItems
        };

        console.log(`   📤 [getAllActivePickups] Returning for order ${order.order_number || order.id}:`);
        console.log(`      preferred_pickup_time: ${result.preferred_pickup_time}`);
        console.log(`      preferred_pickup_date: ${result.preferred_pickup_date}`);
        console.log(`      preferred_pickup_time_slot: ${result.preferred_pickup_time_slot}`);
        console.log(`      pickup_time_display: ${result.pickup_time_display}`);

        return result;
      });

      // Sort by created_at DESC (most recent first)
      formattedOrders.sort((a, b) => {
        const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
        return dateB - dateA;
      });

      return res.json({
        status: 'success',
        msg: 'Active pickups retrieved successfully',
        data: formattedOrders,
        hitBy: 'DynamoDB'
      });
    } catch (error) {
      console.error('Error fetching all active pickups:', error);
      return res.status(500).json({
        status: 'error',
        msg: 'Failed to fetch active pickups',
        data: null
      });
    }
  }

  /**
   * GET /api/v2/orders/completed-pickups/:userId
   * Get completed pickup orders for a user (R, S, SR, D) - status 5
   * Query params: ?user_type=R|S|SR|D
   */
  static async getCompletedPickups(req, res) {
    try {
      const { userId } = req.params;
      const { user_type } = req.query;

      if (!user_type) {
        return res.status(400).json({
          status: 'error',
          msg: 'Missing required query param: user_type',
          data: null
        });
      }

      const userIdNum = parseInt(userId);
      const client = require('../config/dynamodb').getDynamoDBClient();
      const { ScanCommand } = require('@aws-sdk/lib-dynamodb');

      // Find orders assigned to this user with status 5 (Pickup Completed)
      let filterExpression;
      let expressionAttributeValues;

      if (user_type === 'D') {
        filterExpression = '(delv_id = :userId OR delv_boy_id = :userId) AND #status = :status5';
        expressionAttributeValues = {
          ':userId': userIdNum,
          ':status5': 5 // Pickup Completed
        };
      } else {
        // For R, S, SR types, we need to find the shop_id(s) first
        // For SR users, they have both B2C (shop_type = 3) and B2B (shop_type = 1 or 4) shops
        // We need to retrieve orders from ALL their shops
        let vendorShopIds = [];
        try {
          const Shop = require('../models/Shop');
          
          if (user_type === 'SR') {
            // For SR users, find all shops (B2C + B2B)
            const allShops = await Shop.findAllByUserId(userIdNum);
            if (allShops && allShops.length > 0) {
              vendorShopIds = allShops.map(s => parseInt(s.id));
              console.log(`✅ [getCompletedPickups] Found ${allShops.length} shop(s) for SR user ${userIdNum}: ${vendorShopIds.join(', ')}`);
            } else {
              console.warn(`⚠️  [getCompletedPickups] No shops found for SR user ${userIdNum}`);
              return res.json({
                status: 'success',
                msg: 'Completed pickups retrieved successfully',
                data: [],
                hitBy: 'DynamoDB'
              });
            }
          } else {
            // For R and S users, use findByUserId (single shop)
            const shop = await Shop.findByUserId(userIdNum);
            if (shop && shop.id) {
              vendorShopIds = [parseInt(shop.id)];
              console.log(`✅ [getCompletedPickups] Found shop ${vendorShopIds[0]} for user ${userIdNum}`);
            } else {
              console.warn(`⚠️  [getCompletedPickups] No shop found for user ${userIdNum}`);
              return res.json({
                status: 'success',
                msg: 'Completed pickups retrieved successfully',
                data: [],
                hitBy: 'DynamoDB'
              });
            }
          }
        } catch (shopErr) {
          console.error('Error finding shop for vendor:', shopErr);
          return res.status(500).json({
            status: 'error',
            msg: 'Failed to find vendor shop',
            data: null
          });
        }

        // Filter orders by all shop_ids (for SR users, this includes both B2C and B2B shops)
        // DynamoDB doesn't support IN clause, so we use OR conditions
        if (vendorShopIds.length === 1) {
          filterExpression = 'shop_id = :shopId AND #status = :status5';
          expressionAttributeValues = {
            ':shopId': vendorShopIds[0],
            ':status5': 5 // Pickup Completed
          };
        } else {
          // Multiple shops - use OR conditions
          const shopIdConditions = vendorShopIds.map((shopId, i) => `shop_id = :shopId${i}`).join(' OR ');
          filterExpression = `(${shopIdConditions}) AND #status = :status5`;
          expressionAttributeValues = {
            ':status5': 5 // Pickup Completed
          };
          vendorShopIds.forEach((shopId, i) => {
            expressionAttributeValues[`:shopId${i}`] = shopId;
          });
        }
      }

      const command = new ScanCommand({
        TableName: 'orders',
        FilterExpression: filterExpression,
        ExpressionAttributeNames: {
          '#status': 'status'
        },
        ExpressionAttributeValues: expressionAttributeValues
      });

      const response = await client.send(command);
      let orders = response.Items || [];

      // Also get orders that were notified to this vendor but accepted by someone else
      // These orders should appear in "My Orders" with "Accepted by other Partner" status
      try {
        console.log(`🔍 [getCompletedPickups] Looking for orders accepted by others for user_id=${userIdNum}, user_type=${user_type}`);

        // Use vendorShopIds from above (already fetched for the main query)
        // No need to re-fetch, just reuse the shop IDs we already have
        const vendorShopIdsForOthers = user_type === 'SR' 
          ? vendorShopIds  // Reuse from above
          : (vendorShopIds.length > 0 ? vendorShopIds : []);
        
        if (user_type !== 'D' && vendorShopIdsForOthers.length === 0) {
          console.warn(`⚠️  [getCompletedPickups] No shops found for user_id=${userIdNum}, skipping orders accepted by others check`);
        } else if (user_type === 'D') {
          console.log(`ℹ️  [getCompletedPickups] User type is D (Delivery), will check delv_id instead of shop_id`);
        }

        // Scan for orders with status 2, 3, 4, or 5 (Accepted, In Progress, or Completed) 
        // that were notified to this vendor but accepted by someone else
        const acceptedByOthersCommand = new ScanCommand({
          TableName: 'orders',
          FilterExpression: '#status IN (:status2, :status3, :status4, :status5)',
          ExpressionAttributeNames: {
            '#status': 'status'
          },
          ExpressionAttributeValues: {
            ':status2': 2, // Accepted
            ':status3': 3, // Pickup Started
            ':status4': 4, // Arrived
            ':status5': 5  // Completed
          }
        });

        const acceptedByOthersResponse = await client.send(acceptedByOthersCommand);
        const allAcceptedOrders = acceptedByOthersResponse.Items || [];

        console.log(`📦 [getCompletedPickups] Found ${allAcceptedOrders.length} total order(s) with status 2, 3, 4, or 5`);

        // Filter orders that were notified to this vendor but accepted by someone else
        const acceptedByOthers = allAcceptedOrders.filter(order => {
          // Check if this vendor was notified
          let wasNotified = false;
          if (order.notified_vendor_ids) {
            try {
              const notifiedIds = typeof order.notified_vendor_ids === 'string'
                ? JSON.parse(order.notified_vendor_ids)
                : order.notified_vendor_ids;

              if (Array.isArray(notifiedIds)) {
                // Convert all IDs to numbers for comparison, but also check as strings
                const notifiedIdsNum = notifiedIds.map(id => {
                  const numId = typeof id === 'string' ? parseInt(id) : id;
                  return !isNaN(numId) ? numId : null;
                }).filter(id => id !== null);

                // Also check original values as strings (in case of large numbers stored as strings)
                const notifiedIdsStr = notifiedIds.map(id => String(id));

                // Check both numeric and string comparisons
                wasNotified = notifiedIdsNum.includes(userIdNum) ||
                  notifiedIdsStr.includes(String(userIdNum)) ||
                  notifiedIds.includes(userIdNum); // Direct comparison for exact match

                console.log(`   Checking order ${order.order_number || order.id}:`);
                console.log(`     Original notifiedIds: ${JSON.stringify(notifiedIds)}`);
                console.log(`     Numeric IDs: ${JSON.stringify(notifiedIdsNum)}`);
                console.log(`     String IDs: ${JSON.stringify(notifiedIdsStr)}`);
                console.log(`     userIdNum: ${userIdNum} (type: ${typeof userIdNum})`);
                console.log(`     wasNotified: ${wasNotified}`);
              }
            } catch (parseErr) {
              console.warn(`⚠️  Could not parse notified_vendor_ids for order ${order.id}:`, parseErr.message);
            }
          } else {
            console.log(`   Order ${order.order_number || order.id} has no notified_vendor_ids field`);
            // Debug: Show what fields the order has
            console.log(`     Available fields: ${Object.keys(order).filter(k => k.includes('notified') || k.includes('vendor') || k.includes('shop')).join(', ') || 'none'}`);
          }

          if (!wasNotified) {
            console.log(`   ❌ Order ${order.order_number || order.id} was NOT notified to this vendor, skipping`);
            return false;
          }

          console.log(`   ✅ Order ${order.order_number || order.id} WAS notified to this vendor`);

          // Check if accepted by someone else
          if (user_type === 'D') {
            // For delivery, check if delv_id is different
            const orderDelvId = order.delv_id ? parseInt(order.delv_id) : null;
            const isAcceptedByOther = orderDelvId && orderDelvId !== userIdNum;
            console.log(`   Order ${order.order_number || order.id}: delv_id=${orderDelvId}, userIdNum=${userIdNum}, isAcceptedByOther=${isAcceptedByOther}`);
            return isAcceptedByOther;
          } else {
            // For vendors, check if shop_id is different
            const orderShopId = order.shop_id ? parseInt(order.shop_id) : null;

            // If vendorShopId is null, we can't determine if it was accepted by someone else
            // This shouldn't happen for B2C vendors, but handle it gracefully
            if (!vendorShopId) {
              console.warn(`   ⚠️  Order ${order.order_number || order.id}: vendorShopId is null, cannot determine if accepted by other`);
              return false;
            }

            // Order must have a shop_id (was accepted by someone) and it must be different from this vendor's shop_id
            const isAcceptedByOther = orderShopId && orderShopId !== vendorShopId;
            console.log(`   Order ${order.order_number || order.id}: shop_id=${orderShopId}, vendorShopId=${vendorShopId}, isAcceptedByOther=${isAcceptedByOther}`);

            if (!isAcceptedByOther) {
              if (!orderShopId) {
                console.log(`     ⚠️  Order has no shop_id (not yet accepted by anyone)`);
              } else if (orderShopId === vendorShopId) {
                console.log(`     ⚠️  Order was accepted by THIS vendor (shop_id matches)`);
              }
            } else {
              console.log(`     ✅ Order was accepted by a DIFFERENT vendor`);
            }

            return isAcceptedByOther;
          }
        });

        console.log(`📦 [getCompletedPickups] Found ${acceptedByOthers.length} order(s) that were notified to this vendor but accepted by others`);

        if (acceptedByOthers.length > 0) {
          console.log(`   Order numbers:`, acceptedByOthers.map(o => o.order_number || o.order_no || o.id).join(', '));
        }

        // Add accepted_by_other flag and status_label to these orders
        // Set status to 6 for display purposes (Accepted by other Partner)
        acceptedByOthers.forEach(order => {
          order.accepted_by_other = true;
          order.status_label = 'Accepted by other Partner';
          order.status = 6; // Set status to 6 for orders accepted by others
          console.log(`   ✅ Marked order ${order.order_number || order.order_no || order.id} as accepted_by_other=true, status=6`);
        });

        // Combine with completed orders (avoid duplicates)
        const existingOrderIds = new Set(orders.map(o => o.id));
        const newAcceptedByOthers = acceptedByOthers.filter(o => !existingOrderIds.has(o.id));
        orders = [...orders, ...newAcceptedByOthers];

        console.log(`📊 [getCompletedPickups] Final order count: ${orders.length} (${orders.filter(o => o.status === 5).length} completed, ${newAcceptedByOthers.length} accepted by others with status 6)`);
      } catch (error) {
        console.error('❌ Error fetching orders accepted by others:', error);
        // Continue with just completed orders if this fails
      }

      // Also get orders that were cancelled by this vendor
      // These orders should appear in "My Orders" with "Cancelled" status (status 7)
      try {
        console.log(`🔍 [getCompletedPickups] Looking for orders cancelled by user_id=${userIdNum}, user_type=${user_type}`);

        // Scan for orders with status 1 (Scheduled) that were cancelled by this vendor
        const cancelledOrdersCommand = new ScanCommand({
          TableName: 'orders',
          FilterExpression: '#status = :status1',
          ExpressionAttributeNames: {
            '#status': 'status'
          },
          ExpressionAttributeValues: {
            ':status1': 1 // Scheduled
          }
        });

        const cancelledOrdersResponse = await client.send(cancelledOrdersCommand);
        const allScheduledOrders = cancelledOrdersResponse.Items || [];

        console.log(`📦 [getCompletedPickups] Found ${allScheduledOrders.length} total order(s) with status 1`);

        // Filter orders that were cancelled by this vendor
        const cancelledByVendor = allScheduledOrders.filter(order => {
          // Check if this vendor cancelled this order
          if (order.vendor_cancellations) {
            try {
              const cancellations = typeof order.vendor_cancellations === 'string'
                ? JSON.parse(order.vendor_cancellations)
                : order.vendor_cancellations;

              if (Array.isArray(cancellations)) {
                // Check if this vendor (user_id) cancelled this order
                const hasCancelled = cancellations.some(cancellation => {
                  const cancelUserId = typeof cancellation.user_id === 'string'
                    ? parseInt(cancellation.user_id)
                    : cancellation.user_id;
                  return cancelUserId === userIdNum;
                });

                if (hasCancelled) {
                  console.log(`   ✅ Order ${order.order_number || order.id} was cancelled by vendor ${userIdNum}`);
                  return true;
                }
              }
            } catch (parseErr) {
              console.warn(`⚠️  Could not parse vendor_cancellations for order ${order.id}:`, parseErr.message);
            }
          }
          return false;
        });

        console.log(`📦 [getCompletedPickups] Found ${cancelledByVendor.length} order(s) cancelled by this vendor`);

        if (cancelledByVendor.length > 0) {
          console.log(`   Order numbers:`, cancelledByVendor.map(o => o.order_number || o.order_no || o.id).join(', '));
        }

        // Add cancelled status to these orders
        cancelledByVendor.forEach(order => {
          order.cancelled_by_vendor = true;
          order.status_label = 'Cancelled';
          order.status = 7; // Set status to 7 for cancelled orders

          // Get cancellation reason for this vendor
          if (order.vendor_cancellations) {
            try {
              const cancellations = typeof order.vendor_cancellations === 'string'
                ? JSON.parse(order.vendor_cancellations)
                : order.vendor_cancellations;

              if (Array.isArray(cancellations)) {
                const vendorCancellation = cancellations.find(cancellation => {
                  const cancelUserId = typeof cancellation.user_id === 'string'
                    ? parseInt(cancellation.user_id)
                    : cancellation.user_id;
                  return cancelUserId === userIdNum;
                });

                if (vendorCancellation) {
                  order.cancellation_reason = vendorCancellation.cancellation_reason;
                  order.cancelled_at = vendorCancellation.cancelled_at;
                }
              }
            } catch (parseErr) {
              console.warn('⚠️  Could not parse vendor_cancellations:', parseErr.message);
            }
          }

          console.log(`   ✅ Marked order ${order.order_number || order.order_no || order.id} as cancelled (status=7)`);
        });

        // Combine with completed orders (avoid duplicates)
        const existingOrderIds = new Set(orders.map(o => o.id));
        const newCancelledOrders = cancelledByVendor.filter(o => !existingOrderIds.has(o.id));
        orders = [...orders, ...newCancelledOrders];

        console.log(`📊 [getCompletedPickups] Final order count: ${orders.length} (${orders.filter(o => o.status === 5).length} completed, ${orders.filter(o => o.status === 6).length} accepted by others, ${newCancelledOrders.length} cancelled)`);
      } catch (error) {
        console.error('❌ Error fetching cancelled orders:', error);
        // Continue with just completed orders if this fails
      }

      // Get unique customer IDs and fetch customer data
      const Customer = require('../models/Customer');
      const customerIds = [...new Set(orders.map(o => o.customer_id).filter(Boolean))];
      const customers = await Promise.all(
        customerIds.map(async (id) => {
          try {
            let customer = await Customer.findById(id);
            if (customer) return customer;
            customer = await Customer.findByUserId(id);
            if (customer) return customer;
            const User = require('../models/User');
            const user = await User.findById(id);
            if (user) {
              return {
                id: id,
                name: user.name || null,
                contact: user.mob_num || null
              };
            }
            return null;
          } catch (err) {
            console.error(`Error fetching customer ${id}:`, err);
            return null;
          }
        })
      );

      const customerMap = {};
      customers.forEach(c => {
        if (c) customerMap[c.id] = c;
      });

      // Format orders similar to getActivePickup
      const formattedOrders = orders.map(order => {
        const customer = customerMap[order.customer_id];

        // Parse orderdetails
        let orderItems = [];
        if (order.orderdetails) {
          try {
            orderItems = typeof order.orderdetails === 'string'
              ? JSON.parse(order.orderdetails)
              : Array.isArray(order.orderdetails)
                ? order.orderdetails
                : [];
          } catch (parseError) {
            console.error('Error parsing orderdetails:', parseError);
            orderItems = [];
          }
        }

        // Parse latitude and longitude - match getActivePickup logic
        // Priority: 1) lat_log (most reliable), 2) latitude/longitude fields, 3) null
        let latitude = null;
        let longitude = null;
        
        // First, try to parse from lat_log (same as getActivePickup)
        if (order.lat_log) {
          try {
            const [lat, lng] = order.lat_log.split(',').map(Number);
            if (!isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0) {
              latitude = lat;
              longitude = lng;
              console.log(`✅ [getCompletedPickups] Parsed coordinates from lat_log for order ${order.id}: ${latitude}, ${longitude}`);
            }
          } catch (parseError) {
            console.warn(`⚠️  [getCompletedPickups] Error parsing lat_log for order ${order.id}:`, parseError.message);
          }
        }
        
        // If lat_log parsing failed or lat_log is empty, try latitude/longitude fields
        if ((!latitude || !longitude) && (order.latitude || order.longitude)) {
          const lat = order.latitude ? parseFloat(order.latitude) : null;
          const lng = order.longitude ? parseFloat(order.longitude) : null;
          if (lat !== null && lng !== null && !isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0) {
            latitude = lat;
            longitude = lng;
            console.log(`✅ [getCompletedPickups] Using latitude/longitude fields for order ${order.id}: ${latitude}, ${longitude}`);
          }
        }

        return {
          order_id: order.id,
          order_number: order.order_number || order.order_no,
          customer_id: order.customer_id,
          customer_name: customer?.name || null,
          customer_phone: customer?.contact || customer?.mob_num || null,
          address: order.customerdetails || order.address || null,
          latitude: latitude,
          longitude: longitude,
          scrap_description: order.scrap_description || null,
          estimated_weight_kg: order.estim_weight || order.estimated_weight_kg || null,
          estimated_price: order.estim_price || order.estimated_price || null,
          status: order.status, // Will be 6 for orders accepted by others, 5 for completed orders, 7 for cancelled
          status_label: order.status_label || (order.status === 5 ? 'Completed' : order.status === 6 ? 'Accepted by other Partner' : order.status === 7 ? 'Cancelled' : null), // Status label for display
          accepted_by_other: order.accepted_by_other || false, // Flag to indicate accepted by other vendor
          cancelled_by_vendor: order.cancelled_by_vendor || false, // Flag to indicate cancelled by this vendor
          cancellation_reason: order.cancellation_reason || null, // Cancellation reason if cancelled
          cancelled_at: order.cancelled_at || null, // Cancellation timestamp if cancelled
          preferred_pickup_time: order.preferred_pickup_time,
          created_at: order.created_at,
          accepted_at: order.accepted_at,
          pickup_initiated_at: order.pickup_initiated_at,
          arrived_at: order.arrived_at,
          pickup_completed_at: order.pickup_completed_at,
          images: [
            order.image1,
            order.image2,
            order.image3,
            order.image4,
            order.image5,
            order.image6
          ].filter(Boolean),
          orderdetails: orderItems // Include parsed order items with payment details
        };
      });

      // Filter to only include orders with status 5 (completed), status 6 (accepted by others), or status 7 (cancelled)
      const filteredOrders = formattedOrders.filter(order => order.status === 5 || order.status === 6 || order.status === 7);

      console.log(`📊 [getCompletedPickups] Filtered orders: ${filteredOrders.length} (status 5: ${filteredOrders.filter(o => o.status === 5).length}, status 6: ${filteredOrders.filter(o => o.status === 6).length}, status 7: ${filteredOrders.filter(o => o.status === 7).length})`);

      // Sort orders: Status 6 (Accepted by others) first, then Status 7 (Cancelled), then Status 5 (Completed)
      // Within each status group, sort by date descending (most recent first)
      filteredOrders.sort((a, b) => {
        // First, sort by status: 6 comes before 7, 7 comes before 5
        if (a.status !== b.status) {
          // Status priority: 6 > 7 > 5
          if (a.status === 6) return -1;
          if (b.status === 6) return 1;
          if (a.status === 7) return -1;
          if (b.status === 7) return 1;
          return b.status - a.status;
        }

        // If same status, sort by date descending (most recent first)
        // For cancelled orders, use cancelled_at if available
        const dateA = a.status === 7 && a.cancelled_at
          ? new Date(a.cancelled_at).getTime()
          : (a.pickup_completed_at
            ? new Date(a.pickup_completed_at).getTime()
            : (a.accepted_at ? new Date(a.accepted_at).getTime() : new Date(a.created_at).getTime()));
        const dateB = b.status === 7 && b.cancelled_at
          ? new Date(b.cancelled_at).getTime()
          : (b.pickup_completed_at
            ? new Date(b.pickup_completed_at).getTime()
            : (b.accepted_at ? new Date(b.accepted_at).getTime() : new Date(b.created_at).getTime()));
        return dateB - dateA;
      });

      return res.json({
        status: 'success',
        msg: 'Completed pickups retrieved successfully',
        data: filteredOrders,
        hitBy: 'DynamoDB'
      });
    } catch (error) {
      console.error('Error fetching completed pickups:', error);
      return res.status(500).json({
        status: 'error',
        msg: 'Failed to fetch completed pickups',
        data: null
      });
    }
  }
}

/**
 * Calculate distance between two coordinates using Haversine formula
 * @param {number} lat1 
 * @param {number} lon1 
 * @param {number} lat2 
 * @param {number} lon2 
 * @returns {number} Distance in kilometers
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Radius of the Earth in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;
  return distance;
}

/**
 * POST /api/v2/orders/pickup-request/:orderId/start-pickup
 * Start pickup (vendor clicks "Myself Pickup")
 * Body: { user_id: number, user_type: 'R'|'S'|'SR'|'D' }
 */
V2OrderController.startPickup = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { user_id, user_type } = req.body;

    if (!user_id || !user_type) {
      return res.status(400).json({
        status: 'error',
        msg: 'user_id and user_type are required',
        data: null
      });
    }

    // Validate user type
    const validTypes = ['R', 'S', 'SR', 'D'];
    if (!validTypes.includes(user_type)) {
      return res.status(400).json({
        status: 'error',
        msg: 'Invalid user_type. Must be R, S, SR, or D',
        data: null
      });
    }

    // Find order - try multiple lookup methods
    const client = require('../config/dynamodb').getDynamoDBClient();
    const { GetCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');
    const Order = require('../models/Order');
    let orders = [];

    console.log(`🔍 [startPickup] Looking for order with ID: ${orderId} (type: ${typeof orderId})`);

    // Try 1: If orderId is numeric, try findByOrderNo first
    const orderIdNum = !isNaN(orderId) && orderId !== '' ? parseInt(orderId) : null;
    if (orderIdNum) {
      try {
        orders = await Order.findByOrderNo(orderIdNum);
        console.log(`📦 [startPickup] Found ${orders.length} order(s) by order number ${orderIdNum}`);
      } catch (e) {
        console.log(`⚠️  [startPickup] Error finding by order number: ${e.message}`);
      }
    }

    // Try 2: If not found, try by order ID (string)
    if (orders.length === 0) {
      try {
        const getCommand = new GetCommand({
          TableName: 'orders',
          Key: { id: orderId }
        });
        const response = await client.send(getCommand);
        if (response.Item) {
          orders = [response.Item];
          console.log(`📦 [startPickup] Found order by ID (string): ${orderId}`);
        }
      } catch (e) {
        console.log(`⚠️  [startPickup] Error getting order by ID (string): ${e.message}`);
      }
    }

    // Try 3: If still not found and orderId is numeric, try as numeric ID
    if (orders.length === 0 && orderIdNum) {
      try {
        const getCommand = new GetCommand({
          TableName: 'orders',
          Key: { id: orderIdNum }
        });
        const response = await client.send(getCommand);
        if (response.Item) {
          orders = [response.Item];
          console.log(`📦 [startPickup] Found order by ID (numeric): ${orderIdNum}`);
        }
      } catch (e) {
        console.log(`⚠️  [startPickup] Error getting order by ID (numeric): ${e.message}`);
      }
    }

    // Try 4: Try by order_number field (scan)
    if (orders.length === 0) {
      try {
        const scanCommand = new ScanCommand({
          TableName: 'orders',
          FilterExpression: 'order_number = :orderNo OR order_no = :orderNo',
          ExpressionAttributeValues: {
            ':orderNo': orderIdNum || orderId
          }
        });
        const response = await client.send(scanCommand);
        orders = response.Items || [];
        console.log(`📦 [startPickup] Found ${orders.length} order(s) by order_number/order_no: ${orderIdNum || orderId}`);
      } catch (scanError) {
        console.error(`❌ [startPickup] Error scanning by order_number/order_no: ${scanError.message}`);
      }
    }

    if (!orders || orders.length === 0) {
      return res.status(404).json({
        status: 'error',
        msg: 'Order not found',
        data: null
      });
    }

    const order = orders[0];
    console.log(`📋 [startPickup] Order found: #${order.order_number || order.order_no}, Status: ${order.status}, Shop ID: ${order.shop_id}`);

    // Check if order is accepted (status 2) and assigned to this vendor
    if (order.status !== 2) {
      console.error(`❌ [startPickup] Order status is ${order.status}, expected 2 (Accepted)`);
      return res.status(400).json({
        status: 'error',
        msg: `Order must be accepted before starting pickup. Current status: ${order.status}`,
        data: null
      });
    }

    // Verify order is assigned to this vendor
    let vendorShopId = null;
    if (user_type === 'R' || user_type === 'S' || user_type === 'SR') {
      const Shop = require('../models/Shop');
      
      // For SR users, check all shops to find the one that matches the order's shop_id
      // For R users, find B2C shop (shop_type = 3) to ensure consistency
      // For S users, use findByUserId
      if (user_type === 'SR') {
        // SR users can have multiple shops - check if order's shop_id belongs to any of their shops
        const allShops = await Shop.findAllByUserId(parseInt(user_id));
        const orderShopId = order.shop_id ? parseInt(order.shop_id) : null;
        
        if (orderShopId) {
          const matchingShop = allShops.find(s => parseInt(s.id) === orderShopId);
          if (matchingShop) {
            vendorShopId = parseInt(matchingShop.id);
            console.log(`✅ [startPickup] SR user: Found matching shop ${vendorShopId} (shop_type: ${matchingShop.shop_type}) for order shop_id ${orderShopId}`);
          } else {
            console.error(`❌ [startPickup] SR user: Order shop_id ${orderShopId} does not match any of user's shops:`, allShops.map(s => ({ id: s.id, shop_type: s.shop_type })));
          }
        } else {
          console.error(`❌ [startPickup] SR user: Order has no shop_id`);
        }
      } else if (user_type === 'R') {
        // For R users (B2C), find B2C shop (shop_type = 3) to ensure consistency
        const allShops = await Shop.findAllByUserId(parseInt(user_id));
        const b2cShop = allShops.find(s => parseInt(s.shop_type) === 3);
        if (b2cShop && b2cShop.id) {
          vendorShopId = parseInt(b2cShop.id);
          console.log(`✅ [startPickup] R user: Found B2C shop ${vendorShopId} (shop_type=3) for user ${user_id}`);
        }
      } else {
        // For S users, use findByUserId
        const shop = await Shop.findByUserId(parseInt(user_id));
        if (shop && shop.id) {
          vendorShopId = parseInt(shop.id);
          console.log(`✅ [startPickup] S user: Found shop ${vendorShopId} for user ${user_id}`);
        }
      }
      
      if (!vendorShopId) {
        console.error(`❌ [startPickup] No shop found for user ${user_id} (user_type: ${user_type})`);
        return res.status(403).json({
          status: 'error',
          msg: `No shop found for your account. Please contact support.`,
          data: null
        });
      }
      
      console.log(`🏪 [startPickup] Vendor shop ID: ${vendorShopId}, Order shop ID: ${order.shop_id}`);
      
      if (parseInt(order.shop_id) !== vendorShopId) {
        console.error(`❌ [startPickup] Order shop_id (${order.shop_id}) does not match vendor shop_id (${vendorShopId})`);
        return res.status(403).json({
          status: 'error',
          msg: `Order is not assigned to you. Order shop_id: ${order.shop_id}, Your shop_id: ${vendorShopId}`,
          data: null
        });
      }
    } else if (user_type === 'D') {
      if (parseInt(order.delv_id) !== parseInt(user_id) && parseInt(order.delv_boy_id) !== parseInt(user_id)) {
        console.error(`❌ [startPickup] Order not assigned to delivery user ${user_id}`);
        return res.status(403).json({
          status: 'error',
          msg: 'Order is not assigned to you',
          data: null
        });
      }
    }

    // Update order status to 3 (Pickup Initiated)
    const UpdateCommand = require('@aws-sdk/lib-dynamodb').UpdateCommand;
    // client is already declared above in the order lookup section

    const command = new UpdateCommand({
      TableName: 'orders',
      Key: { id: order.id },
      UpdateExpression: 'SET #status = :status, pickup_initiated_at = :initiatedAt, updated_at = :updatedAt',
      ExpressionAttributeNames: {
        '#status': 'status'
      },
      ExpressionAttributeValues: {
        ':status': 3, // 3 = Pickup Initiated
        ':initiatedAt': new Date().toISOString(),
        ':updatedAt': new Date().toISOString()
      }
    });

    await client.send(command);

    // Invalidate caches
    try {
      await RedisCache.invalidateV2ApiCache('active_pickup', user_id, {
        user_type: user_type
      });
      if (order.customer_id) {
        await RedisCache.invalidateV2ApiCache('active_pickup', order.customer_id, {
          user_type: 'U'
        });
      }
      await RedisCache.invalidateV2ApiCache('order', null, {
        order_id: order.id,
        customer_id: order.customer_id,
        user_id: user_id,
        user_type: user_type
      });
    } catch (err) {
      console.error('Cache invalidation error:', err);
    }

    // Send FCM notification to customer when pickup is started (myself pickup)
    console.log(`📢 [startPickup] Starting customer notification process for order ${order.id}, customer_id: ${order.customer_id}`);

    try {
      // Get vendor/partner name
      let partnerName = 'Partner';
      if (user_type === 'R' || user_type === 'S' || user_type === 'SR') {
        const Shop = require('../models/Shop');
        const shop = await Shop.findByUserId(parseInt(user_id));
        console.log(`🔍 [startPickup] Getting partner name for user_id=${user_id}, user_type=${user_type}, shop=${shop ? `found (id: ${shop.id})` : 'not found'}`);

        if (shop) {
          // For B2B users (S, SR with company_name), prioritize company_name
          if ((user_type === 'S' || user_type === 'SR') && shop.company_name && shop.company_name.trim() !== '') {
            partnerName = shop.company_name;
            console.log(`✅ Using company_name: ${partnerName}`);
          }
          // For B2C users (R) or when company_name is not available, check shopname and ownername
          // Skip placeholder shopnames (starting with "User_" or "user_")
          else if (shop.shopname && shop.shopname.trim() !== '' && !shop.shopname.startsWith('User_') && !shop.shopname.startsWith('user_')) {
            partnerName = shop.shopname;
            console.log(`✅ Using shopname: ${partnerName}`);
          } else if (shop.ownername && shop.ownername.trim() !== '') {
            partnerName = shop.ownername;
            console.log(`✅ Using ownername: ${partnerName}`);
          } else {
            // Fallback to user name only if it's not a placeholder (doesn't start with 'user_')
            // IMPORTANT: Ensure we get the vendor_app user, not customer_app user
            const vendorUser = await User.findById(parseInt(user_id));
            console.log(`🔍 [startPickup] Fallback to user name - vendorUser: ${vendorUser ? `found (id: ${vendorUser.id}, app_type: ${vendorUser.app_type}, name: ${vendorUser.name})` : 'not found'}`);

            if (vendorUser) {
              // CRITICAL: Only use vendor_app users, not customer_app users
              if (vendorUser.app_type === 'vendor_app' && vendorUser.name && vendorUser.name.trim() !== '' && !vendorUser.name.startsWith('user_') && !vendorUser.name.startsWith('User_')) {
                partnerName = vendorUser.name;
                console.log(`✅ Using vendor_app user name: ${partnerName}`);
              } else if (!vendorUser.app_type && vendorUser.user_type !== 'C' && vendorUser.name && vendorUser.name.trim() !== '' && !vendorUser.name.startsWith('user_') && !vendorUser.name.startsWith('User_')) {
                // Fallback for v1 users (no app_type) - ensure it's not a customer type
                partnerName = vendorUser.name;
                console.log(`✅ Using v1 vendor user name: ${partnerName}`);
              } else {
                console.warn(`⚠️  Skipping user name - app_type: ${vendorUser.app_type}, user_type: ${vendorUser.user_type}, name: ${vendorUser.name}`);
              }
            }
          }
        } else {
          // No shop found, try to get user name (but not placeholder names)
          // IMPORTANT: Ensure we get the vendor_app user, not customer_app user
          const vendorUser = await User.findById(parseInt(user_id));
          console.log(`🔍 [startPickup] No shop found - checking user: ${vendorUser ? `found (id: ${vendorUser.id}, app_type: ${vendorUser.app_type}, name: ${vendorUser.name})` : 'not found'}`);

          if (vendorUser) {
            // CRITICAL: Only use vendor_app users, not customer_app users
            if (vendorUser.app_type === 'vendor_app' && vendorUser.name && vendorUser.name.trim() !== '' && !vendorUser.name.startsWith('user_') && !vendorUser.name.startsWith('User_')) {
              partnerName = vendorUser.name;
              console.log(`✅ Using vendor_app user name: ${partnerName}`);
            } else if (!vendorUser.app_type && vendorUser.user_type !== 'C' && vendorUser.name && vendorUser.name.trim() !== '' && !vendorUser.name.startsWith('user_') && !vendorUser.name.startsWith('User_')) {
              // Fallback for v1 users (no app_type) - ensure it's not a customer type
              partnerName = vendorUser.name;
              console.log(`✅ Using v1 vendor user name: ${partnerName}`);
            } else {
              console.warn(`⚠️  Skipping user name - app_type: ${vendorUser.app_type}, user_type: ${vendorUser.user_type}, name: ${vendorUser.name}`);
            }
          }
        }
      } else if (user_type === 'D') {
        const DeliveryBoy = require('../models/DeliveryBoy');
        const deliveryBoy = await DeliveryBoy.findByUserId(parseInt(user_id));
        if (deliveryBoy && deliveryBoy.name) {
          partnerName = deliveryBoy.name;
        } else {
          const vendorUser = await User.findById(parseInt(user_id));
          if (vendorUser && vendorUser.name) {
            partnerName = vendorUser.name;
          }
        }
      }

      console.log(`📢 [startPickup] Final partner name for notification: ${partnerName}`);

      // Get customer FCM token
      // IMPORTANT: Must find customer_app user, not vendor_app user
      let customerFcmToken = null;
      if (order.customer_id) {
        let customerUser = null;
        try {
          const Customer = require('../models/Customer');
          let customer = await Customer.findById(order.customer_id);
          if (!customer) {
            customer = await Customer.findByUserId(order.customer_id);
          }

          if (customer && customer.user_id) {
            // Found customer record, get the user
            customerUser = await User.findById(customer.user_id);
            console.log(`🔍 [startPickup] Found customer record - user_id: ${customer.user_id}, customerUser: ${customerUser ? `found (id: ${customerUser.id}, app_type: ${customerUser.app_type})` : 'not found'}`);
          } else {
            // customer_id might be user_id directly - try to find customer_app user
            customerUser = await User.findById(order.customer_id);
            console.log(`🔍 [startPickup] customer_id is user_id - customerUser: ${customerUser ? `found (id: ${customerUser.id}, app_type: ${customerUser.app_type})` : 'not found'}`);
          }

          // CRITICAL: Ensure we have a customer_app user, not vendor_app user
          if (customerUser) {
            if (customerUser.app_type === 'customer_app' && customerUser.fcm_token) {
              customerFcmToken = customerUser.fcm_token;
              console.log(`✅ Found customer_app user with FCM token for customer_id ${order.customer_id}`);
            } else if (customerUser.app_type !== 'customer_app') {
              // If user is not customer_app, try to find customer_app user by phone number
              console.log(`⚠️  User ${customerUser.id} is not customer_app (app_type: ${customerUser.app_type}), trying to find customer_app user by phone...`);
              if (customerUser.mob_num) {
                // Find all users with this phone number and get customer_app user
                const { getDynamoDBClient } = require('../config/dynamodb');
                const { ScanCommand } = require('@aws-sdk/lib-dynamodb');
                const client = getDynamoDBClient();

                let lastKey = null;
                const allUsers = [];

                do {
                  const params = {
                    TableName: 'users',
                    FilterExpression: 'mob_num = :mobile AND (attribute_not_exists(del_status) OR del_status <> :deleted)',
                    ExpressionAttributeValues: {
                      ':mobile': customerUser.mob_num,
                      ':deleted': 2
                    }
                  };

                  if (lastKey) {
                    params.ExclusiveStartKey = lastKey;
                  }

                  const command = new ScanCommand(params);
                  const response = await client.send(command);

                  if (response.Items && response.Items.length > 0) {
                    allUsers.push(...response.Items);
                  }

                  lastKey = response.LastEvaluatedKey;
                } while (lastKey);

                // Find customer_app user with FCM token
                const customerAppUser = allUsers.find(u => u.app_type === 'customer_app' && u.fcm_token);
                if (customerAppUser) {
                  customerFcmToken = customerAppUser.fcm_token;
                  console.log(`✅ Found customer_app user with FCM token by phone lookup (user_id: ${customerAppUser.id})`);
                } else {
                  console.warn(`⚠️  No customer_app user with FCM token found for phone ${customerUser.mob_num}`);
                }
              }
            } else if (customerUser.app_type === 'customer_app' && !customerUser.fcm_token) {
              console.warn(`⚠️  Customer_app user ${customerUser.id} found but has no FCM token`);
            }
          }
        } catch (customerErr) {
          console.error('❌ Error fetching customer FCM token:', customerErr);
          console.error('   Error details:', customerErr.message);
        }
      }

      // Send notification to customer if FCM token exists
      // CRITICAL: Customer must be notified when pickup is started
      if (customerFcmToken) {
        console.log(`📤 [startPickup] Sending notification to customer_app user with FCM token`);
        console.log(`   Customer ID: ${order.customer_id}`);
        console.log(`   Partner Name: ${partnerName}`);
        console.log(`   Order ID: ${order.id}`);
        console.log(`   Order Number: ${order.order_number || order.order_no || 'N/A'}`);

        // Use customer app Firebase service account for customer notifications
        const { sendCustomerNotification } = require('../utils/fcmNotification');
        try {
          const notificationResult = await sendCustomerNotification(
            customerFcmToken,
            'Pickup Started',
            `${partnerName} has started the pickup for your order`,
            {
              type: 'pickup_started',
              order_id: String(order.id),
              order_number: String(order.order_number || order.order_no || ''),
              partner_name: partnerName,
              screen: 'MyOrders'
            }
          );

          if (notificationResult && notificationResult.success) {
            console.log(`✅ [startPickup] Successfully sent FCM notification to customer ${order.customer_id} about pickup start`);
            console.log(`   Message ID: ${notificationResult.messageId || 'N/A'}`);
          } else {
            console.error(`❌ [startPickup] Failed to send notification - result:`, notificationResult);
          }
        } catch (sendErr) {
          console.error(`❌ [startPickup] Error calling sendCustomerNotification:`, sendErr);
          console.error(`   Error message: ${sendErr.message}`);
          console.error(`   Error stack: ${sendErr.stack}`);
          // Don't fail the request, but log the error
        }
      } else {
        console.warn(`⚠️  [startPickup] No FCM token found for customer ${order.customer_id}`);
        console.warn(`   This means the customer will NOT receive a notification about pickup being started`);
        console.warn(`   Customer ID: ${order.customer_id}`);
        console.warn(`   Please ensure the customer_app user has registered their FCM token`);
      }
    } catch (notificationErr) {
      console.error('❌ [startPickup] Critical error in customer notification process:', notificationErr);
      console.error('   Error name:', notificationErr.name);
      console.error('   Error message:', notificationErr.message);
      console.error('   Error stack:', notificationErr.stack);
      // Don't fail the request, but log the error
    }

    return res.json({
      status: 'success',
      msg: 'Pickup initiated successfully',
      data: {
        order_id: order.id,
        order_number: order.order_number,
        status: 3 // 3 = Pickup Initiated
      }
    });
  } catch (error) {
    console.error('Error starting pickup:', error);
    const errorMessage = error.message || 'Failed to start pickup';
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({
      status: 'error',
      msg: errorMessage,
      data: null
    });
  }
};

/**
 * POST /api/v2/orders/pickup-request/:orderId/arrived-location
 * Mark order as arrived at location (status 4)
 * Body: { user_id: number, user_type: 'R'|'S'|'SR'|'D' }
 */
V2OrderController.arrivedLocation = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { user_id, user_type } = req.body;

    if (!user_id || !user_type) {
      return res.status(400).json({
        status: 'error',
        msg: 'user_id and user_type are required',
        data: null
      });
    }

    // Validate user type
    const validTypes = ['R', 'S', 'SR', 'D'];
    if (!validTypes.includes(user_type)) {
      return res.status(400).json({
        status: 'error',
        msg: 'Invalid user_type. Must be R, S, SR, or D',
        data: null
      });
    }

    const client = require('../config/dynamodb').getDynamoDBClient();
    const { GetCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');
    const Order = require('../models/Order');

    // Comprehensive order lookup (same as startPickup)
    console.log(`🔍 [arrivedLocation] Attempting to find order with identifier: ${orderId}`);
    const orderIdNum = !isNaN(orderId) ? parseInt(orderId) : null;
    let orders = [];

    // Try 1: Find by order number (numeric)
    if (orderIdNum) {
      try {
        orders = await Order.findByOrderNo(orderIdNum);
        console.log(`📦 [arrivedLocation] Found ${orders.length} order(s) by order number ${orderIdNum}`);
      } catch (e) {
        console.log(`⚠️  [arrivedLocation] Error finding by order number: ${e.message}`);
      }
    }

    // Try 2: If not found, try by order ID (string)
    if (orders.length === 0) {
      try {
        const getCommand = new GetCommand({
          TableName: 'orders',
          Key: { id: orderId }
        });
        const response = await client.send(getCommand);
        if (response.Item) {
          orders = [response.Item];
          console.log(`📦 [arrivedLocation] Found order by ID (string): ${orderId}`);
        }
      } catch (e) {
        console.log(`⚠️  [arrivedLocation] Error getting order by ID (string): ${e.message}`);
      }
    }

    // Try 3: If still not found and orderId is numeric, try as numeric ID
    if (orders.length === 0 && orderIdNum) {
      try {
        const getCommand = new GetCommand({
          TableName: 'orders',
          Key: { id: orderIdNum }
        });
        const response = await client.send(getCommand);
        if (response.Item) {
          orders = [response.Item];
          console.log(`📦 [arrivedLocation] Found order by ID (numeric): ${orderIdNum}`);
        }
      } catch (e) {
        console.log(`⚠️  [arrivedLocation] Error getting order by ID (numeric): ${e.message}`);
      }
    }

    // Try 4: Try by order_number field (scan)
    if (orders.length === 0) {
      try {
        const scanCommand = new ScanCommand({
          TableName: 'orders',
          FilterExpression: 'order_number = :orderNo OR order_no = :orderNo',
          ExpressionAttributeValues: {
            ':orderNo': orderIdNum || orderId
          }
        });
        const response = await client.send(scanCommand);
        orders = response.Items || [];
        console.log(`📦 [arrivedLocation] Found ${orders.length} order(s) by order_number/order_no: ${orderIdNum || orderId}`);
      } catch (scanError) {
        console.error(`❌ [arrivedLocation] Error scanning by order_number/order_no: ${scanError.message}`);
      }
    }

    if (!orders || orders.length === 0) {
      console.error(`❌ [arrivedLocation] Order not found for identifier: ${orderId}`);
      return res.status(404).json({
        status: 'error',
        msg: 'Order not found',
        data: null
      });
    }

    if (!orders || orders.length === 0) {
      return res.status(404).json({
        status: 'error',
        msg: 'Order not found',
        data: null
      });
    }

    const order = orders[0];
    console.log(`📋 [arrivedLocation] Order found: #${order.order_number || order.order_no}, Status: ${order.status}, Shop ID: ${order.shop_id}`);
    console.log(`   Order fields: bulk_request_id=${order.bulk_request_id}, bulk_request_vendor_id=${order.bulk_request_vendor_id}`);

    // Check if order is a bulk request order
    // For bulk requests, the buyer (customer) collects from vendors
    // Detection: Check for bulk_request_id or bulk_request_vendor_id fields
    const isBulkRequestOrder = !!(order.bulk_request_id || order.bulk_request_vendor_id);
    console.log(`   Is bulk request order: ${isBulkRequestOrder}`);
    
    // Allow status 2 (Accepted) or 3 (Pickup Initiated) to directly transition to 4 (Arrived Location)
    // Also allow status 4 (Arrived Location) to be marked again (idempotent) - useful if user clicks button multiple times
    // This allows orders to skip status 3 if needed and go directly from 2 to 4
    // For bulk request orders, status 2 is common when buyer starts pickup
    const isValidStatus = order.status === 2 || order.status === 3 || order.status === 4;
    
    console.log(`   Is valid status: ${isValidStatus} (order.status=${order.status}, isBulkRequestOrder=${isBulkRequestOrder})`);
    
    if (!isValidStatus) {
      console.error(`❌ [arrivedLocation] Order status is ${order.status}, expected 2 (Accepted), 3 (Pickup Initiated), or 4 (Arrived Location)`);
      return res.status(400).json({
        status: 'error',
        msg: `Order must be in accepted (2), pickup initiated (3), or arrived location (4) state. Current status: ${order.status}`,
        data: null
      });
    }
    
    // If order is already at status 4, just return success (idempotent operation)
    if (order.status === 4) {
      console.log(`ℹ️  [arrivedLocation] Order is already at status 4 (Arrived Location) - returning success (idempotent)`);
      return res.json({
        status: 'success',
        msg: 'Order is already marked as arrived',
        data: {
          order_id: order.id,
          order_number: order.order_number,
          status: 4 // Already at Arrived Location
        }
      });
    }

    // Verify order is assigned to this user
    // For bulk requests, the buyer (customer_id) can mark arrived
    // For regular orders, only vendor (shop_id) or delivery person can mark arrived
    let isAuthorized = false;
    
    if (isBulkRequestOrder) {
      // For bulk requests, check if user is the buyer (customer_id)
      if (parseInt(order.customer_id) === parseInt(user_id)) {
        isAuthorized = true;
        console.log(`✅ [arrivedLocation] Authorized: User ${user_id} is the buyer (customer) for bulk request order`);
      } else {
        // Also allow vendor to mark arrived for their own bulk request order
        if (user_type === 'R' || user_type === 'S' || user_type === 'SR') {
          const Shop = require('../models/Shop');
          let vendorShopId = null;
          
          // For SR users, check all shops to find the one that matches the order's shop_id
          // For R users, find B2C shop (shop_type = 3) to ensure consistency
          // For S users, use findByUserId
          if (user_type === 'SR') {
            // SR users can have multiple shops - check if order's shop_id belongs to any of their shops
            const allShops = await Shop.findAllByUserId(parseInt(user_id));
            const orderShopId = order.shop_id ? parseInt(order.shop_id) : null;
            
            if (orderShopId) {
              const matchingShop = allShops.find(s => parseInt(s.id) === orderShopId);
              if (matchingShop) {
                vendorShopId = parseInt(matchingShop.id);
                console.log(`✅ [arrivedLocation] SR user (bulk): Found matching shop ${vendorShopId} (shop_type: ${matchingShop.shop_type}) for order shop_id ${orderShopId}`);
              }
            }
          } else if (user_type === 'R') {
            // For R users (B2C), find B2C shop (shop_type = 3) to ensure consistency
            const allShops = await Shop.findAllByUserId(parseInt(user_id));
            const b2cShop = allShops.find(s => parseInt(s.shop_type) === 3);
            if (b2cShop && b2cShop.id) {
              vendorShopId = parseInt(b2cShop.id);
            }
          } else {
            // For S users, use findByUserId
            const shop = await Shop.findByUserId(parseInt(user_id));
            if (shop && shop.id) {
              vendorShopId = parseInt(shop.id);
            }
          }
          
          if (vendorShopId && parseInt(order.shop_id) === vendorShopId) {
            isAuthorized = true;
            console.log(`✅ [arrivedLocation] Authorized: User ${user_id} is the vendor (shop ${vendorShopId}) for bulk request order`);
          }
        }
      }
    } else {
      // For regular orders, check vendor or delivery person assignment
      if (user_type === 'R' || user_type === 'S' || user_type === 'SR') {
        const Shop = require('../models/Shop');
        let vendorShopId = null;
        
        // For SR users, check all shops to find the one that matches the order's shop_id
        // For R users, find B2C shop (shop_type = 3) to ensure consistency
        // For S users, use findByUserId
        if (user_type === 'SR') {
          // SR users can have multiple shops - check if order's shop_id belongs to any of their shops
          const allShops = await Shop.findAllByUserId(parseInt(user_id));
          const orderShopId = order.shop_id ? parseInt(order.shop_id) : null;
          
          if (orderShopId) {
            const matchingShop = allShops.find(s => parseInt(s.id) === orderShopId);
            if (matchingShop) {
              vendorShopId = parseInt(matchingShop.id);
              console.log(`✅ [arrivedLocation] SR user: Found matching shop ${vendorShopId} (shop_type: ${matchingShop.shop_type}) for order shop_id ${orderShopId}`);
            } else {
              console.error(`❌ [arrivedLocation] SR user: Order shop_id ${orderShopId} does not match any of user's shops:`, allShops.map(s => ({ id: s.id, shop_type: s.shop_type })));
            }
          } else {
            console.error(`❌ [arrivedLocation] SR user: Order has no shop_id`);
          }
        } else if (user_type === 'R') {
          // For R users (B2C), find B2C shop (shop_type = 3) to ensure consistency
          const allShops = await Shop.findAllByUserId(parseInt(user_id));
          const b2cShop = allShops.find(s => parseInt(s.shop_type) === 3);
          if (b2cShop && b2cShop.id) {
            vendorShopId = parseInt(b2cShop.id);
            console.log(`✅ [arrivedLocation] R user: Found B2C shop ${vendorShopId} (shop_type=3) for user ${user_id}`);
          }
        } else {
          // For S users, use findByUserId
          const shop = await Shop.findByUserId(parseInt(user_id));
          if (shop && shop.id) {
            vendorShopId = parseInt(shop.id);
            console.log(`✅ [arrivedLocation] S user: Found shop ${vendorShopId} for user ${user_id}`);
          }
        }
        
        if (vendorShopId && parseInt(order.shop_id) === vendorShopId) {
          isAuthorized = true;
          console.log(`✅ [arrivedLocation] Authorized: Vendor shop_id ${vendorShopId} matches order shop_id ${order.shop_id}`);
        } else {
          console.error(`❌ [arrivedLocation] Not authorized: Vendor shop_id ${vendorShopId || 'not found'} does not match order shop_id ${order.shop_id}`);
        }
      } else if (user_type === 'D') {
        if (parseInt(order.delv_id) === parseInt(user_id) || parseInt(order.delv_boy_id) === parseInt(user_id)) {
          isAuthorized = true;
          console.log(`✅ [arrivedLocation] Authorized: Delivery user ${user_id} matches order delv_id/delv_boy_id`);
        }
      }
    }
    
    if (!isAuthorized) {
      return res.status(403).json({
        status: 'error',
        msg: 'Order is not assigned to you',
        data: null
      });
    }

    // Update order status to 4 (Arrived Location)
    const UpdateCommand = require('@aws-sdk/lib-dynamodb').UpdateCommand;

    const command = new UpdateCommand({
      TableName: 'orders',
      Key: { id: order.id },
      UpdateExpression: 'SET #status = :status, arrived_at = :arrivedAt, updated_at = :updatedAt',
      ExpressionAttributeNames: {
        '#status': 'status'
      },
      ExpressionAttributeValues: {
        ':status': 4, // 4 = Arrived Location
        ':arrivedAt': new Date().toISOString(),
        ':updatedAt': new Date().toISOString()
      }
    });

    await client.send(command);

    // If this is a bulk request order, update the vendor status in the bulk request to 'arrived'
    if (isBulkRequestOrder && order.bulk_request_id) {
      try {
        const { GetCommand, UpdateCommand: BulkUpdateCommand } = require('@aws-sdk/lib-dynamodb');
        
        // Get the bulk request
        const getBulkRequestCommand = new GetCommand({
          TableName: 'bulk_scrap_requests',
          Key: { id: order.bulk_request_id }
        });
        
        const bulkRequestResponse = await client.send(getBulkRequestCommand);
        const bulkRequest = bulkRequestResponse.Item;
        
        if (bulkRequest && bulkRequest.accepted_vendors) {
          let acceptedVendors = [];
          try {
            acceptedVendors = typeof bulkRequest.accepted_vendors === 'string'
              ? JSON.parse(bulkRequest.accepted_vendors)
              : bulkRequest.accepted_vendors;
          } catch (e) {
            console.warn('⚠️ Could not parse accepted_vendors:', e.message);
          }
          
          // Find and update the vendor status to 'arrived'
          const vendorUserId = order.bulk_request_vendor_id || order.shop_id;
          const vendorIndex = acceptedVendors.findIndex((v) => 
            (v.user_id && parseInt(v.user_id) === parseInt(vendorUserId)) ||
            (v.shop_id && parseInt(v.shop_id) === parseInt(order.shop_id))
          );
          
          if (vendorIndex >= 0) {
            acceptedVendors[vendorIndex].status = 'arrived';
            acceptedVendors[vendorIndex].updated_at = new Date().toISOString();
            
            // Update the bulk request
            const updateBulkRequestCommand = new BulkUpdateCommand({
              TableName: 'bulk_scrap_requests',
              Key: { id: order.bulk_request_id },
              UpdateExpression: 'SET accepted_vendors = :acceptedVendors, updated_at = :updatedAt',
              ExpressionAttributeValues: {
                ':acceptedVendors': JSON.stringify(acceptedVendors),
                ':updatedAt': new Date().toISOString()
              }
            });
            
            await client.send(updateBulkRequestCommand);
            console.log(`✅ Updated vendor status to 'arrived' in bulk request ${order.bulk_request_id}`);
          } else {
            console.warn(`⚠️ Vendor not found in accepted_vendors for bulk request ${order.bulk_request_id}`);
          }
        }
      } catch (bulkUpdateError) {
        console.error('❌ Error updating vendor status in bulk request:', bulkUpdateError);
        // Don't fail the request if bulk request update fails
      }
    }

    // Invalidate caches
    try {
      await RedisCache.invalidateV2ApiCache('active_pickup', user_id, {
        user_type: user_type
      });
      if (order.customer_id) {
        await RedisCache.invalidateV2ApiCache('active_pickup', order.customer_id, {
          user_type: 'U'
        });
      }
      await RedisCache.invalidateV2ApiCache('order', null, {
        order_id: order.id,
        customer_id: order.customer_id,
        user_id: user_id,
        user_type: user_type
      });
    } catch (err) {
      console.error('Cache invalidation error:', err);
    }

    return res.json({
      status: 'success',
      msg: 'Arrived at location successfully',
      data: {
        order_id: order.id,
        order_number: order.order_number,
        status: 4 // 4 = Arrived Location
      }
    });
  } catch (error) {
    console.error('Error marking arrived location:', error);
    return res.status(500).json({
      status: 'error',
      msg: 'Failed to mark arrived location',
      data: null
    });
  }
};

/**
 * POST /api/v2/orders/pickup-request/:orderId/complete-pickup
 * Mark order as pickup completed (status 5)
 * Body: { 
 *   user_id: number, 
 *   user_type: 'R'|'S'|'SR'|'D',
 *   payment_details?: Array<{
 *     category_id?: number | string,
 *     subcategory_id?: number | string,
 *     weight: number | string,
 *     amount: number | string
 *   }>
 * }
 */
V2OrderController.completePickup = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { user_id, user_type, payment_details } = req.body;

    if (!user_id || !user_type) {
      return res.status(400).json({
        status: 'error',
        msg: 'user_id and user_type are required',
        data: null
      });
    }

    // Validate user type
    const validTypes = ['R', 'S', 'SR', 'D'];
    if (!validTypes.includes(user_type)) {
      return res.status(400).json({
        status: 'error',
        msg: 'Invalid user_type. Must be R, S, SR, or D',
        data: null
      });
    }

    const client = require('../config/dynamodb').getDynamoDBClient();
    const { GetCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');
    const Order = require('../models/Order');

    // Comprehensive order lookup (same as startPickup and arrivedLocation)
    console.log(`🔍 [completePickup] Attempting to find order with identifier: ${orderId}`);
    const orderIdNum = !isNaN(orderId) ? parseInt(orderId) : null;
    let orders = [];

    // Try 1: Find by order number (numeric)
    if (orderIdNum) {
      try {
        orders = await Order.findByOrderNo(orderIdNum);
        console.log(`📦 [completePickup] Found ${orders.length} order(s) by order number ${orderIdNum}`);
      } catch (e) {
        console.log(`⚠️  [completePickup] Error finding by order number: ${e.message}`);
      }
    }

    // Try 2: If not found, try by order ID (string)
    if (orders.length === 0) {
      try {
        const getCommand = new GetCommand({
          TableName: 'orders',
          Key: { id: orderId }
        });
        const response = await client.send(getCommand);
        if (response.Item) {
          orders = [response.Item];
          console.log(`📦 [completePickup] Found order by ID (string): ${orderId}`);
        }
      } catch (e) {
        console.log(`⚠️  [completePickup] Error getting order by ID (string): ${e.message}`);
      }
    }

    // Try 3: If still not found and orderId is numeric, try as numeric ID
    if (orders.length === 0 && orderIdNum) {
      try {
        const getCommand = new GetCommand({
          TableName: 'orders',
          Key: { id: orderIdNum }
        });
        const response = await client.send(getCommand);
        if (response.Item) {
          orders = [response.Item];
          console.log(`📦 [completePickup] Found order by ID (numeric): ${orderIdNum}`);
        }
      } catch (e) {
        console.log(`⚠️  [completePickup] Error getting order by ID (numeric): ${e.message}`);
      }
    }

    // Try 4: Try by order_number field (scan)
    if (orders.length === 0) {
      try {
        const scanCommand = new ScanCommand({
          TableName: 'orders',
          FilterExpression: 'order_number = :orderNo OR order_no = :orderNo',
          ExpressionAttributeValues: {
            ':orderNo': orderIdNum || orderId
          }
        });
        const response = await client.send(scanCommand);
        orders = response.Items || [];
        console.log(`📦 [completePickup] Found ${orders.length} order(s) by order_number/order_no: ${orderIdNum || orderId}`);
      } catch (scanError) {
        console.error(`❌ [completePickup] Error scanning by order_number/order_no: ${scanError.message}`);
      }
    }

    if (!orders || orders.length === 0) {
      console.error(`❌ [completePickup] Order not found for identifier: ${orderId}`);
      return res.status(404).json({
        status: 'error',
        msg: 'Order not found',
        data: null
      });
    }

    const order = orders[0];
    console.log(`📋 [completePickup] Order found: #${order.order_number || order.order_no}, Status: ${order.status}, Shop ID: ${order.shop_id}`);

    // Log payment details if provided
    if (payment_details && Array.isArray(payment_details) && payment_details.length > 0) {
      console.log(`💰 [completePickup] Payment details received: ${payment_details.length} item(s)`);
      payment_details.forEach((pd, idx) => {
        console.log(`💰 [completePickup] Payment ${idx + 1}: category_id=${pd.category_id}, subcategory_id=${pd.subcategory_id}, weight=${pd.weight}, amount=${pd.amount}`);
      });
    }

    // Check if order is in arrived location state (status 4) or pickup initiated (status 3)
    if (order.status !== 3 && order.status !== 4) {
      console.error(`❌ [completePickup] Order status is ${order.status}, expected 3 (Pickup Initiated) or 4 (Arrived Location)`);
      return res.status(400).json({
        status: 'error',
        msg: `Order must be in pickup initiated or arrived location state before completing pickup. Current status: ${order.status}`,
        data: null
      });
    }

    // Verify order is assigned to this vendor
    let vendorShopId = null;
    if (user_type === 'R' || user_type === 'S' || user_type === 'SR') {
      const Shop = require('../models/Shop');
      
      // For SR users, check all shops to find the one that matches the order's shop_id
      // For R users, find B2C shop (shop_type = 3) to ensure consistency
      // For S users, use findByUserId
      if (user_type === 'SR') {
        // SR users can have multiple shops - check if order's shop_id belongs to any of their shops
        const allShops = await Shop.findAllByUserId(parseInt(user_id));
        const orderShopId = order.shop_id ? parseInt(order.shop_id) : null;
        
        if (orderShopId) {
          const matchingShop = allShops.find(s => parseInt(s.id) === orderShopId);
          if (matchingShop) {
            vendorShopId = parseInt(matchingShop.id);
            console.log(`✅ [completePickup] SR user: Found matching shop ${vendorShopId} (shop_type: ${matchingShop.shop_type}) for order shop_id ${orderShopId}`);
          } else {
            console.error(`❌ [completePickup] SR user: Order shop_id ${orderShopId} does not match any of user's shops:`, allShops.map(s => ({ id: s.id, shop_type: s.shop_type })));
          }
        } else {
          console.error(`❌ [completePickup] SR user: Order has no shop_id`);
        }
      } else if (user_type === 'R') {
        // For R users (B2C), find B2C shop (shop_type = 3) to ensure consistency
        const allShops = await Shop.findAllByUserId(parseInt(user_id));
        const b2cShop = allShops.find(s => parseInt(s.shop_type) === 3);
        if (b2cShop && b2cShop.id) {
          vendorShopId = parseInt(b2cShop.id);
          console.log(`✅ [completePickup] R user: Found B2C shop ${vendorShopId} (shop_type=3) for user ${user_id}`);
        }
      } else {
        // For S users, use findByUserId
        const shop = await Shop.findByUserId(parseInt(user_id));
        if (shop && shop.id) {
          vendorShopId = parseInt(shop.id);
          console.log(`✅ [completePickup] S user: Found shop ${vendorShopId} for user ${user_id}`);
        }
      }
      
      if (!vendorShopId) {
        console.error(`❌ [completePickup] No shop found for user ${user_id} (user_type: ${user_type})`);
        return res.status(403).json({
          status: 'error',
          msg: `No shop found for your account. Please contact support.`,
          data: null
        });
      }
      
      console.log(`🏪 [completePickup] Vendor shop ID: ${vendorShopId}, Order shop ID: ${order.shop_id}`);
      
      if (parseInt(order.shop_id) !== vendorShopId) {
        console.error(`❌ [completePickup] Order shop_id (${order.shop_id}) does not match vendor shop_id (${vendorShopId})`);
        return res.status(403).json({
          status: 'error',
          msg: `Order is not assigned to you. Order shop_id: ${order.shop_id}, Your shop_id: ${vendorShopId}`,
          data: null
        });
      }
    } else if (user_type === 'D') {
      if (parseInt(order.delv_id) !== parseInt(user_id) && parseInt(order.delv_boy_id) !== parseInt(user_id)) {
        return res.status(403).json({
          status: 'error',
          msg: 'Order is not assigned to you',
          data: null
        });
      }
    }

    // Process payment details if provided
    let updatedOrderDetails = order.orderdetails;
    if (payment_details && Array.isArray(payment_details) && payment_details.length > 0) {
      try {
        // Parse existing orderdetails
        let orderDetailsArray = [];
        if (order.orderdetails) {
          if (typeof order.orderdetails === 'string') {
            orderDetailsArray = JSON.parse(order.orderdetails);
          } else if (Array.isArray(order.orderdetails)) {
            orderDetailsArray = order.orderdetails;
          }
        }

        console.log(`💰 [completePickup] Processing ${payment_details.length} payment detail(s)`);

        // Update orderdetails with payment information
        orderDetailsArray = orderDetailsArray.map(orderDetail => {
          // Find matching payment detail by category_id or subcategory_id
          const paymentDetail = payment_details.find(pd => {
            const pdCategoryId = pd.category_id ? String(pd.category_id) : null;
            const pdSubcategoryId = pd.subcategory_id ? String(pd.subcategory_id) : null;
            const odCategoryId = orderDetail.category_id ? String(orderDetail.category_id) : null;
            const odSubcategoryId = orderDetail.subcategory_id ? String(orderDetail.subcategory_id) : null;

            return (pdCategoryId && pdCategoryId === odCategoryId) ||
              (pdSubcategoryId && pdSubcategoryId === odSubcategoryId) ||
              (pdCategoryId && pdCategoryId === odSubcategoryId) ||
              (pdSubcategoryId && pdSubcategoryId === odCategoryId);
          });

          if (paymentDetail) {
            // Update with actual weight and amount from payment details
            const updatedDetail = {
              ...orderDetail,
              actual_weight: parseFloat(paymentDetail.weight) || 0,
              actual_amount: parseFloat(paymentDetail.amount) || 0,
              weight: parseFloat(paymentDetail.weight) || orderDetail.weight || 0,
              amount: parseFloat(paymentDetail.amount) || orderDetail.amount || 0
            };
            console.log(`💰 [completePickup] Updated order detail: category_id=${orderDetail.category_id}, weight=${updatedDetail.actual_weight}, amount=${updatedDetail.actual_amount}`);
            return updatedDetail;
          }

          return orderDetail;
        });

        // Convert back to JSON string for storage
        updatedOrderDetails = JSON.stringify(orderDetailsArray);
        console.log(`💰 [completePickup] Updated orderdetails with payment information`);
      } catch (paymentError) {
        console.error('❌ [completePickup] Error processing payment details:', paymentError);
        // Continue without payment details if there's an error
      }
    }

    // Update order status to 5 (Pickup Completed) and include payment details
    const UpdateCommand = require('@aws-sdk/lib-dynamodb').UpdateCommand;

    const updateExpression = updatedOrderDetails && updatedOrderDetails !== order.orderdetails
      ? 'SET #status = :status, pickup_completed_at = :completedAt, updated_at = :updatedAt, orderdetails = :orderdetails'
      : 'SET #status = :status, pickup_completed_at = :completedAt, updated_at = :updatedAt';

    const expressionAttributeValues = {
      ':status': 5, // 5 = Pickup Completed
      ':completedAt': new Date().toISOString(),
      ':updatedAt': new Date().toISOString()
    };

    if (updatedOrderDetails && updatedOrderDetails !== order.orderdetails) {
      expressionAttributeValues[':orderdetails'] = updatedOrderDetails;
    }

    const command = new UpdateCommand({
      TableName: 'orders',
      Key: { id: order.id },
      UpdateExpression: updateExpression,
      ExpressionAttributeNames: {
        '#status': 'status'
      },
      ExpressionAttributeValues: expressionAttributeValues
    });

    await client.send(command);

    // If this is a bulk request order, update vendor status and check if all vendors are completed
    if (order.bulk_request_id) {
      try {
        const { GetCommand, UpdateCommand: BulkUpdateCommand } = require('@aws-sdk/lib-dynamodb');
        const Order = require('../models/Order');
        
        // Get the bulk request
        const getBulkRequestCommand = new GetCommand({
          TableName: 'bulk_scrap_requests',
          Key: { id: order.bulk_request_id }
        });
        
        const bulkRequestResponse = await client.send(getBulkRequestCommand);
        const bulkRequest = bulkRequestResponse.Item;
        
        if (bulkRequest && bulkRequest.accepted_vendors) {
          let acceptedVendors = [];
          try {
            acceptedVendors = typeof bulkRequest.accepted_vendors === 'string'
              ? JSON.parse(bulkRequest.accepted_vendors)
              : bulkRequest.accepted_vendors;
          } catch (parseError) {
            console.error('Error parsing accepted_vendors:', parseError);
            acceptedVendors = [];
          }
          
          // Find and update the vendor status to 'completed'
          const vendorUserId = order.bulk_request_vendor_id || order.shop_id;
          const vendorIndex = acceptedVendors.findIndex((v) => 
            (v.user_id && parseInt(v.user_id) === parseInt(vendorUserId)) ||
            (v.shop_id && parseInt(v.shop_id) === parseInt(order.shop_id))
          );
          
          if (vendorIndex >= 0) {
            acceptedVendors[vendorIndex].status = 'completed';
            acceptedVendors[vendorIndex].updated_at = new Date().toISOString();
            
            // Check if all vendors with orders have completed
            // Get all orders for this bulk request
            const allBulkOrders = await Order.findByBulkRequestId(order.bulk_request_id);
            const vendorsWithOrders = acceptedVendors.filter(v => v.order_id || v.order_number);
            
            let allVendorsCompleted = true;
            if (vendorsWithOrders.length > 0) {
              // Check each vendor's order status
              for (const vendor of vendorsWithOrders) {
                const vendorOrderId = vendor.order_id || vendor.order_number;
                if (vendorOrderId) {
                  // Try to find the order in bulk orders first
                  let orderStatus = null;
                  const vendorOrder = allBulkOrders.find(o => {
                    const oId = o.id || o.order_id || o.order_number;
                    return oId && oId.toString() === vendorOrderId.toString();
                  });
                  
                  if (vendorOrder) {
                    orderStatus = vendorOrder.status;
                  } else {
                    // If not found in bulk orders, try to find it directly by ID
                    try {
                      const orderGetCommand = new GetCommand({
                        TableName: 'orders',
                        Key: { id: typeof vendorOrderId === 'number' ? vendorOrderId : parseInt(vendorOrderId) }
                      });
                      const orderResponse = await client.send(orderGetCommand);
                      if (orderResponse.Item) {
                        orderStatus = orderResponse.Item.status;
                      }
                    } catch (err) {
                      console.error(`Error fetching order ${vendorOrderId}:`, err);
                    }
                  }
                  
                  // Order must be status 5 (Completed) for vendor to be considered completed
                  if (orderStatus !== 5) {
                    allVendorsCompleted = false;
                    console.log(`⏳ Vendor ${vendor.user_id || vendor.shop_id} order ${vendorOrderId} status is ${orderStatus}, not completed yet`);
                    break;
                  }
                } else {
                  // Vendor has no order yet, so not completed
                  allVendorsCompleted = false;
                  break;
                }
              }
            } else {
              // No vendors with orders yet
              allVendorsCompleted = false;
            }
            
            // Update the bulk request with updated vendor status
            const updateBulkRequestCommand = new BulkUpdateCommand({
              TableName: 'bulk_scrap_requests',
              Key: { id: order.bulk_request_id },
              UpdateExpression: allVendorsCompleted
                ? 'SET accepted_vendors = :acceptedVendors, #status = :status, updated_at = :updatedAt'
                : 'SET accepted_vendors = :acceptedVendors, updated_at = :updatedAt',
              ExpressionAttributeNames: allVendorsCompleted ? {
                '#status': 'status'
              } : {},
              ExpressionAttributeValues: {
                ':acceptedVendors': JSON.stringify(acceptedVendors),
                ':updatedAt': new Date().toISOString(),
                ...(allVendorsCompleted ? { ':status': 'completed' } : {})
              }
            });
            
            await client.send(updateBulkRequestCommand);
            
            if (allVendorsCompleted) {
              console.log(`✅ All vendors completed for bulk request ${order.bulk_request_id}. Marking bulk request as completed.`);
            } else {
              console.log(`✅ Updated vendor status to 'completed' in bulk request ${order.bulk_request_id}. Waiting for other vendors.`);
            }
          } else {
            console.warn(`⚠️ Vendor not found in accepted_vendors for bulk request ${order.bulk_request_id}`);
          }
        }
      } catch (bulkUpdateError) {
        console.error('❌ Error updating vendor status in bulk request:', bulkUpdateError);
        // Don't fail the request if bulk request update fails
      }
    }

    // Invalidate caches
    try {
      await RedisCache.invalidateV2ApiCache('active_pickup', user_id, {
        user_type: user_type
      });
      await RedisCache.invalidateV2ApiCache('available_pickup_requests', null, {
        user_id: 'all',
        user_type: 'all'
      });
      if (order.customer_id) {
        await RedisCache.invalidateV2ApiCache('active_pickup', order.customer_id, {
          user_type: 'U'
        });
        
        // Invalidate recycling stats cache for customer (used by dashboard stats)
        const recyclingStatsCacheKey = RedisCache.userKey(order.customer_id, 'recycling_stats_customer');
        await RedisCache.delete(recyclingStatsCacheKey);
        console.log(`🗑️  Invalidated recycling stats cache for customer_id: ${order.customer_id}`);
        
        // Invalidate earnings cache for customer (used by dashboard stats)
        const earningsCacheKey = RedisCache.userKey(order.customer_id, 'earnings_monthly_customer_6');
        await RedisCache.delete(earningsCacheKey);
        console.log(`🗑️  Invalidated earnings cache for customer_id: ${order.customer_id}`);
      }
      await RedisCache.invalidateV2ApiCache('order', null, {
        order_id: order.id,
        customer_id: order.customer_id,
        user_id: user_id,
        user_type: user_type
      });
    } catch (err) {
      console.error('Cache invalidation error:', err);
    }

    return res.json({
      status: 'success',
      msg: 'Pickup completed successfully',
      data: {
        order_id: order.id,
        order_number: order.order_number,
        status: 5 // 5 = Pickup Completed
      }
    });
  } catch (error) {
    console.error('Error completing pickup:', error);
    return res.status(500).json({
      status: 'error',
      msg: 'Failed to complete pickup',
      data: null
    });
  }
};

module.exports = V2OrderController;
