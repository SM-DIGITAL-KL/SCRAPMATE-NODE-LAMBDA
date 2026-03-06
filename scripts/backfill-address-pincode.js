#!/usr/bin/env node

/**
 * One-time pincode backfill for DynamoDB addresses table using latitude/longitude.
 *
 * Notes:
 * - DynamoDB is schemaless, so writing `pincode` adds the attribute.
 * - Uses reverse geocode (Nominatim) and updates only if pincode is found.
 *
 * Usage:
 *   node scripts/backfill-address-pincode.js                 # dry-run
 *   node scripts/backfill-address-pincode.js --apply         # write to DB
 *   node scripts/backfill-address-pincode.js --apply --force # overwrite existing pincode too
 */

require('dotenv').config();
const { loadEnvFromFile } = require('../utils/loadEnv');
loadEnvFromFile();
const fs = require('fs');
const path = require('path');

const { getDynamoDBClient } = require('../config/dynamodb');
const { ScanCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');

const TABLE_NAME = 'addresses';
const PIN_RE = /^\d{6}$/;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function normalize(v) {
  return v == null ? '' : String(v).trim();
}

function getCoordinates(item) {
  if (item.latitude !== undefined && item.longitude !== undefined) {
    const lat = Number(item.latitude);
    const lon = Number(item.longitude);
    if (!Number.isNaN(lat) && !Number.isNaN(lon)) return { lat, lon };
  }
  if (item.lat_log && typeof item.lat_log === 'string' && item.lat_log.includes(',')) {
    const [latStr, lonStr] = item.lat_log.split(',');
    const lat = Number((latStr || '').trim());
    const lon = Number((lonStr || '').trim());
    if (!Number.isNaN(lat) && !Number.isNaN(lon)) return { lat, lon };
  }
  return null;
}

async function fetchJson(url, headers = {}) {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

async function resolvePincodeByLatLng(lat, lon, cache) {
  const key = `${lat.toFixed(6)},${lon.toFixed(6)}`;
  if (cache.has(key)) return cache.get(key);
  try {
    const data = await fetchJson(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&addressdetails=1&zoom=18`,
      { 'User-Agent': 'scrapmate-address-pincode-backfill/1.0 (ops@scrapmate.co.in)' }
    );
    const postcode = normalize(data?.address?.postcode).replace(/\s/g, '');
    const pin = PIN_RE.test(postcode) ? postcode : '';
    cache.set(key, pin);
    return pin;
  } catch (err) {
    cache.set(key, '');
    return '';
  }
}

function parseArgs(argv) {
  return {
    apply: argv.includes('--apply'),
    force: argv.includes('--force'),
    verbose: argv.includes('--verbose'),
    showExistingSkips: argv.includes('--show-existing-skips')
  };
}

function ts() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
}

async function updatePincode(client, id, pincode) {
  await client.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { id },
      UpdateExpression: 'SET #pincode = :pincode, #updated_at = :updated_at',
      ExpressionAttributeNames: {
        '#pincode': 'pincode',
        '#updated_at': 'updated_at'
      },
      ExpressionAttributeValues: {
        ':pincode': pincode,
        ':updated_at': new Date().toISOString()
      }
    })
  );
}

async function main() {
  const { apply, force, verbose, showExistingSkips } = parseArgs(process.argv.slice(2));
  const client = getDynamoDBClient();
  const geoCache = new Map();
  const updateResults = [];

  let lastKey = null;
  let scanned = 0;
  let hasCoords = 0;
  let hasExistingPincode = 0;
  let inferred = 0;
  let updated = 0;
  let wouldUpdate = 0;
  let unresolved = 0;
  let failed = 0;

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📮 Address Pincode Backfill');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Mode: ${apply ? 'APPLY' : 'DRY-RUN'}`);
  console.log(`Force overwrite existing pincode: ${force ? 'YES' : 'NO'}\n`);

  do {
    const scanParams = {
      TableName: TABLE_NAME,
      ProjectionExpression: 'id, pincode, lat_log, latitude, longitude'
    };
    if (lastKey) scanParams.ExclusiveStartKey = lastKey;

    const res = await client.send(new ScanCommand(scanParams));
    const items = res.Items || [];
    scanned += items.length;

    for (const item of items) {
      const itemId = item.id;
      const existingPin = normalize(item.pincode).replace(/\s/g, '');
      if (existingPin) hasExistingPincode += 1;

      const coords = getCoordinates(item);
      if (!coords) {
        unresolved += 1;
        if (verbose) {
          console.log(`⏭️ id=${itemId} unresolved (no latitude/longitude)`);
        }
        continue;
      }
      hasCoords += 1;

      try {
        const newPin = await resolvePincodeByLatLng(coords.lat, coords.lon, geoCache);
        await sleep(1100);

        if (!newPin) {
          unresolved += 1;
          if (verbose) {
            console.log(`⏭️ id=${itemId} unresolved (reverse geocode has no pincode)`);
          }
          continue;
        }
        inferred += 1;

        const shouldUpdate = force ? existingPin !== newPin : (!existingPin || existingPin === '');
        if (!shouldUpdate) {
          if (verbose && showExistingSkips) {
            console.log(`⏭️ id=${itemId} skip (existing pincode "${existingPin}" kept)`);
          }
          continue;
        }

        if (apply) {
          await updatePincode(client, item.id, newPin);
          updated += 1;
          const row = {
            id: item.id,
            old_pincode: existingPin || '',
            new_pincode: newPin
          };
          updateResults.push(row);
          console.log(`✅ id=${row.id} pincode "${row.old_pincode || 'N/A'}" -> "${row.new_pincode}"`);
        } else {
          wouldUpdate += 1;
          const row = {
            id: item.id,
            old_pincode: existingPin || '',
            new_pincode: newPin
          };
          updateResults.push(row);
          console.log(`🧪 id=${row.id} pincode "${row.old_pincode || 'N/A'}" -> "${row.new_pincode}"`);
        }
      } catch (err) {
        failed += 1;
        console.error(`❌ id=${item.id}: ${err.message}`);
      }
    }

    lastKey = res.LastEvaluatedKey;
    console.log(`Processed ${scanned} | Updated ${updated} | WouldUpdate ${wouldUpdate} | Unresolved ${unresolved} | Failed ${failed}`);
  } while (lastKey);

  console.log('\nDone');
  const summary = {
    table: TABLE_NAME,
    mode: apply ? 'apply' : 'dry_run',
    force_overwrite: force,
    scanned,
    has_coords: hasCoords,
    has_existing_pincode: hasExistingPincode,
    inferred,
    updated,
    would_update: wouldUpdate,
    unresolved,
    failed,
    unique_geo_queries_cached: geoCache.size
  };
  console.log(JSON.stringify(summary, null, 2));

  const report = {
    generated_at: new Date().toISOString(),
    summary,
    updates: updateResults
  };
  const reportName = `backfill-address-pincode-report-${ts()}.json`;
  const reportPath = path.join(__dirname, reportName);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(`📁 Report saved: ${reportPath}`);

  if (verbose && updateResults.length > 0) {
    console.log('\nUpdated IDs:');
    for (const row of updateResults) {
      console.log(`- ${row.id}: ${row.old_pincode || 'N/A'} -> ${row.new_pincode}`);
    }
  }
}

main().catch((err) => {
  console.error('Fatal backfill error:', err);
  process.exit(1);
});
