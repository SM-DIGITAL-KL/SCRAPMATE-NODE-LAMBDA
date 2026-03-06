#!/usr/bin/env node

/**
 * Fix incorrect district values in addresses table using an exported XLSX file.
 *
 * Strategy:
 * - Read rows from XLSX (expects columns like ID, ADDRESS, DISTRICT, LATITUDE, LONGITUDE, LAT_LOG).
 * - Infer expected district:
 *   1) Reverse geocode (state_district/county/district) if coordinates are present.
 *   2) Pincode lookup fallback.
 * - Update DynamoDB only when current district differs from inferred district.
 *
 * Usage:
 *   node scripts/fix-address-district-from-xlsx.js <xlsx_file> [--apply]
 *
 * Examples:
 *   node scripts/fix-address-district-from-xlsx.js scripts/addresses-with-district-2026-02-19T05-51-41.xlsx
 *   node scripts/fix-address-district-from-xlsx.js scripts/addresses-with-district-2026-02-19T05-51-41.xlsx --apply
 */

require('dotenv').config();
const path = require('path');
const { loadEnvFromFile } = require('../utils/loadEnv');
loadEnvFromFile();

const XLSX = require('xlsx');
const { getDynamoDBClient } = require('../config/dynamodb');
const { UpdateCommand } = require('@aws-sdk/lib-dynamodb');

const TABLE_NAME = 'addresses';
const PINCODE_RE = /\b(\d{6})\b/;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function normalize(value) {
  return value ? String(value).trim() : '';
}

function equalDistrict(a, b) {
  return normalize(a).toLowerCase() === normalize(b).toLowerCase();
}

function getPincode(text) {
  const m = normalize(text).match(PINCODE_RE);
  return m ? m[1] : '';
}

function getCoordinates(row) {
  const lat = Number(row.LATITUDE);
  const lon = Number(row.LONGITUDE);
  if (!Number.isNaN(lat) && !Number.isNaN(lon) && row.LATITUDE !== '' && row.LONGITUDE !== '') {
    return { lat, lon };
  }

  const latLog = normalize(row['LAT_LOG']);
  if (latLog.includes(',')) {
    const [latStr, lonStr] = latLog.split(',');
    const lat2 = Number((latStr || '').trim());
    const lon2 = Number((lonStr || '').trim());
    if (!Number.isNaN(lat2) && !Number.isNaN(lon2)) {
      return { lat: lat2, lon: lon2 };
    }
  }
  return null;
}

async function fetchJson(url, headers = {}) {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

async function inferByGeo(lat, lon, geoCache) {
  const key = `${lat.toFixed(6)},${lon.toFixed(6)}`;
  if (geoCache.has(key)) return geoCache.get(key);

  try {
    const data = await fetchJson(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&addressdetails=1&zoom=10`,
      { 'User-Agent': 'scrapmate-district-fix/1.0 (ops@scrapmate.co.in)' }
    );
    const a = data?.address || {};
    const district = normalize(a.state_district || a.county || a.district || '');
    geoCache.set(key, district);
    return district;
  } catch (err) {
    geoCache.set(key, '');
    return '';
  }
}

async function inferByPincode(pin, pinCache) {
  if (!pin) return '';
  if (pinCache.has(pin)) return pinCache.get(pin);

  try {
    const data = await fetchJson(`https://api.postalpincode.in/pincode/${pin}`);
    let district = '';
    if (
      Array.isArray(data) &&
      data[0]?.Status === 'Success' &&
      Array.isArray(data[0]?.PostOffice) &&
      data[0].PostOffice.length
    ) {
      // If mixed results exist, keep the most common district.
      const freq = new Map();
      for (const po of data[0].PostOffice) {
        const d = normalize(po?.District);
        if (!d) continue;
        freq.set(d, (freq.get(d) || 0) + 1);
      }
      district = [...freq.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '';
    }
    pinCache.set(pin, district);
    return district;
  } catch (err) {
    pinCache.set(pin, '');
    return '';
  }
}

async function updateDistrict(client, id, district) {
  await client.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { id: Number(id) },
      UpdateExpression: 'SET #district = :district, #updated_at = :updated_at',
      ExpressionAttributeNames: {
        '#district': 'district',
        '#updated_at': 'updated_at'
      },
      ExpressionAttributeValues: {
        ':district': district,
        ':updated_at': new Date().toISOString()
      }
    })
  );
}

function usage() {
  console.log('Usage: node scripts/fix-address-district-from-xlsx.js <xlsx_file> [--apply]');
}

async function main() {
  const xlsxPathArg = process.argv[2];
  const apply = process.argv.includes('--apply');
  if (!xlsxPathArg) {
    usage();
    process.exit(1);
  }

  const xlsxPath = path.isAbsolute(xlsxPathArg)
    ? xlsxPathArg
    : path.join(process.cwd(), xlsxPathArg);

  const wb = XLSX.readFile(xlsxPath);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

  const client = getDynamoDBClient();
  const pinCache = new Map();
  const geoCache = new Map();

  let checked = 0;
  let inferred = 0;
  let mismatched = 0;
  let updated = 0;
  let unresolved = 0;
  let failed = 0;

  console.log(`\n📄 File: ${xlsxPath}`);
  console.log(`Rows: ${rows.length}`);
  console.log(`${apply ? '🛠️ APPLY MODE' : '🧪 DRY RUN MODE'}\n`);

  for (const row of rows) {
    checked += 1;
    const id = normalize(row.ID);
    if (!id) continue;

    const currentDistrict = normalize(row.DISTRICT);
    const address = normalize(row.ADDRESS);
    const pin = getPincode(address || normalize(row.PINCODE));
    const coords = getCoordinates(row);

    try {
      let expected = '';
      let source = '';

      if (coords) {
        expected = await inferByGeo(coords.lat, coords.lon, geoCache);
        if (expected) source = 'geo';
        if (expected) await sleep(1100);
      }

      if (!expected && pin) {
        expected = await inferByPincode(pin, pinCache);
        if (expected) source = 'pincode';
      }

      if (!expected) {
        unresolved += 1;
        continue;
      }

      inferred += 1;

      if (!equalDistrict(currentDistrict, expected)) {
        mismatched += 1;
        console.log(`ID=${id} | "${currentDistrict || 'N/A'}" -> "${expected}" [${source}]`);
        if (apply) {
          await updateDistrict(client, id, expected);
          updated += 1;
        }
      }
    } catch (err) {
      failed += 1;
      console.error(`❌ Failed ID=${id}: ${err.message}`);
    }
  }

  console.log('\nDone');
  console.log(
    JSON.stringify(
      {
        table: TABLE_NAME,
        file: xlsxPath,
        mode: apply ? 'apply' : 'dry_run',
        checked,
        inferred,
        mismatched,
        updated,
        unresolved,
        failed,
        unique_pincodes_queried: pinCache.size,
        unique_geo_queries_cached: geoCache.size
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error('Fatal:', err.message || err);
  process.exit(1);
});

