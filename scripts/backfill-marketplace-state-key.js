#!/usr/bin/env node
/**
 * Backfill state_key and status_created_at for marketplace post tables.
 *
 * Usage:
 *   node scripts/backfill-marketplace-state-key.js             # dry run
 *   node scripts/backfill-marketplace-state-key.js --apply     # write updates
 *   node scripts/backfill-marketplace-state-key.js --table bulk_sell_requests --apply
 */

require('dotenv').config();
const { getDynamoDBClient } = require('../config/dynamodb');
const { ScanCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');

const TABLES = ['bulk_sell_requests', 'bulk_scrap_requests'];

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
  if (parts.length === 0) return '';

  for (let i = parts.length - 1; i >= 0; i -= 1) {
    const segment = parts[i];
    if (!segment) continue;
    const compact = segment.replace(/\s+/g, '');
    if (/^\d{5,7}$/.test(compact)) continue;
    if (/^[0-9\s-]+$/.test(segment)) continue;
    if (/[a-zA-Z]/.test(segment)) return segment;
  }

  return parts[parts.length - 1] || '';
};

async function scanAll(client, tableName) {
  const items = [];
  let lastKey = null;
  do {
    const cmd = new ScanCommand({
      TableName: tableName,
      ExclusiveStartKey: lastKey || undefined,
    });
    const res = await client.send(cmd);
    items.push(...(res.Items || []));
    lastKey = res.LastEvaluatedKey || null;
  } while (lastKey);
  return items;
}

async function backfillTable(client, tableName, applyChanges) {
  const items = await scanAll(client, tableName);
  let candidates = 0;
  let updated = 0;

  for (const item of items) {
    const id = item?.id;
    if (id === undefined || id === null) continue;

    const status = String(item?.status || 'pending').trim().toLowerCase();
    const createdAt = String(item?.created_at || new Date().toISOString());
    const state = String(item?.state || extractStateFromLocation(item?.location || '')).trim();
    const stateKey = normalizeStateKey(item?.state_key || state);
    const statusCreatedAt = String(item?.status_created_at || `${status}#${createdAt}`);

    const needsStateKey = !String(item?.state_key || '').trim() && !!stateKey;
    const needsStatusCreatedAt = !String(item?.status_created_at || '').trim();
    const needsState = !String(item?.state || '').trim() && !!state;

    if (!needsStateKey && !needsStatusCreatedAt && !needsState) continue;
    candidates += 1;

    if (!applyChanges) continue;

    const setParts = [];
    const eav = { ':updatedAt': new Date().toISOString() };
    const ean = {};

    if (needsState && state) {
      setParts.push('#state = :state');
      ean['#state'] = 'state';
      eav[':state'] = state;
    }

    if (needsStateKey && stateKey) {
      setParts.push('state_key = :state_key');
      eav[':state_key'] = stateKey;
    }

    if (needsStatusCreatedAt && statusCreatedAt) {
      setParts.push('status_created_at = :status_created_at');
      eav[':status_created_at'] = statusCreatedAt;
    }

    setParts.push('updated_at = :updatedAt');

    const cmd = new UpdateCommand({
      TableName: tableName,
      Key: { id },
      UpdateExpression: `SET ${setParts.join(', ')}`,
      ExpressionAttributeNames: Object.keys(ean).length > 0 ? ean : undefined,
      ExpressionAttributeValues: eav,
    });

    await client.send(cmd);
    updated += 1;
  }

  return { total: items.length, candidates, updated };
}

async function main() {
  const args = process.argv.slice(2);
  const applyChanges = args.includes('--apply');
  const tableArgIndex = args.findIndex((arg) => arg === '--table');
  const tableFromArg = tableArgIndex >= 0 ? String(args[tableArgIndex + 1] || '').trim() : '';
  const tables = tableFromArg ? [tableFromArg] : TABLES;

  const client = getDynamoDBClient();

  console.log(`Mode: ${applyChanges ? 'APPLY' : 'DRY-RUN'}`);
  for (const table of tables) {
    if (!TABLES.includes(table)) {
      console.log(`Skipping unknown table: ${table}`);
      continue;
    }
    console.log(`\nProcessing table: ${table}`);
    const result = await backfillTable(client, table, applyChanges);
    console.log(`Total items: ${result.total}`);
    console.log(`Needs backfill: ${result.candidates}`);
    console.log(`Updated: ${result.updated}`);
  }
}

main().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
