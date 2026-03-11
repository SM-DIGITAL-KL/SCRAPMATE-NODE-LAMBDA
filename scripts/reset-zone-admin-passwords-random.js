#!/usr/bin/env node

require('dotenv').config();
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const XLSX = require('xlsx');
const { getDynamoDBClient } = require('../config/dynamodb');
const { ScanCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');

const TABLE_NAME = 'users';
const APPLY = process.argv.includes('--apply');

function nowIso() {
  return new Date().toISOString();
}

function timestampSlug() {
  return nowIso().replace(/[:.]/g, '-').slice(0, -5);
}

function generateRandomPassword(length = 14) {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const num = '23456789';
  const sym = '@#%*+-_=';
  const all = upper + lower + num + sym;

  // Ensure at least one char from each bucket.
  const chars = [
    upper[Math.floor(Math.random() * upper.length)],
    lower[Math.floor(Math.random() * lower.length)],
    num[Math.floor(Math.random() * num.length)],
    sym[Math.floor(Math.random() * sym.length)]
  ];

  while (chars.length < length) {
    const idx = crypto.randomInt(0, all.length);
    chars.push(all[idx]);
  }

  // Fisher-Yates shuffle.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }

  return chars.join('');
}

function isZoneEmail(email) {
  return /^zone([1-9]|[1-4][0-9])@scrapmate\.co\.in$/i.test(String(email || '').trim());
}

async function fetchAllZoneUsers(client) {
  const users = [];
  let lastKey = null;

  do {
    const params = {
      TableName: TABLE_NAME,
      ProjectionExpression: 'id, email, #name, user_type, app_type, mob_num, del_status',
      ExpressionAttributeNames: { '#name': 'name' }
    };
    if (lastKey) params.ExclusiveStartKey = lastKey;

    const res = await client.send(new ScanCommand(params));
    for (const item of res.Items || []) {
      if (!item || !item.email) continue;
      if (!isZoneEmail(item.email)) continue;
      users.push(item);
    }
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);

  users.sort((a, b) => String(a.email).localeCompare(String(b.email)));
  return users;
}

async function updatePassword(client, userId, passwordHash) {
  const cmd = new UpdateCommand({
    TableName: TABLE_NAME,
    Key: { id: userId },
    UpdateExpression: 'SET #password = :password, #updated_at = :updatedAt',
    ExpressionAttributeNames: {
      '#password': 'password',
      '#updated_at': 'updated_at'
    },
    ExpressionAttributeValues: {
      ':password': passwordHash,
      ':updatedAt': nowIso()
    }
  });
  await client.send(cmd);
}

function writeExcel(rows) {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [
    { wch: 10 },
    { wch: 24 },
    { wch: 26 },
    { wch: 22 },
    { wch: 10 },
    { wch: 12 },
    { wch: 12 },
    { wch: 14 },
    { wch: 28 }
  ];
  XLSX.utils.book_append_sheet(wb, ws, 'Zone Passwords');

  const filename = `zone-admin-passwords-${timestampSlug()}.xlsx`;
  const outputPath = path.resolve(__dirname, '../../SCRAPMATE-ADMIN-PHP', filename);
  XLSX.writeFile(wb, outputPath);
  return outputPath;
}

(async () => {
  const client = getDynamoDBClient();
  console.log(`\n🔐 Zone Admin Password Reset (${APPLY ? 'APPLY' : 'DRY RUN'})`);

  const zoneUsers = await fetchAllZoneUsers(client);
  console.log(`📋 Found ${zoneUsers.length} zonal mail ID user(s)`);

  if (zoneUsers.length === 0) {
    console.log('⚠️ No zonal users found. Exiting.');
    process.exit(0);
  }

  const rows = [];
  let success = 0;
  let failed = 0;

  for (let i = 0; i < zoneUsers.length; i++) {
    const user = zoneUsers[i];
    const plain = generateRandomPassword(14);
    const hash = await bcrypt.hash(plain, 10);

    try {
      if (APPLY) {
        await updatePassword(client, user.id, hash);
      }

      rows.push({
        SL_NO: i + 1,
        EMAIL: user.email || '',
        NEW_PASSWORD: plain,
        USER_ID: String(user.id || ''),
        USER_TYPE: user.user_type || '',
        APP_TYPE: user.app_type || '',
        MOB_NUM: user.mob_num || '',
        STATUS: APPLY ? 'updated' : 'preview',
        UPDATED_AT: nowIso()
      });
      success += 1;
    } catch (err) {
      rows.push({
        SL_NO: i + 1,
        EMAIL: user.email || '',
        NEW_PASSWORD: plain,
        USER_ID: String(user.id || ''),
        USER_TYPE: user.user_type || '',
        APP_TYPE: user.app_type || '',
        MOB_NUM: user.mob_num || '',
        STATUS: `failed: ${err.message}`,
        UPDATED_AT: nowIso()
      });
      failed += 1;
    }
  }

  const filePath = writeExcel(rows);
  console.log(`📁 Excel file created: ${filePath}`);
  console.log(`✅ Completed. Success: ${success}, Failed: ${failed}`);
})();

