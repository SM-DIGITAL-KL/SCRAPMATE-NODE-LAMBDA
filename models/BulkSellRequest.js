/**
 * Bulk Sell Request Model
 * Handles bulk scrap sell requests from B2B users
 * Only 'S' type users can see and accept these requests
 */

const { getDynamoDBClient } = require('../config/dynamodb');
const { PutCommand, QueryCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');

const TABLE_NAME = 'bulk_sell_requests';

class BulkSellRequest {
  /**
   * Create a new bulk sell request
   */
  static async create(data) {
    try {
      const client = getDynamoDBClient();
      const requestId = data.id || (Date.now() + Math.floor(Math.random() * 1000));
      
      // Ensure proper data types for DynamoDB
      const item = {
        id: requestId,
        seller_id: typeof data.seller_id === 'string' ? parseInt(data.seller_id) : (typeof data.seller_id === 'number' ? data.seller_id : parseInt(String(data.seller_id))),
        seller_name: data.seller_name || null,
        latitude: typeof data.latitude === 'string' ? parseFloat(data.latitude) : (typeof data.latitude === 'number' ? data.latitude : parseFloat(String(data.latitude))),
        longitude: typeof data.longitude === 'string' ? parseFloat(data.longitude) : (typeof data.longitude === 'number' ? data.longitude : parseFloat(String(data.longitude))),
        scrap_type: data.scrap_type || null,
        subcategories: data.subcategories || null, // Should be JSON string if provided
        subcategory_id: data.subcategory_id ? (typeof data.subcategory_id === 'string' ? parseInt(data.subcategory_id) : (typeof data.subcategory_id === 'number' ? data.subcategory_id : parseInt(String(data.subcategory_id)))) : null,
        quantity: typeof data.quantity === 'string' ? parseFloat(data.quantity) : (typeof data.quantity === 'number' ? data.quantity : parseFloat(String(data.quantity))), // in kgs
        asking_price: data.asking_price ? (typeof data.asking_price === 'string' ? parseFloat(data.asking_price) : (typeof data.asking_price === 'number' ? data.asking_price : parseFloat(String(data.asking_price)))) : null,
        preferred_distance: typeof data.preferred_distance === 'string' ? parseFloat(data.preferred_distance) : (typeof data.preferred_distance === 'number' ? data.preferred_distance : parseFloat(String(data.preferred_distance || 50))), // in km
        when_available: data.when_available || null,
        location: data.location || null,
        additional_notes: data.additional_notes || null,
        documents: data.documents || null, // Should be JSON string if provided
        accepted_buyers: data.accepted_buyers || JSON.stringify([]), // JSON string - buyers who accepted
        rejected_buyers: data.rejected_buyers || JSON.stringify([]), // JSON string
        total_committed_quantity: data.total_committed_quantity || 0, // Total quantity committed by all buyers
        status: 'active', // active, sold, cancelled
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const command = new PutCommand({
        TableName: TABLE_NAME,
        Item: item
      });

      try {
        await client.send(command);
        console.log(`✅ Bulk sell request created: ID=${requestId}`);
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
      console.error('❌ Error creating bulk sell request:', error);
      throw error;
    }
  }

  /**
   * Find bulk sell requests for a user based on their location
   * Returns requests where the user's shop is within the request's preferred_distance
   * Only 'S' type users can see these requests
   */
  static async findForUser(userId, userLat, userLng, userType) {
    try {
      // Only 'S' type users can see bulk sell requests
      if (userType !== 'S') {
        console.log(`⚠️  User type ${userType} cannot see bulk sell requests. Only 'S' type users allowed.`);
        return [];
      }

      const client = getDynamoDBClient();
      const allRequests = [];
      let lastKey = null;

      // Scan all active bulk sell requests
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
          if (scanError.name === 'ResourceNotFoundException' || scanError.__type === 'com.amazonaws.dynamodb.v20120810#ResourceNotFoundException') {
            console.warn(`⚠️  Table "${TABLE_NAME}" does not exist yet. Returning empty array.`);
            return [];
          }
          throw scanError;
        }

        if (response && response.Items) {
          // Calculate distance and filter by preferred_distance
          const filteredRequests = response.Items.filter((request) => {
            // Skip if seller is the same as the user
            const sellerId = typeof request.seller_id === 'string' ? parseInt(request.seller_id) : (typeof request.seller_id === 'number' ? request.seller_id : parseInt(String(request.seller_id)));
            const userIdNum = typeof userId === 'string' ? parseInt(userId) : (typeof userId === 'number' ? userId : parseInt(String(userId)));
            if (sellerId === userIdNum) {
              return false;
            }

            // Calculate distance using Haversine formula
            if (userLat && userLng && request.latitude && request.longitude) {
              const R = 6371; // Earth's radius in km
              const dLat = (request.latitude - userLat) * Math.PI / 180;
              const dLon = (request.longitude - userLng) * Math.PI / 180;
              const a = 
                Math.sin(dLat/2) * Math.sin(dLat/2) +
                Math.cos(userLat * Math.PI / 180) * Math.cos(request.latitude * Math.PI / 180) *
                Math.sin(dLon/2) * Math.sin(dLon/2);
              const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
              const distance = R * c;

              const preferredDistance = typeof request.preferred_distance === 'string' ? parseFloat(request.preferred_distance) : (typeof request.preferred_distance === 'number' ? request.preferred_distance : parseFloat(String(request.preferred_distance || 50)));
              return distance <= preferredDistance;
            }
            return true; // Include if no location data
          });

          // Format each request to include total_committed_quantity and distance
          const formattedRequests = filteredRequests.map((request) => {
            // Parse accepted_buyers to calculate total_committed_quantity
            let parsedAcceptedBuyers = [];
            if (request.accepted_buyers) {
              try {
                parsedAcceptedBuyers = typeof request.accepted_buyers === 'string'
                  ? JSON.parse(request.accepted_buyers)
                  : request.accepted_buyers;
              } catch (e) {
                console.warn('⚠️  Could not parse accepted_buyers:', e.message);
                parsedAcceptedBuyers = [];
              }
            }

            // Calculate total committed quantity
            let totalCommittedQuantity = 0;
            if (parsedAcceptedBuyers && parsedAcceptedBuyers.length > 0) {
              parsedAcceptedBuyers.forEach((b) => {
                const committedQty = b.committed_quantity || 0;
                totalCommittedQuantity += typeof committedQty === 'string' ? parseFloat(committedQty) : (typeof committedQty === 'number' ? committedQty : parseFloat(String(committedQty)) || 0);
              });
            }

            // Calculate distance
            let distance = null;
            if (userLat && userLng && request.latitude && request.longitude) {
              const R = 6371;
              const dLat = (request.latitude - userLat) * Math.PI / 180;
              const dLon = (request.longitude - userLng) * Math.PI / 180;
              const a = 
                Math.sin(dLat/2) * Math.sin(dLat/2) +
                Math.cos(userLat * Math.PI / 180) * Math.cos(request.latitude * Math.PI / 180) *
                Math.sin(dLon/2) * Math.sin(dLon/2);
              const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
              distance = R * c;
            }

            return {
              ...request,
              accepted_buyers: parsedAcceptedBuyers,
              total_committed_quantity: totalCommittedQuantity,
              distance: distance
            };
          });

          allRequests.push(...formattedRequests);
        }

        lastKey = response ? response.LastEvaluatedKey : null;
      } while (lastKey);

      // Sort by distance (nearest first)
      allRequests.sort((a, b) => {
        if (a.distance === null && b.distance === null) return 0;
        if (a.distance === null) return 1;
        if (b.distance === null) return -1;
        return a.distance - b.distance;
      });

      console.log(`✅ Found ${allRequests.length} bulk sell requests for user ${userId}`);
      return allRequests;
    } catch (error) {
      console.error('❌ Error finding bulk sell requests for user:', error);
      throw error;
    }
  }

  /**
   * Find all bulk sell requests created by a specific seller
   * Returns ALL requests regardless of status
   */
  static async findBySellerId(sellerId) {
    try {
      const client = getDynamoDBClient();
      const allRequests = [];
      let lastKey = null;

      do {
        const params = {
          TableName: TABLE_NAME,
          // Only filter by seller_id - NO status filter to return all requests regardless of status
          FilterExpression: 'seller_id = :seller_id',
          ExpressionAttributeValues: {
            ':seller_id': sellerId
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
          if (scanError.name === 'ResourceNotFoundException' || scanError.__type === 'com.amazonaws.dynamodb.v20120810#ResourceNotFoundException') {
            console.warn(`⚠️  Table "${TABLE_NAME}" does not exist yet. Returning empty array.`);
            return [];
          }
          throw scanError;
        }

        if (response && response.Items) {
          // Format each request to include total_committed_quantity
          const formattedRequests = response.Items.map((request) => {
            // Parse accepted_buyers to calculate total_committed_quantity
            let parsedAcceptedBuyers = [];
            if (request.accepted_buyers) {
              try {
                parsedAcceptedBuyers = typeof request.accepted_buyers === 'string'
                  ? JSON.parse(request.accepted_buyers)
                  : request.accepted_buyers;
              } catch (e) {
                console.warn('⚠️  Could not parse accepted_buyers:', e.message);
                parsedAcceptedBuyers = [];
              }
            }

            // Calculate total committed quantity
            let totalCommittedQuantity = 0;
            if (parsedAcceptedBuyers && parsedAcceptedBuyers.length > 0) {
              parsedAcceptedBuyers.forEach((b) => {
                const committedQty = b.committed_quantity || 0;
                totalCommittedQuantity += typeof committedQty === 'string' ? parseFloat(committedQty) : (typeof committedQty === 'number' ? committedQty : parseFloat(String(committedQty)) || 0);
              });
            }

            return {
              ...request,
              accepted_buyers: parsedAcceptedBuyers,
              total_committed_quantity: totalCommittedQuantity
            };
          });
          allRequests.push(...formattedRequests);
        }

        lastKey = response ? response.LastEvaluatedKey : null;
      } while (lastKey);

      // Sort by created_at (newest first)
      allRequests.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

      console.log(`✅ Found ${allRequests.length} bulk sell requests for seller ${sellerId}`);
      return allRequests;
    } catch (error) {
      console.error('❌ Error finding bulk sell requests by seller:', error);
      throw error;
    }
  }

  /**
   * Find bulk sell requests accepted by a user
   * Returns requests where the user has accepted
   */
  static async findAcceptedByUser(userId) {
    try {
      const client = getDynamoDBClient();
      const allRequests = [];
      let lastKey = null;

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
          if (scanError.name === 'ResourceNotFoundException' || scanError.__type === 'com.amazonaws.dynamodb.v20120810#ResourceNotFoundException') {
            console.warn(`⚠️  Table "${TABLE_NAME}" does not exist yet. Returning empty array.`);
            return [];
          }
          throw scanError;
        }

        if (response && response.Items) {
          // Filter requests where user is in accepted_buyers
          const userIdNum = typeof userId === 'string' ? parseInt(userId) : (typeof userId === 'number' ? userId : parseInt(String(userId)));
          
          const userRequests = response.Items.filter((request) => {
            let parsedAcceptedBuyers = [];
            if (request.accepted_buyers) {
              try {
                parsedAcceptedBuyers = typeof request.accepted_buyers === 'string'
                  ? JSON.parse(request.accepted_buyers)
                  : request.accepted_buyers;
              } catch (e) {
                return false;
              }
            }
            
            return parsedAcceptedBuyers.some((buyer) => {
              const buyerId = typeof buyer.user_id === 'string' ? parseInt(buyer.user_id) : (typeof buyer.user_id === 'number' ? buyer.user_id : parseInt(String(buyer.user_id)));
              return buyerId === userIdNum;
            });
          });

          // Format each request
          const formattedRequests = userRequests.map((request) => {
            let parsedAcceptedBuyers = [];
            if (request.accepted_buyers) {
              try {
                parsedAcceptedBuyers = typeof request.accepted_buyers === 'string'
                  ? JSON.parse(request.accepted_buyers)
                  : request.accepted_buyers;
              } catch (e) {
                parsedAcceptedBuyers = [];
              }
            }

            // Calculate total committed quantity
            let totalCommittedQuantity = 0;
            if (parsedAcceptedBuyers && parsedAcceptedBuyers.length > 0) {
              parsedAcceptedBuyers.forEach((b) => {
                const committedQty = b.committed_quantity || 0;
                totalCommittedQuantity += typeof committedQty === 'string' ? parseFloat(committedQty) : (typeof committedQty === 'number' ? committedQty : parseFloat(String(committedQty)) || 0);
              });
            }

            return {
              ...request,
              accepted_buyers: parsedAcceptedBuyers,
              total_committed_quantity: totalCommittedQuantity
            };
          });

          allRequests.push(...formattedRequests);
        }

        lastKey = response ? response.LastEvaluatedKey : null;
      } while (lastKey);

      // Sort by created_at (newest first)
      allRequests.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

      console.log(`✅ Found ${allRequests.length} accepted bulk sell requests for user ${userId}`);
      return allRequests;
    } catch (error) {
      console.error('❌ Error finding accepted bulk sell requests by user:', error);
      throw error;
    }
  }
}

module.exports = BulkSellRequest;






