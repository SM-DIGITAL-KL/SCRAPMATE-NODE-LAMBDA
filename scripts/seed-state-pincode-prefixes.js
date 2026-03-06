#!/usr/bin/env node

/**
 * Seed state-level pincode prefix mappings into DynamoDB table.
 * Stores one row per state with district_name = "All Districts".
 *
 * Usage:
 *   node scripts/seed-state-pincode-prefixes.js
 *   node scripts/seed-state-pincode-prefixes.js --apply
 */

require('dotenv').config();
const { loadEnvFromFile } = require('../utils/loadEnv');
loadEnvFromFile();

const { getDynamoDBClient } = require('../config/dynamodb');
const { PutCommand } = require('@aws-sdk/lib-dynamodb');

const TABLE_NAME = 'district_pincode_prefixes';

const STATE_PREFIX_INPUT = [
  ['Andhra Pradesh', '515, 516, 517, 518, 522, 523, 524'],
  ['Arunachal Pradesh', '791, 792'],
  ['Assam', '781, 782, 783, 784, 785, 786, 787, 788'],
  ['Bihar', '800–805, 811–854'],
  ['Chhattisgarh', '490–497'],
  ['Goa', '403'],
  ['Gujarat', '360–396'],
  ['Haryana', '121–136'],
  ['Himachal Pradesh', '171–177'],
  ['Jharkhand', '814–835'],
  ['Karnataka', '560–591'],
  ['Kerala', '670–695'],
  ['Madhya Pradesh', '450–488'],
  ['Maharashtra', '400–444'],
  ['Manipur', '795'],
  ['Meghalaya', '793, 794'],
  ['Mizoram', '796'],
  ['Nagaland', '797, 798'],
  ['Odisha', '751–770'],
  ['Punjab', '140–160'],
  ['Rajasthan', '301–345'],
  ['Sikkim', '737'],
  ['Tamil Nadu', '600–643'],
  ['Telangana', '500–509'],
  ['Tripura', '799'],
  ['Uttar Pradesh', '201–285'],
  ['Uttarakhand', '244–263'],
  ['West Bengal', '700–743']
];

function parseArgs(argv) {
  return {
    apply: argv.includes('--apply')
  };
}

function nowIso() {
  return new Date().toISOString();
}

function toSlug(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function expandToken(token) {
  const clean = String(token || '').trim();
  if (!clean) return [];

  const normalized = clean.replace(/–/g, '-');
  if (normalized.includes('-')) {
    const [a, b] = normalized.split('-').map((x) => Number(String(x).trim()));
    if (Number.isNaN(a) || Number.isNaN(b) || a > b) return [];
    const out = [];
    for (let i = a; i <= b; i += 1) {
      out.push(String(i).padStart(3, '0'));
    }
    return out;
  }

  const n = Number(normalized);
  if (Number.isNaN(n)) return [];
  return [String(n).padStart(3, '0')];
}

function expandPrefixSpec(spec) {
  const set = new Set();
  for (const token of String(spec || '').split(',')) {
    for (const p of expandToken(token)) {
      set.add(p);
    }
  }
  return [...set].sort();
}

async function main() {
  const { apply } = parseArgs(process.argv.slice(2));
  const client = getDynamoDBClient();

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🗺️  State Pincode Prefix Seed');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Mode: ${apply ? 'APPLY' : 'DRY-RUN'}`);
  console.log(`Table: ${TABLE_NAME}\n`);

  for (const [stateName, spec] of STATE_PREFIX_INPUT) {
    const prefixes = expandPrefixSpec(spec);
    const stateSlug = toSlug(stateName);

    const item = {
      id: `${stateSlug}#all`,
      state_name: stateName,
      state_slug: stateSlug,
      district_name: 'All Districts',
      district_slug: 'all',
      pincode_prefixes: prefixes,
      prefix_count: prefixes.length,
      pincode_count: 0,
      source_url: 'manual_seed_state_prefixes_2026-02-19',
      updated_at: nowIso(),
      created_at: nowIso()
    };

    if (apply) {
      await client.send(
        new PutCommand({
          TableName: TABLE_NAME,
          Item: item
        })
      );
      console.log(`✅ Saved ${stateName}: ${prefixes.length} prefixes`);
    } else {
      console.log(`🧪 ${stateName}: ${prefixes.length} prefixes`);
    }
  }

  console.log('\nDone.');
}

main().catch((err) => {
  console.error('❌ Failed:', err.message || err);
  process.exit(1);
});

