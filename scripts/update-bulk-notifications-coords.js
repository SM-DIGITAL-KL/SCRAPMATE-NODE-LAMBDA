require('dotenv').config();
const fs = require('fs');
const path = require('path');

// Import DynamoDB models
const BulkMessageNotification = require('../models/BulkMessageNotification');
const { getDynamoDBClient } = require('../config/dynamodb');
const { UpdateCommand, GetCommand } = require('@aws-sdk/lib-dynamodb');

/**
 * Update bulk_message_notifications table with latitude and longitude from geocoded JSON file
 * Usage: node scripts/update-bulk-notifications-coords.js <json-file-path>
 */

// Normalize phone number (same logic as BulkMessageNotification)
function normalizePhone(phone) {
  if (!phone) return null;
  return phone.replace(/[\s+\-()]/g, '');
}

// Extract phone number from various formats
function extractPhoneNumber(phone) {
  if (!phone) return null;
  let cleaned = phone.replace(/\s+/g, "").replace(/[^\d+]/g, "");
  if (cleaned.startsWith("+91")) {
    cleaned = cleaned.substring(3);
  } else if (cleaned.startsWith("91") && cleaned.length === 12) {
    cleaned = cleaned.substring(2);
  }
  if (cleaned.length === 10 && /^[6-9]\d{9}$/.test(cleaned)) {
    return cleaned;
  }
  return null;
}

// Update a notification record with coordinates
async function updateNotificationWithCoords(notificationId, latitude, longitude) {
  try {
    const client = getDynamoDBClient();
    
    // Get current notification to preserve business_data
    const getCmd = new GetCommand({
      TableName: 'bulk_message_notifications',
      Key: { id: notificationId }
    });
    
    const current = await client.send(getCmd);
    if (!current.Item) {
      throw new Error(`Notification ${notificationId} not found`);
    }
    
    // Update business_data with coordinates, preserving existing data
    const businessData = current.Item.business_data || {};
    businessData.latitude = latitude;
    businessData.longitude = longitude;
    
    // Also add lat_log format for compatibility
    businessData.lat_log = `${latitude},${longitude}`;
    
    const updateCmd = new UpdateCommand({
      TableName: 'bulk_message_notifications',
      Key: { id: notificationId },
      UpdateExpression: 'SET business_data = :businessData, #updated_at = :updated_at',
      ExpressionAttributeNames: {
        '#updated_at': 'updated_at'
      },
      ExpressionAttributeValues: {
        ':businessData': businessData,
        ':updated_at': new Date().toISOString()
      },
      ReturnValues: 'ALL_NEW'
    });
    
    const response = await client.send(updateCmd);
    return response.Attributes;
  } catch (error) {
    console.error(`   ❌ Error updating notification ${notificationId}:`, error.message);
    throw error;
  }
}

async function updateBulkNotificationsFromJson(jsonFilePath) {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📍 Updating Bulk Message Notifications with Coordinates');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log(`📁 JSON File: ${jsonFilePath}\n`);

  // Read JSON file
  let jsonData;
  try {
    const fileContent = fs.readFileSync(jsonFilePath, 'utf8');
    jsonData = JSON.parse(fileContent);
  } catch (error) {
    console.error(`❌ Error reading JSON file: ${error.message}`);
    process.exit(1);
  }

  if (!Array.isArray(jsonData)) {
    console.error('❌ JSON file must contain an array of objects');
    process.exit(1);
  }

  console.log(`📊 Total entries in JSON: ${jsonData.length}\n`);

  // Filter entries with coordinates and phone numbers
  const entriesWithCoords = jsonData.filter(entry => 
    entry.latitude && 
    entry.longitude && 
    (entry.phone || (entry.business_data && entry.business_data.phone))
  );

  console.log(`✅ Entries with coordinates and phone: ${entriesWithCoords.length}\n`);

  if (entriesWithCoords.length === 0) {
    console.log('⚠️  No entries with both coordinates and phone numbers found.');
    process.exit(0);
  }

  const results = {
    total: entriesWithCoords.length,
    updated: 0,
    notFound: 0,
    errors: 0,
    skipped: 0
  };

  // Process each entry
  for (let i = 0; i < entriesWithCoords.length; i++) {
    const entry = entriesWithCoords[i];
    const entryNum = i + 1;

    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`[${entryNum}/${entriesWithCoords.length}] Processing: ${entry.title || 'N/A'}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    try {
      // Extract phone number
      const phone = entry.phone || (entry.business_data && entry.business_data.phone) || null;
      if (!phone) {
        console.log(`   ⚠️  No phone number found, skipping`);
        results.skipped++;
        continue;
      }

      const extractedPhone = extractPhoneNumber(phone);
      if (!extractedPhone) {
        console.log(`   ⚠️  Invalid phone number format: ${phone}, skipping`);
        results.skipped++;
        continue;
      }

      const normalizedPhone = normalizePhone(extractedPhone);
      console.log(`   📱 Phone: ${normalizedPhone}`);
      console.log(`   📍 Coordinates: ${entry.latitude}, ${entry.longitude}`);

      // Find all notifications for this phone number
      console.log(`   🔍 Searching for notifications...`);
      const notifications = await BulkMessageNotification.findByPhoneNumber(normalizedPhone);

      if (!notifications || notifications.length === 0) {
        console.log(`   ⚠️  No notifications found for phone ${normalizedPhone}`);
        results.notFound++;
        continue;
      }

      console.log(`   ✅ Found ${notifications.length} notification(s)`);

      // Update each notification
      for (let j = 0; j < notifications.length; j++) {
        const notification = notifications[j];
        console.log(`   📝 Updating notification ${j + 1}/${notifications.length} (ID: ${notification.id})...`);
        
        try {
          await updateNotificationWithCoords(
            notification.id,
            entry.latitude,
            entry.longitude
          );
          console.log(`   ✅ Updated successfully`);
          results.updated++;
        } catch (error) {
          console.error(`   ❌ Update failed: ${error.message}`);
          results.errors++;
        }
      }

    } catch (error) {
      console.error(`   ❌ Error processing entry: ${error.message}`);
      results.errors++;
    }
  }

  // Summary
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 Update Summary');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log(`   Total entries processed: ${results.total}`);
  console.log(`   ✅ Notifications updated: ${results.updated}`);
  console.log(`   ⚠️  Phone numbers not found: ${results.notFound}`);
  console.log(`   ⏭️  Skipped (no phone/invalid): ${results.skipped}`);
  console.log(`   ❌ Errors: ${results.errors}\n`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

// Get file path from command line
const jsonFilePath = process.argv[2];

if (!jsonFilePath) {
  console.error('Usage: node scripts/update-bulk-notifications-coords.js <json-file-path>');
  console.error('Example: node scripts/update-bulk-notifications-coords.js ../BulksmsNode/dataset_crawler-google-places_2026-01-10_12-47-17-321.json');
  process.exit(1);
}

const fullPath = path.isAbsolute(jsonFilePath) 
  ? jsonFilePath 
  : path.join(__dirname, '..', jsonFilePath);

if (!fs.existsSync(fullPath)) {
  console.error(`❌ File not found: ${fullPath}`);
  process.exit(1);
}

updateBulkNotificationsFromJson(fullPath).catch(error => {
  console.error(`❌ Fatal error: ${error.message}`);
  console.error(error.stack);
  process.exit(1);
});


