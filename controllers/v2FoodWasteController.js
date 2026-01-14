/**
 * V2 Food Waste Controller
 * Handles food waste collection enquiries from customer app
 */

const { getDynamoDBClient } = require('../config/dynamodb');
const { DynamoDBDocumentClient, PutCommand } = require('@aws-sdk/lib-dynamodb');
const { getTableName } = require('../utils/dynamodbTableNames');

const docClient = DynamoDBDocumentClient.from(getDynamoDBClient());

class V2FoodWasteController {
  /**
   * POST /api/v2/food-waste/enquiry
   * Submit a food waste collection enquiry
   * Body: {
   *   user_id: number,
   *   kg_per_week: string,
   *   preferred_timings: string[],
   *   address?: string,
   *   latitude?: number,
   *   longitude?: number
   * }
   */
  static async submitEnquiry(req, res) {
    try {
      console.log('📥 [V2FoodWasteController] submitEnquiry called');
      console.log('📥 Request body:', JSON.stringify(req.body, null, 2));
      
      const { user_id, kg_per_week, preferred_timings, address, latitude, longitude } = req.body;

      // Validation
      if (!user_id) {
        console.log('❌ Validation failed: user_id is required');
        return res.status(400).json({
          status: 'error',
          msg: 'User ID is required',
          data: null
        });
      }

      if (!kg_per_week) {
        console.log('❌ Validation failed: kg_per_week is required');
        return res.status(400).json({
          status: 'error',
          msg: 'Kg per week is required',
          data: null
        });
      }

      if (!preferred_timings || !Array.isArray(preferred_timings) || preferred_timings.length === 0) {
        console.log('❌ Validation failed: preferred_timings is required');
        return res.status(400).json({
          status: 'error',
          msg: 'At least one preferred timing is required',
          data: null
        });
      }

      // Generate enquiry ID
      const enquiryId = Date.now();
      const createdAt = new Date().toISOString();

      // Prepare enquiry data
      const enquiryData = {
        id: enquiryId,
        user_id: parseInt(user_id),
        kg_per_week: kg_per_week,
        preferred_timings: preferred_timings,
        address: address || null,
        latitude: latitude ? parseFloat(latitude) : null,
        longitude: longitude ? parseFloat(longitude) : null,
        status: 'pending', // pending, contacted, completed, cancelled
        created_at: createdAt,
        updated_at: createdAt
      };

      console.log('💾 Prepared enquiry data:', JSON.stringify(enquiryData, null, 2));

      // Save to DynamoDB
      const tableName = getTableName('food_waste_enquiries');
      console.log(`💾 Saving to table: ${tableName}`);
      
      try {
        await docClient.send(new PutCommand({
          TableName: tableName,
          Item: enquiryData
        }));

        console.log(`✅ Food waste enquiry submitted: ${enquiryId} for user ${user_id}`);

        return res.json({
          status: 'success',
          msg: 'Food waste enquiry submitted successfully',
          data: {
            enquiry_id: enquiryId,
            user_id: parseInt(user_id),
            kg_per_week: kg_per_week,
            preferred_timings: preferred_timings,
            status: 'pending'
          }
        });
      } catch (dbError) {
        console.error('❌ DynamoDB error:', dbError);
        console.error('❌ DynamoDB error message:', dbError.message);
        console.error('❌ DynamoDB error code:', dbError.code);
        console.error('❌ DynamoDB error name:', dbError.name);
        console.error('❌ Table name:', tableName);
        
        // Check if it's a ResourceNotFoundException
        if (dbError.name === 'ResourceNotFoundException') {
          return res.status(500).json({
            status: 'error',
            msg: `DynamoDB table '${tableName}' does not exist. Please create the table first.`,
            data: null
          });
        }
        
        throw dbError; // Re-throw to be caught by outer catch
      }

    } catch (error) {
      console.error('❌ Error submitting food waste enquiry:', error);
      console.error('❌ Error message:', error.message);
      console.error('❌ Error code:', error.code);
      console.error('❌ Error name:', error.name);
      console.error('❌ Error stack:', error.stack);
      return res.status(500).json({
        status: 'error',
        msg: `Failed to submit food waste enquiry: ${error.message || 'Unknown error'}`,
        data: null
      });
    }
  }
}

module.exports = V2FoodWasteController;

