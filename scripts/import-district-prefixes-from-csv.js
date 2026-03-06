#!/usr/bin/env node

/**
 * Import district-wise pincode prefixes from a CSV into DynamoDB.
 *
 * CSV columns expected: pincode, district, statename
 *
 * Usage:
 *   node scripts/import-district-prefixes-from-csv.js --csv /path/file.csv
 *   node scripts/import-district-prefixes-from-csv.js --csv /path/file.csv --apply
 *   node scripts/import-district-prefixes-from-csv.js --csv /path/file.csv --apply --digits 1
 *
 * Notes:
 * - --digits defaults to 1 (first digit), as requested.
 * - Data is upserted into table `district_pincode_prefixes` by id: <state_slug>#<district_slug>
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { loadEnvFromFile } = require('../utils/loadEnv');
const { getDynamoDBClient } = require('../config/dynamodb');
const { PutCommand } = require('@aws-sdk/lib-dynamodb');

loadEnvFromFile();

const DEFAULT_TABLE = 'district_pincode_prefixes';

function parseArgs(argv) {
  const args = {
    csv: '',
    apply: false,
    digits: 1,
    table: DEFAULT_TABLE
  };
  for (let i = 0; i < argv.length; i += 1) {
    const t = argv[i];
    if (t === '--csv') {
      args.csv = argv[i + 1] || '';
      i += 1;
    } else if (t === '--apply') {
      args.apply = true;
    } else if (t === '--digits') {
      const n = Number(argv[i + 1]);
      args.digits = Number.isNaN(n) ? 1 : n;
      i += 1;
    } else if (t === '--table') {
      args.table = argv[i + 1] || DEFAULT_TABLE;
      i += 1;
    } else if (t === '--help' || t === '-h') {
      console.log('Usage: node scripts/import-district-prefixes-from-csv.js --csv /path/file.csv [--apply] [--digits 1] [--table district_pincode_prefixes]');
      process.exit(0);
    } else {
      console.error(`Unknown arg: ${t}`);
      process.exit(1);
    }
  }
  if (!args.csv) {
    console.error('Missing --csv path');
    process.exit(1);
  }
  if (args.digits < 1 || args.digits > 6) {
    console.error('--digits must be between 1 and 6');
    process.exit(1);
  }
  return args;
}

function toSlug(v) {
  return String(v || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function norm(v) {
  return String(v || '').trim();
}

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((x) => x.trim());
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const csvPath = path.isAbsolute(args.csv) ? args.csv : path.join(process.cwd(), args.csv);

  if (!fs.existsSync(csvPath)) {
    throw new Error(`CSV not found: ${csvPath}`);
  }

  const rl = readline.createInterface({
    input: fs.createReadStream(csvPath, { encoding: 'utf8' }),
    crlfDelay: Infinity
  });

  let headers = [];
  let idxPincode = -1;
  let idxDistrict = -1;
  let idxState = -1;
  let lineNo = 0;
  let scanned = 0;
  let skipped = 0;

  const map = new Map(); // key => {state,district,prefixes:Set,pincodes:Set}

  for await (const rawLine of rl) {
    lineNo += 1;
    if (!rawLine || !rawLine.trim()) continue;

    const cols = parseCsvLine(rawLine);
    if (lineNo === 1) {
      headers = cols.map((h) => h.toLowerCase());
      idxPincode = headers.indexOf('pincode');
      idxDistrict = headers.indexOf('district');
      idxState = headers.indexOf('statename');
      if (idxPincode < 0 || idxDistrict < 0 || idxState < 0) {
        throw new Error('CSV must contain headers: pincode, district, statename');
      }
      continue;
    }

    scanned += 1;
    const pincode = norm(cols[idxPincode]).replace(/\D/g, '');
    const district = norm(cols[idxDistrict]);
    const state = norm(cols[idxState]);

    if (pincode.length !== 6 || !district || !state) {
      skipped += 1;
      continue;
    }

    const prefix = pincode.slice(0, args.digits);
    const stateSlug = toSlug(state);
    const districtSlug = toSlug(district);
    const key = `${stateSlug}#${districtSlug}`;

    if (!map.has(key)) {
      map.set(key, {
        state_name: state,
        state_slug: stateSlug,
        district_name: district,
        district_slug: districtSlug,
        prefixes: new Set(),
        pincodes: new Set()
      });
    }
    const row = map.get(key);
    row.prefixes.add(prefix);
    row.pincodes.add(pincode);
  }

  const rows = [...map.values()].map((r) => ({
    id: `${r.state_slug}#${r.district_slug}`,
    state_name: r.state_name,
    state_slug: r.state_slug,
    district_name: r.district_name,
    district_slug: r.district_slug,
    pincode_prefixes: [...r.prefixes].sort(),
    prefix_count: r.prefixes.size,
    pincode_count: r.pincodes.size,
    source_url: `csv_import:${path.basename(csvPath)}`,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }));

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📥 CSV District Prefix Import');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Mode: ${args.apply ? 'APPLY' : 'DRY-RUN'}`);
  console.log(`CSV: ${csvPath}`);
  console.log(`Table: ${args.table}`);
  console.log(`Prefix digits: ${args.digits}`);
  console.log(`Rows scanned: ${scanned}`);
  console.log(`Rows skipped: ${skipped}`);
  console.log(`District records prepared: ${rows.length}\n`);

  if (!args.apply) {
    console.log('Sample records:');
    for (const sample of rows.slice(0, 10)) {
      console.log(`- ${sample.state_name} / ${sample.district_name}: ${sample.pincode_prefixes.join(',')}`);
    }
    console.log('\nDry-run only. Use --apply to save.');
    return;
  }

  const client = getDynamoDBClient();
  let saved = 0;
  for (const item of rows) {
    await client.send(new PutCommand({ TableName: args.table, Item: item }));
    saved += 1;
    if (saved % 200 === 0) {
      console.log(`Saved: ${saved}/${rows.length}`);
    }
  }

  console.log(`\n✅ Saved ${saved} district records to ${args.table}`);
}

main().catch((err) => {
  console.error('❌ Import failed:', err.message || err);
  process.exit(1);
});

