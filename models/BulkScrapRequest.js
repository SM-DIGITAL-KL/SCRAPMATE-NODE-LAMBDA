/**
 * Bulk Scrap Request Model
 * Handles bulk scrap purchase requests from B2B users
 */

const { getDynamoDBClient } = require('../config/dynamodb');
const { PutCommand, QueryCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');

const TABLE_NAME = 'bulk_scrap_requests';

class BulkScrapRequest {
  /**
   * Create a new bulk scrap purchase request
   */
  static async create(data) {
    try {
      const client = getDynamoDBClient();
      const requestId = data.id || (Date.now() + Math.floor(Math.random() * 1000));
      
      // Ensure proper data types for DynamoDB
      const item = {
        id: requestId,
        buyer_id: typeof data.buyer_id === 'string' ? parseInt(data.buyer_id) : (typeof data.buyer_id === 'number' ? data.buyer_id : parseInt(String(data.buyer_id))),
        buyer_name: data.buyer_name || null,
        latitude: typeof data.latitude === 'string' ? parseFloat(data.latitude) : (typeof data.latitude === 'number' ? data.latitude : parseFloat(String(data.latitude))),
        longitude: typeof data.longitude === 'string' ? parseFloat(data.longitude) : (typeof data.longitude === 'number' ? data.longitude : parseFloat(String(data.longitude))),
        scrap_type: data.scrap_type || null,
        subcategories: data.subcategories || null, // Should be JSON string if provided
        subcategory_id: data.subcategory_id ? (typeof data.subcategory_id === 'string' ? parseInt(data.subcategory_id) : (typeof data.subcategory_id === 'number' ? data.subcategory_id : parseInt(String(data.subcategory_id)))) : null,
        quantity: typeof data.quantity === 'string' ? parseFloat(data.quantity) : (typeof data.quantity === 'number' ? data.quantity : parseFloat(String(data.quantity))), // in kgs
        preferred_price: data.preferred_price ? (typeof data.preferred_price === 'string' ? parseFloat(data.preferred_price) : (typeof data.preferred_price === 'number' ? data.preferred_price : parseFloat(String(data.preferred_price)))) : null,
        preferred_distance: typeof data.preferred_distance === 'string' ? parseFloat(data.preferred_distance) : (typeof data.preferred_distance === 'number' ? data.preferred_distance : parseFloat(String(data.preferred_distance || 50))), // in km
        when_needed: data.when_needed || null,
        location: data.location || null,
        additional_notes: data.additional_notes || null,
        documents: data.documents || null, // Should be JSON string if provided
        accepted_vendors: data.accepted_vendors || JSON.stringify([]), // JSON string
        rejected_vendors: data.rejected_vendors || JSON.stringify([]), // JSON string
        total_committed_quantity: data.total_committed_quantity || 0, // Total quantity committed by all vendors
        status: 'active', // active, completed, cancelled
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const command = new PutCommand({
        TableName: TABLE_NAME,
        Item: item
      });

      try {
        await client.send(command);
        console.log(`✅ Bulk scrap request created: ID=${requestId}`);
        return item;
      } catch (putError) {
        // Handle case where table doesn't exist
        if (putError.name === 'ResourceNotFoundException' || putError.__type === 'com.amazonaws.dynamodb.v20120810#ResourceNotFoundException') {
          console.error(`❌ Table "${TABLE_NAME}" does not exist. Please create the table first.`);
          console.error(`   The table will be created automatically when the first request is made in production.`);
          console.error(`   For local development, you may need to create the table manually.`);
          throw new Error(`Table "${TABLE_NAME}" does not exist. Please create it first.`);
        }
        throw putError;
      }
    } catch (error) {
      console.error('❌ Error creating bulk scrap request:', error);
      throw error;
    }
  }

  /**
   * Find bulk scrap requests for a user based on their location
   * Returns requests where the user's shop is within the request's preferred_distance
   */
  static async findForUser(userId, userLat, userLng, userType) {
    try {
      const client = getDynamoDBClient();
      const allRequests = [];
      let lastKey = null;

      // Scan all active bulk scrap requests
      // Note: 'status' is a reserved keyword in DynamoDB, so we use ExpressionAttributeNames
      do {
        const params = {
          TableName: TABLE_NAME,
          FilterExpression: '#status = :status',
          ExpressionAttributeNames: {
            '#status': 'status'
          },
          ExpressionAttributeValues: {
            ':status': 'active'
          }
        };

        if (lastKey) {
          params.ExclusiveStartKey = lastKey;
        }

        const command = new ScanCommand(params);
        let response;
        try {
          response = await client.send(command);
        } catch (scanError) {
          // Handle case where table doesn't exist
          if (scanError.name === 'ResourceNotFoundException' || scanError.__type === 'com.amazonaws.dynamodb.v20120810#ResourceNotFoundException') {
            console.warn(`⚠️  Table "${TABLE_NAME}" does not exist yet. Returning empty array.`);
            return [];
          }
          throw scanError;
        }

        if (response.Items) {
          allRequests.push(...response.Items);
        }

        lastKey = response.LastEvaluatedKey;
      } while (lastKey);

      console.log(`   Found ${allRequests.length} active bulk scrap requests`);

      // Filter requests where user is within preferred_distance
      const userRequests = [];
      const R = 6371; // Earth's radius in km

      for (const request of allRequests) {
        // Skip if request doesn't have location data
        if (!request.latitude || !request.longitude) {
          continue;
        }

        // Calculate distance between user and request location
        const dLat = (userLat - request.latitude) * Math.PI / 180;
        const dLng = (userLng - request.longitude) * Math.PI / 180;
        const a =
          Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos(request.latitude * Math.PI / 180) * Math.cos(userLat * Math.PI / 180) *
          Math.sin(dLng / 2) * Math.sin(dLng / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const distance = R * c;

        // Check if user is within the request's preferred_distance
        const preferredDistance = request.preferred_distance || 50;
        if (distance <= preferredDistance) {
          // Fetch buyer details
          let buyerName = null;
          let buyerMobNum = null;
          try {
            const User = require('./User');
            const buyer = await User.findById(request.buyer_id);
            if (buyer) {
              buyerName = buyer.name || buyer.company_name || `User_${buyer.id}`;
              buyerMobNum = buyer.mob_num || null;
            }
          } catch (buyerErr) {
            console.warn(`⚠️  Could not fetch buyer details for buyer_id ${request.buyer_id}:`, buyerErr.message);
          }

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

          // Parse accepted_vendors to calculate total_committed_quantity
          let parsedAcceptedVendors = [];
          if (request.accepted_vendors) {
            try {
              parsedAcceptedVendors = typeof request.accepted_vendors === 'string'
                ? JSON.parse(request.accepted_vendors)
                : request.accepted_vendors;
            } catch (e) {
              console.warn('⚠️  Could not parse accepted_vendors:', e.message);
              parsedAcceptedVendors = [];
            }
          }

          // Calculate total committed quantity
          let totalCommittedQuantity = 0;
          if (parsedAcceptedVendors && parsedAcceptedVendors.length > 0) {
            parsedAcceptedVendors.forEach((v) => {
              const committedQty = v.committed_quantity || 0;
              totalCommittedQuantity += typeof committedQty === 'string' ? parseFloat(committedQty) : (typeof committedQty === 'number' ? committedQty : parseFloat(String(committedQty)) || 0);
            });
          }

          // Ensure numeric fields are numbers (DynamoDB may return strings)
          const formattedRequest = {
            id: typeof request.id === 'string' ? parseInt(request.id) : (typeof request.id === 'number' ? request.id : parseInt(String(request.id))),
            buyer_id: typeof request.buyer_id === 'string' ? parseInt(request.buyer_id) : (typeof request.buyer_id === 'number' ? request.buyer_id : parseInt(String(request.buyer_id))),
            buyer_name: buyerName,
            buyer_mob_num: buyerMobNum,
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
            accepted_vendors: parsedAcceptedVendors,
            rejected_vendors: request.rejected_vendors ? (typeof request.rejected_vendors === 'string' ? JSON.parse(request.rejected_vendors) : request.rejected_vendors) : [],
            total_committed_quantity: totalCommittedQuantity,
            created_at: request.created_at || new Date().toISOString(),
            updated_at: request.updated_at || new Date().toISOString(),
            distance: distance,
            distance_km: parseFloat(distance.toFixed(2))
          };

          userRequests.push(formattedRequest);
        }
      }

      // Sort by distance (closest first)
      userRequests.sort((a, b) => a.distance - b.distance);

      console.log(`✅ Found ${userRequests.length} bulk scrap requests within range for user ${userId}`);
      return userRequests;
    } catch (error) {
      console.error('❌ Error finding bulk scrap requests for user:', error);
      throw error;
    }
  }

  /**
   * Find bulk scrap requests by buyer_id
   */
  /**
   * Find all bulk scrap requests by buyer_id
   * Returns ALL requests regardless of status (active, order_full_filled, pickup_started, arrived, completed, cancelled, etc.)
   */
  static async findByBuyerId(buyerId) {
    try {
      const client = getDynamoDBClient();
      const allRequests = [];
      let lastKey = null;

      do {
        const params = {
          TableName: TABLE_NAME,
          // Only filter by buyer_id - NO status filter to return all requests regardless of status
          FilterExpression: 'buyer_id = :buyer_id',
          ExpressionAttributeValues: {
            ':buyer_id': buyerId
          }
        };

        if (lastKey) {
          params.ExclusiveStartKey = lastKey;
        }

        const command = new ScanCommand(params);
        let response;
        try {
          response = await client.send(command);
        } catch (scanError) {
          // Handle case where table doesn't exist
          if (scanError.name === 'ResourceNotFoundException' || scanError.__type === 'com.amazonaws.dynamodb.v20120810#ResourceNotFoundException') {
            console.warn(`⚠️  Table "${TABLE_NAME}" does not exist yet. Returning empty array.`);
            return [];
          }
          throw scanError;
        }

        if (response && response.Items) {
          // Format each request to include total_committed_quantity
          const formattedRequests = response.Items.map((request) => {
            // Parse accepted_vendors to calculate total_committed_quantity
            let parsedAcceptedVendors = [];
            if (request.accepted_vendors) {
              try {
                parsedAcceptedVendors = typeof request.accepted_vendors === 'string'
                  ? JSON.parse(request.accepted_vendors)
                  : request.accepted_vendors;
              } catch (e) {
                console.warn('⚠️  Could not parse accepted_vendors:', e.message);
                parsedAcceptedVendors = [];
              }
            }

            // Calculate total committed quantity
            let totalCommittedQuantity = 0;
            if (parsedAcceptedVendors && parsedAcceptedVendors.length > 0) {
              parsedAcceptedVendors.forEach((v) => {
                const committedQty = v.committed_quantity || 0;
                totalCommittedQuantity += typeof committedQty === 'string' ? parseFloat(committedQty) : (typeof committedQty === 'number' ? committedQty : parseFloat(String(committedQty)) || 0);
              });
            }

            return {
              ...request,
              accepted_vendors: parsedAcceptedVendors,
              total_committed_quantity: totalCommittedQuantity
            };
          });
          allRequests.push(...formattedRequests);
        }

        lastKey = response ? response.LastEvaluatedKey : null;
      } while (lastKey);

      // Sort by created_at (newest first)
      allRequests.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

      console.log(`✅ Found ${allRequests.length} bulk scrap requests for buyer ${buyerId}`);
      return allRequests;
    } catch (error) {
      console.error('❌ Error finding bulk scrap requests by buyer:', error);
      throw error;
    }
  }

  /**
   * Find bulk scrap requests accepted by a user
   * Returns requests where the user is in the accepted_vendors array
   * This should include all statuses (not just 'active') since accepted requests may have different statuses
   */
  static async findAcceptedByUser(userId, userLat, userLng, userType) {
    try {
      const client = getDynamoDBClient();
      const allRequests = [];
      let lastKey = null;

      // Scan ALL bulk scrap requests (not just active ones) to find accepted requests
      // Accepted requests can have various statuses: 'active', 'order_full_filled', 'pickup_started', 'completed', etc.
      do {
        const params = {
          TableName: TABLE_NAME
          // No filter on status - we want all requests to check if user has accepted
        };

        if (lastKey) {
          params.ExclusiveStartKey = lastKey;
        }

        const command = new ScanCommand(params);
        let response;
        try {
          response = await client.send(command);
        } catch (scanError) {
          // Handle case where table doesn't exist
          if (scanError.name === 'ResourceNotFoundException' || scanError.__type === 'com.amazonaws.dynamodb.v20120810#ResourceNotFoundException') {
            console.warn(`⚠️  Table "${TABLE_NAME}" does not exist yet. Returning empty array.`);
            return [];
          }
          throw scanError;
        }

        if (response.Items) {
          allRequests.push(...response.Items);
        }

        lastKey = response.LastEvaluatedKey;
      } while (lastKey);

      console.log(`   Found ${allRequests.length} total bulk scrap requests (scanning for accepted)`);

      // Filter requests where user is in accepted_vendors
      const acceptedRequests = [];
      const R = 6371; // Earth's radius in km

      for (const request of allRequests) {
        // Parse accepted_vendors
        let parsedAcceptedVendors = [];
        if (request.accepted_vendors) {
          try {
            parsedAcceptedVendors = typeof request.accepted_vendors === 'string'
              ? JSON.parse(request.accepted_vendors)
              : request.accepted_vendors;
          } catch (e) {
            console.warn('⚠️  Could not parse accepted_vendors:', e.message);
            parsedAcceptedVendors = [];
          }
        }

        // Check if user is in accepted_vendors
        const isAccepted = parsedAcceptedVendors.some((vendor) => {
          const vendorUserId = typeof vendor.user_id === 'string' ? parseInt(vendor.user_id) : (typeof vendor.user_id === 'number' ? vendor.user_id : parseInt(String(vendor.user_id)));
          return vendorUserId === userId;
        });

        if (!isAccepted) {
          continue; // Skip if user hasn't accepted this request
        }

        // Calculate distance if location is available
        let distance = Infinity;
        if (request.latitude && request.longitude && userLat && userLng) {
          const dLat = (request.latitude - userLat) * Math.PI / 180;
          const dLng = (request.longitude - userLng) * Math.PI / 180;
          const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                    Math.cos(userLat * Math.PI / 180) * Math.cos(request.latitude * Math.PI / 180) *
                    Math.sin(dLng / 2) * Math.sin(dLng / 2);
          const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
          distance = R * c;
        }

        // Get buyer info
        let buyerName = null;
        let buyerMobNum = null;
        try {
          const User = require('./User');
          const buyer = await User.findById(request.buyer_id);
          if (buyer) {
            buyerName = buyer.name || null;
            buyerMobNum = buyer.mob_num || null;
          }
        } catch (buyerError) {
          console.warn(`⚠️  Could not fetch buyer info for buyer_id ${request.buyer_id}:`, buyerError.message);
        }

        // Parse subcategories
        let parsedSubcategories = [];
        if (request.subcategories) {
          try {
            parsedSubcategories = typeof request.subcategories === 'string'
              ? JSON.parse(request.subcategories)
              : request.subcategories;
          } catch (e) {
            console.warn('⚠️  Could not parse subcategories:', e.message);
          }
        }

        // Parse documents
        let parsedDocuments = [];
        if (request.documents) {
          try {
            parsedDocuments = typeof request.documents === 'string'
              ? JSON.parse(request.documents)
              : request.documents;
          } catch (e) {
            console.warn('⚠️  Could not parse documents:', e.message);
          }
        }

        // Calculate total committed quantity
        let totalCommittedQuantity = 0;
        if (parsedAcceptedVendors && parsedAcceptedVendors.length > 0) {
          parsedAcceptedVendors.forEach((v) => {
            const committedQty = v.committed_quantity || 0;
            totalCommittedQuantity += typeof committedQty === 'string' ? parseFloat(committedQty) : (typeof committedQty === 'number' ? committedQty : parseFloat(String(committedQty)) || 0);
          });
        }

        // Format the request
        const formattedRequest = {
          id: typeof request.id === 'string' ? parseInt(request.id) : (typeof request.id === 'number' ? request.id : parseInt(String(request.id))),
          buyer_id: typeof request.buyer_id === 'string' ? parseInt(request.buyer_id) : (typeof request.buyer_id === 'number' ? request.buyer_id : parseInt(String(request.buyer_id))),
          buyer_name: buyerName,
          buyer_mob_num: buyerMobNum,
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
          accepted_vendors: parsedAcceptedVendors,
          rejected_vendors: request.rejected_vendors ? (typeof request.rejected_vendors === 'string' ? JSON.parse(request.rejected_vendors) : request.rejected_vendors) : [],
          total_committed_quantity: totalCommittedQuantity,
          created_at: request.created_at || new Date().toISOString(),
          updated_at: request.updated_at || new Date().toISOString(),
          distance: distance,
          distance_km: parseFloat(distance.toFixed(2))
        };

        acceptedRequests.push(formattedRequest);
      }

      // Sort by created_at (newest first)
      acceptedRequests.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      
      console.log(`✅ Found ${acceptedRequests.length} accepted bulk scrap requests for user ${userId}`);
      return acceptedRequests;
    } catch (error) {
      console.error('❌ Error finding accepted bulk scrap requests for user:', error);
      throw error;
    }
  }

  /**
   * Update request status
   */
  static async updateStatus(requestId, status) {
    try {
      const client = getDynamoDBClient();
      
      // First get the item
      const requests = await this.findByBuyerId(0); // Temporary, we need a findById method
      const request = requests.find(r => r.id === requestId);
      
      if (!request) {
        throw new Error('Bulk scrap request not found');
      }

      const updatedItem = {
        ...request,
        status: status,
        updated_at: new Date().toISOString()
      };

      const command = new PutCommand({
        TableName: TABLE_NAME,
        Item: updatedItem
      });

      await client.send(command);
      return updatedItem;
    } catch (error) {
      console.error('❌ Error updating bulk scrap request status:', error);
      throw error;
    }
  }
}

module.exports = BulkScrapRequest;

