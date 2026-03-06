#!/usr/bin/env node

require('dotenv').config();
const bcrypt = require('bcryptjs');
const { getDynamoDBClient } = require('../config/dynamodb');
const { QueryCommand, ScanCommand, PutCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');

const TABLE_NAME = 'users';
const APPLY = process.argv.includes('--apply');

async function findByEmail(client, email) {
  try {
    const q = new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: 'email-index',
      KeyConditionExpression: 'email = :email',
      ExpressionAttributeValues: { ':email': email },
      Limit: 1
    });
    const res = await client.send(q);
    if (res.Items && res.Items.length > 0) return res.Items[0];
  } catch (_) {
    // Fallback scan if GSI not available
  }

  let lastKey;
  do {
    const s = new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression: 'email = :email',
      ExpressionAttributeValues: { ':email': email },
      ExclusiveStartKey: lastKey,
      Limit: 200
    });
    const res = await client.send(s);
    if (res.Items && res.Items.length > 0) return res.Items[0];
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);

  return null;
}

(async () => {
  const client = getDynamoDBClient();
  const now = new Date().toISOString();

  const summary = {
    mode: APPLY ? 'apply' : 'dry_run',
    scanned: 48,
    created: 0,
    updated: 0,
    failed: 0,
    users: []
  };

  for (let i = 1; i <= 48; i++) {
    const email = `zone${i}@scrapmate.co.in`;
    const passwordPlain = `Zone${i}@2026`;
    const name = `zone ${i}`;
    const mob = 9900000000 + i;

    try {
      const existing = await findByEmail(client, email);
      const hash = await bcrypt.hash(passwordPlain, 10);

      if (existing) {
        if (APPLY) {
          const update = new UpdateCommand({
            TableName: TABLE_NAME,
            Key: { id: existing.id },
            UpdateExpression: 'SET #name = :name, #user_type = :userType, #password = :password, #updated_at = :updatedAt, #mob_num = if_not_exists(#mob_num, :mobNum)',
            ExpressionAttributeNames: {
              '#name': 'name',
              '#user_type': 'user_type',
              '#password': 'password',
              '#updated_at': 'updated_at',
              '#mob_num': 'mob_num'
            },
            ExpressionAttributeValues: {
              ':name': name,
              ':userType': 'U',
              ':password': hash,
              ':updatedAt': now,
              ':mobNum': mob
            }
          });
          await client.send(update);
        }

        summary.updated += 1;
        summary.users.push({ email, password: passwordPlain, action: 'updated', id: existing.id });
      } else {
        const id = Date.now() + i;
        const item = {
          id,
          name,
          email,
          mob_num: mob,
          user_type: 'U',
          password: hash,
          app_version: 'v1',
          created_at: now,
          updated_at: now
        };

        if (APPLY) {
          const put = new PutCommand({ TableName: TABLE_NAME, Item: item });
          await client.send(put);
        }

        summary.created += 1;
        summary.users.push({ email, password: passwordPlain, action: 'created', id });
      }
    } catch (err) {
      summary.failed += 1;
      summary.users.push({ email, password: passwordPlain, action: 'failed', error: err.message });
    }
  }

  console.log(JSON.stringify(summary, null, 2));
})();
