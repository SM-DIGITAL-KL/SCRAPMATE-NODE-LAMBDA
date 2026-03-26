/**
 * Delete all marketplace posts from DynamoDB.
 * Targets:
 * - bulk_scrap_requests
 * - bulk_sell_requests
 *
 * Usage:
 *   node scripts/clear-marketplace-posts.js
 */

require('dotenv').config();
const { getDynamoDBClient } = require('../config/dynamodb');
const { ScanCommand, BatchWriteCommand } = require('@aws-sdk/lib-dynamodb');
const { getTableName } = require('../utils/dynamodbTableNames');

const TARGET_TABLES = [
  getTableName('bulk_scrap_requests'),
  getTableName('bulk_sell_requests'),
];

const KEY_BY_TABLE = {
  [getTableName('bulk_scrap_requests')]: 'id',
  [getTableName('bulk_sell_requests')]: 'id',
};

const chunk = (arr, size) => {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

async function scanKeys(client, tableName, keyName) {
  const keys = [];
  let lastKey;
  do {
    const res = await client.send(new ScanCommand({
      TableName: tableName,
      ProjectionExpression: '#k',
      ExpressionAttributeNames: { '#k': keyName },
      ExclusiveStartKey: lastKey,
    }));
    for (const item of res.Items || []) {
      if (item && Object.prototype.hasOwnProperty.call(item, keyName)) {
        keys.push({ [keyName]: item[keyName] });
      }
    }
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);
  return keys;
}

async function batchDelete(client, tableName, keys) {
  let deleted = 0;
  for (const group of chunk(keys, 25)) {
    let requestItems = {
      [tableName]: group.map((key) => ({
        DeleteRequest: { Key: key },
      })),
    };

    let attempts = 0;
    do {
      const res = await client.send(new BatchWriteCommand({ RequestItems: requestItems }));
      const unprocessed = res.UnprocessedItems && res.UnprocessedItems[tableName]
        ? res.UnprocessedItems[tableName]
        : [];
      deleted += requestItems[tableName].length - unprocessed.length;
      requestItems = unprocessed.length ? { [tableName]: unprocessed } : null;
      attempts += 1;
      if (requestItems) {
        await new Promise((r) => setTimeout(r, Math.min(1000, 100 * attempts)));
      }
    } while (requestItems && attempts < 10);
  }
  return deleted;
}

async function main() {
  const client = getDynamoDBClient();

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🧹 CLEARING MARKETPLACE POSTS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  for (const tableName of TARGET_TABLES) {
    const keyName = KEY_BY_TABLE[tableName];
    if (!keyName) {
      console.log(`⚠️ Skipping ${tableName}: unknown primary key mapping`);
      continue;
    }

    console.log(`📋 Scanning keys from ${tableName}...`);
    const keys = await scanKeys(client, tableName, keyName);
    console.log(`   Found ${keys.length} items`);

    if (keys.length === 0) {
      console.log(`   ✅ ${tableName} already empty\n`);
      continue;
    }

    console.log(`🗑️ Deleting ${keys.length} items from ${tableName}...`);
    const deleted = await batchDelete(client, tableName, keys);
    console.log(`   ✅ Deleted ${deleted} items from ${tableName}\n`);
  }

  console.log('✅ Marketplace posts cleanup completed.\n');
}

main().catch((error) => {
  console.error('❌ Failed to clear marketplace posts:', error);
  process.exit(1);
});

