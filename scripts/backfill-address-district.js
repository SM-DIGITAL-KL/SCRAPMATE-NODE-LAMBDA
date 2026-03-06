/**
 * One-time district backfill for DynamoDB addresses table.
 *
 * Strategy:
 * 1) Use pincode lookup when a 6-digit pin is present in address text.
 * 2) Fallback to reverse geocode using latitude/longitude (Nominatim).
 *
 * Safety:
 * - Uses Scan + per-item Update only (no GSI queries/changes).
 * - Updates only when district is missing/empty and inferred district is non-empty.
 *
 * Usage:
 *   node scripts/backfill-address-district.js
 *   node scripts/backfill-address-district.js --phone 9074135121 --dry-run
 */

require('dotenv').config();
const { loadEnvFromFile } = require('../utils/loadEnv');
loadEnvFromFile();

const { getDynamoDBClient } = require('../config/dynamodb');
const { ScanCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const User = require('../models/User');
const Customer = require('../models/Customer');
const Address = require('../models/Address');

const TABLE_NAME = 'addresses';
const PINCODE_RE = /\b(\d{6})\b/;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchJson(url, headers = {}) {
  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  return res.json();
}

function normalizeDistrict(value) {
  if (!value) return '';
  return String(value).trim();
}

function getCoordinates(item) {
  if (item.latitude !== undefined && item.longitude !== undefined) {
    const lat = Number(item.latitude);
    const lon = Number(item.longitude);
    if (!Number.isNaN(lat) && !Number.isNaN(lon)) return { lat, lon };
  }
  if (item.lat_log && typeof item.lat_log === 'string' && item.lat_log.includes(',')) {
    const [latStr, lonStr] = item.lat_log.split(',');
    const lat = Number(latStr.trim());
    const lon = Number(lonStr.trim());
    if (!Number.isNaN(lat) && !Number.isNaN(lon)) return { lat, lon };
  }
  return null;
}

function getPincode(address) {
  if (!address || typeof address !== 'string') return null;
  const m = address.match(PINCODE_RE);
  return m ? m[1] : null;
}

async function resolveDistrictFromPincode(pin, pinCache) {
  if (!pin) return '';
  if (pinCache.has(pin)) return pinCache.get(pin);
  try {
    const data = await fetchJson(`https://api.postalpincode.in/pincode/${pin}`);
    let district = '';
    if (Array.isArray(data) && data[0] && data[0].Status === 'Success' && Array.isArray(data[0].PostOffice) && data[0].PostOffice[0]) {
      district = normalizeDistrict(data[0].PostOffice[0].District);
    }
    pinCache.set(pin, district);
    return district;
  } catch (err) {
    pinCache.set(pin, '');
    return '';
  }
}

async function resolveDistrictFromLatLng(lat, lon, geoCache) {
  const key = `${lat.toFixed(6)},${lon.toFixed(6)}`;
  if (geoCache.has(key)) return geoCache.get(key);
  try {
    const data = await fetchJson(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&addressdetails=1&zoom=10`,
      { 'User-Agent': 'scrapmate-address-district-backfill/1.0 (ops@scrapmate.co.in)' }
    );
    const a = data && data.address ? data.address : {};
    // Prefer higher-level district fields first; `district` can be town/taluk (e.g., Adoor).
    const district = normalizeDistrict(a.state_district || a.county || a.district || '');
    geoCache.set(key, district);
    return district;
  } catch (err) {
    geoCache.set(key, '');
    return '';
  }
}

async function updateDistrict(client, id, district) {
  await client.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { id },
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

function parseArgs(argv) {
  const args = {
    phone: null,
    dryRun: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--phone') {
      args.phone = argv[i + 1] || null;
      i += 1;
    } else if (token === '--dry-run') {
      args.dryRun = true;
    } else if (token === '--help' || token === '-h') {
      console.log('Usage:');
      console.log('  node scripts/backfill-address-district.js');
      console.log('  node scripts/backfill-address-district.js --phone 9074135121 --dry-run');
      process.exit(0);
    } else {
      console.error(`Unknown argument: ${token}`);
      process.exit(1);
    }
  }

  return args;
}

async function getTargetItemsByPhone(phone) {
  const user = await User.findByMobile(phone);
  if (!user) {
    throw new Error(`User not found for mobile: ${phone}`);
  }

  let customer = null;
  try {
    customer = await Customer.findByUserId(user.id);
  } catch (err) {
    // Continue without customer row; addresses may still be saved under user.id.
  }

  const ids = new Set();
  if (user.id !== null && user.id !== undefined) ids.add(user.id);
  if (customer && customer.id !== null && customer.id !== undefined) ids.add(customer.id);

  const all = [];
  for (const id of ids) {
    try {
      const rows = await Address.findByCustomerId(id);
      if (Array.isArray(rows) && rows.length) {
        all.push(...rows);
      }
    } catch (err) {
      console.warn(`⚠️ Failed to fetch addresses for customer_id ${id}: ${err.message}`);
    }
  }

  const deduped = [...new Map(all.map((item) => [item.id, item])).values()];
  return {
    user,
    customer,
    ids: [...ids],
    items: deduped
  };
}

async function main() {
  const { phone, dryRun } = parseArgs(process.argv.slice(2));
  const client = getDynamoDBClient();
  const pinCache = new Map();
  const geoCache = new Map();

  let lastKey = null;
  let scanned = 0;
  let alreadyHasDistrict = 0;
  let updated = 0;
  let unresolved = 0;
  let failed = 0;
  let pinResolved = 0;
  let geoResolved = 0;
  let geoCalls = 0;
  let wouldUpdate = 0;

  if (phone) {
    console.log(`\nTarget mode: phone=${phone} ${dryRun ? '(dry-run)' : ''}`);
    const target = await getTargetItemsByPhone(phone);
    console.log(`User ID: ${target.user.id}, Customer ID: ${target.customer?.id || 'N/A'}`);
    console.log(`Address records to process: ${target.items.length}\n`);

    for (const item of target.items) {
      scanned += 1;
      const currentDistrict = normalizeDistrict(item.district);
      if (currentDistrict) {
        alreadyHasDistrict += 1;
        continue;
      }

      try {
        let district = '';
        const pin = getPincode(item.address);
        if (pin) {
          district = await resolveDistrictFromPincode(pin, pinCache);
          if (district) pinResolved += 1;
        }

        if (!district) {
          const coords = getCoordinates(item);
          if (coords) {
            geoCalls += 1;
            district = await resolveDistrictFromLatLng(coords.lat, coords.lon, geoCache);
            if (district) geoResolved += 1;
            await sleep(1100);
          }
        }

        if (district) {
          if (dryRun) {
            wouldUpdate += 1;
            console.log(`🧪 DRY RUN: id=${item.id} => district="${district}"`);
          } else {
            await updateDistrict(client, item.id, district);
            updated += 1;
          }
        } else {
          unresolved += 1;
        }
      } catch (err) {
        failed += 1;
        console.error(`❌ Failed for address id ${item.id}:`, err.message);
      }
    }
  } else {
    do {
      const scanParams = {
        TableName: TABLE_NAME,
        ProjectionExpression: 'id, #address, district, lat_log, latitude, longitude',
        ExpressionAttributeNames: {
          '#address': 'address'
        }
      };
      if (lastKey) {
        scanParams.ExclusiveStartKey = lastKey;
      }
      const response = await client.send(new ScanCommand(scanParams));

      const items = response.Items || [];
      scanned += items.length;

      for (const item of items) {
        const currentDistrict = normalizeDistrict(item.district);
        if (currentDistrict) {
          alreadyHasDistrict += 1;
          continue;
        }

        try {
          let district = '';

          const pin = getPincode(item.address);
          if (pin) {
            district = await resolveDistrictFromPincode(pin, pinCache);
            if (district) pinResolved += 1;
          }

          if (!district) {
            const coords = getCoordinates(item);
            if (coords) {
              geoCalls += 1;
              district = await resolveDistrictFromLatLng(coords.lat, coords.lon, geoCache);
              if (district) geoResolved += 1;
              // Be polite to Nominatim usage policy.
              await sleep(1100);
            }
          }

          if (district) {
            if (dryRun) {
              wouldUpdate += 1;
            } else {
              await updateDistrict(client, item.id, district);
              updated += 1;
            }
          } else {
            unresolved += 1;
          }
        } catch (err) {
          failed += 1;
          console.error(`❌ Failed for address id ${item.id}:`, err.message);
        }
      }

      lastKey = response.LastEvaluatedKey;
      const updatedLabel = dryRun ? `Would Update: ${wouldUpdate}` : `Updated: ${updated}`;
      console.log(`Processed: ${scanned}, ${updatedLabel}, Unresolved: ${unresolved}, Failed: ${failed}`);
    } while (lastKey);
  }

  console.log('\nBackfill completed');
  console.log(
    JSON.stringify(
      {
        table: TABLE_NAME,
        mode: phone ? 'phone' : 'full_scan',
        phone: phone || null,
        dry_run: dryRun,
        scanned,
        already_has_district: alreadyHasDistrict,
        updated,
        would_update: wouldUpdate,
        unresolved,
        failed,
        pin_resolved: pinResolved,
        geo_resolved: geoResolved,
        unique_pincodes_queried: pinCache.size,
        unique_geo_queries_cached: geoCache.size,
        geo_calls: geoCalls
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error('Fatal backfill error:', err);
  process.exit(1);
});
