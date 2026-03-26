#!/usr/bin/env node
/**
 * Send push notification to all vendor_app users about Tenders + Marketplace feature.
 *
 * Usage:
 *   node scripts/send-marketplace-feature-notification.js            # dry-run
 *   node scripts/send-marketplace-feature-notification.js --apply    # send
 *   node scripts/send-marketplace-feature-notification.js --apply --limit=500
 */

require('dotenv').config();

const { ScanCommand } = require('@aws-sdk/lib-dynamodb');
const { getDynamoDBClient } = require('../config/dynamodb');
const { getTableName, getEnvironment } = require('../utils/dynamodbTableNames');
const { sendVendorNotification } = require('../utils/fcmNotification');

const DEFAULT_TITLE = 'New: Tenders & Marketplace Are Live';
const DEFAULT_BODY =
  'Great news! You can now buy and sell bulk scrap easily with the new Tenders and Marketplace features in the Vendor App.';

const args = process.argv.slice(2);
const shouldApply = args.includes('--apply');
const limitArg = args.find((arg) => arg.startsWith('--limit='));
const limit = limitArg ? Number(limitArg.split('=')[1]) : 0;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchVendorAppUsersWithToken(userTable) {
  const client = getDynamoDBClient();
  const users = [];
  let lastKey = null;

  do {
    const params = {
      TableName: userTable,
      ProjectionExpression: 'id, #name, mob_num, user_type, app_version, app_type, fcm_token',
      ExpressionAttributeNames: {
        '#name': 'name',
      },
      FilterExpression:
        'app_type = :vendorApp AND (attribute_not_exists(del_status) OR del_status <> :deleted) AND attribute_exists(fcm_token)',
      ExpressionAttributeValues: {
        ':vendorApp': 'vendor_app',
        ':deleted': 2,
      },
      ExclusiveStartKey: lastKey || undefined,
    };

    const response = await client.send(new ScanCommand(params));
    if (Array.isArray(response.Items)) {
      users.push(...response.Items.filter((u) => !!u.fcm_token));
    }
    lastKey = response.LastEvaluatedKey;
  } while (lastKey);

  return users;
}

async function main() {
  const environment = getEnvironment();
  const userTable = getTableName('users');
  const title = DEFAULT_TITLE;
  const body = DEFAULT_BODY;

  console.log('\n📨 Vendor App Broadcast: Marketplace + Tenders');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Environment : ${environment}`);
  console.log(`Table       : ${userTable}`);
  console.log(`Mode        : ${shouldApply ? 'APPLY (SENDING)' : 'DRY-RUN (NO SEND)'}`);
  console.log(`Limit       : ${limit > 0 ? limit : 'none'}`);
  console.log(`Title       : ${title}`);
  console.log(`Body        : ${body}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const users = await fetchVendorAppUsersWithToken(userTable);
  const targetUsers = limit > 0 ? users.slice(0, limit) : users;

  if (targetUsers.length === 0) {
    console.log('⚠️ No vendor_app users with FCM token found.');
    return;
  }

  const byType = targetUsers.reduce((acc, user) => {
    const key = String(user.user_type || 'UNKNOWN').toUpperCase();
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  console.log(`✅ Target users found: ${targetUsers.length}`);
  console.log('By user_type:', byType);
  console.log('\nSample recipients:');
  targetUsers.slice(0, 10).forEach((user, idx) => {
    console.log(
      `${idx + 1}. id=${user.id}, type=${user.user_type || '-'}, app=${user.app_type || '-'}, phone=${user.mob_num || '-'}, name=${user.name || '-'}`
    );
  });

  if (!shouldApply) {
    console.log('\nDry-run complete. Re-run with --apply to send notifications.');
    return;
  }

  const stats = {
    total: targetUsers.length,
    success: 0,
    failed: 0,
  };

  console.log('\n🚀 Sending notifications...\n');
  for (let i = 0; i < targetUsers.length; i += 1) {
    const user = targetUsers[i];
    try {
      const result = await sendVendorNotification(
        user.fcm_token,
        title,
        body,
        {
          type: 'marketplace_tenders_feature_added',
          user_id: String(user.id),
          app_type: 'vendor_app',
          user_type: String(user.user_type || ''),
          phone_number: String(user.mob_num || ''),
          timestamp: new Date().toISOString(),
        }
      );

      if (result && result.success) {
        stats.success += 1;
        console.log(`✅ [${i + 1}/${stats.total}] Sent to user ${user.id}`);
      } else {
        stats.failed += 1;
        console.log(`❌ [${i + 1}/${stats.total}] Failed user ${user.id}: ${result?.message || 'Unknown error'}`);
      }
    } catch (error) {
      stats.failed += 1;
      console.log(`❌ [${i + 1}/${stats.total}] Error user ${user.id}: ${error.message}`);
    }

    if (i < targetUsers.length - 1) {
      await sleep(40);
    }
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 SEND SUMMARY');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Total   : ${stats.total}`);
  console.log(`Success : ${stats.success}`);
  console.log(`Failed  : ${stats.failed}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

main().catch((error) => {
  console.error('❌ Script failed:', error);
  process.exit(1);
});
