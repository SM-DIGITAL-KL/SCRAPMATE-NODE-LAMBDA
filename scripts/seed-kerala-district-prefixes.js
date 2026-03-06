#!/usr/bin/env node

/**
 * Seed Kerala district pincode prefixes into DynamoDB table.
 *
 * Usage:
 *   node scripts/seed-kerala-district-prefixes.js --dry-run
 *   node scripts/seed-kerala-district-prefixes.js --apply
 *
 * Default table: district_pincode_prefixes
 */

require('dotenv').config();
const { loadEnvFromFile } = require('../utils/loadEnv');
loadEnvFromFile();

const { getDynamoDBClient } = require('../config/dynamodb');
const { PutCommand } = require('@aws-sdk/lib-dynamodb');

const TABLE_NAME = 'district_pincode_prefixes';

const KERALA_DATA = [
  { district_name: 'Thiruvananthapuram', district_slug: 'thiruvananthapuram', pincode_prefixes: ['695'] },
  { district_name: 'Kollam', district_slug: 'kollam', pincode_prefixes: ['691'] },
  { district_name: 'Pathanamthitta', district_slug: 'pathanamthitta', pincode_prefixes: ['689'] },
  { district_name: 'Alappuzha', district_slug: 'alappuzha', pincode_prefixes: ['688'] },
  { district_name: 'Kottayam', district_slug: 'kottayam', pincode_prefixes: ['686'] },
  { district_name: 'Idukki', district_slug: 'idukki', pincode_prefixes: ['685'] },
  { district_name: 'Ernakulam', district_slug: 'ernakulam', pincode_prefixes: ['682', '683'] },
  { district_name: 'Thrissur', district_slug: 'thrissur', pincode_prefixes: ['680'] },
  { district_name: 'Palakkad', district_slug: 'palakkad', pincode_prefixes: ['678'] },
  { district_name: 'Malappuram', district_slug: 'malappuram', pincode_prefixes: ['676'] },
  { district_name: 'Kozhikode', district_slug: 'kozhikode', pincode_prefixes: ['673'] },
  { district_name: 'Wayanad', district_slug: 'wayanad', pincode_prefixes: ['673'] },
  { district_name: 'Kannur', district_slug: 'kannur', pincode_prefixes: ['670'] },
  { district_name: 'Kasaragod', district_slug: 'kasaragod', pincode_prefixes: ['671'] }
];

function parseArgs(argv) {
  return {
    apply: argv.includes('--apply')
  };
}

function nowIso() {
  return new Date().toISOString();
}

async function main() {
  const { apply } = parseArgs(process.argv.slice(2));
  const client = getDynamoDBClient();

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🌴 Kerala District Prefix Seed');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Mode: ${apply ? 'APPLY' : 'DRY-RUN'}`);
  console.log(`Table: ${TABLE_NAME}\n`);

  for (const d of KERALA_DATA) {
    const item = {
      id: `kerala#${d.district_slug}`,
      state_name: 'Kerala',
      state_slug: 'kerala',
      district_name: d.district_name,
      district_slug: d.district_slug,
      pincode_prefixes: d.pincode_prefixes,
      prefix_count: d.pincode_prefixes.length,
      pincode_count: 0,
      source_url: 'manual_seed_2026-02-19',
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
      console.log(`✅ Saved ${d.district_name}: ${d.pincode_prefixes.join(', ')}`);
    } else {
      console.log(`🧪 ${d.district_name}: ${d.pincode_prefixes.join(', ')}`);
    }
  }

  console.log('\nDone.');
}

main().catch((err) => {
  console.error('❌ Failed:', err.message || err);
  process.exit(1);
});

