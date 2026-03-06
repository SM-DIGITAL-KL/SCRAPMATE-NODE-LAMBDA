#!/usr/bin/env node

/**
 * Backfill `zone` in addresses table using district_pincode_prefixes mapping.
 *
 * Resolution order:
 * 1) district -> zone (exact normalized district match)
 * 2) pincode first 3 digits -> zone (only when unique)
 *
 * Usage:
 *   node scripts/backfill-address-zone.js                  # dry-run
 *   node scripts/backfill-address-zone.js --apply          # write to DB
 *   node scripts/backfill-address-zone.js --apply --force  # overwrite existing zone
 */

require('dotenv').config();
const { loadEnvFromFile } = require('../utils/loadEnv');
loadEnvFromFile();

const { getDynamoDBClient } = require('../config/dynamodb');
const { ScanCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');

const ADDRESS_TABLE = 'addresses';
const ZONE_TABLE = 'district_pincode_prefixes';

function parseArgs(argv) {
  return {
    apply: argv.includes('--apply'),
    force: argv.includes('--force'),
    verbose: argv.includes('--verbose')
  };
}

function norm(v) {
  return String(v || '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '')
    .trim();
}

function getPrefix3(pincode) {
  const digits = String(pincode || '').replace(/\D/g, '');
  if (digits.length < 3) return '';
  return digits.slice(0, 3);
}

function pickRandom(list) {
  if (!Array.isArray(list) || list.length === 0) return '';
  const idx = Math.floor(Math.random() * list.length);
  return list[idx];
}

function zoneCodeFromItem(item) {
  if (item.zone) return String(item.zone).trim();
  if (item.zone_code) return String(item.zone_code).trim();
  if (item.zone_no !== undefined && item.zone_no !== null && item.zone_no !== '') {
    const n = Number(item.zone_no);
    if (!Number.isNaN(n)) return `Z${String(n).padStart(2, '0')}`;
  }
  return '';
}

async function scanAll(client, tableName, projectionExpression, expressionAttributeNames) {
  let lastKey = null;
  const rows = [];
  do {
    const params = { TableName: tableName };
    if (projectionExpression) params.ProjectionExpression = projectionExpression;
    if (expressionAttributeNames) params.ExpressionAttributeNames = expressionAttributeNames;
    if (lastKey) params.ExclusiveStartKey = lastKey;
    const res = await client.send(new ScanCommand(params));
    if (Array.isArray(res.Items)) rows.push(...res.Items);
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);
  return rows;
}

async function buildZoneMaps(client) {
  const rows = await scanAll(
    client,
    ZONE_TABLE,
    'district_name, district_slug, pincode_prefixes, #z, zone_code, zone_no',
    { '#z': 'zone' }
  );

  const districtToZone = new Map();
  const prefixToZones = new Map(); // prefix -> Set(zone)

  for (const r of rows) {
    const zone = zoneCodeFromItem(r);
    if (!zone) continue;

    const d1 = norm(r.district_name);
    const d2 = norm(r.district_slug);
    if (d1 && d1 !== 'alldistricts' && d1 !== 'all') districtToZone.set(d1, zone);
    if (d2 && d2 !== 'alldistricts' && d2 !== 'all') districtToZone.set(d2, zone);

    const prefixes = Array.isArray(r.pincode_prefixes) ? r.pincode_prefixes : [];
    for (const p of prefixes) {
      const px = getPrefix3(p);
      if (!px) continue;
      if (!prefixToZones.has(px)) prefixToZones.set(px, new Set());
      prefixToZones.get(px).add(zone);
    }
  }

  return { districtToZone, prefixToZones };
}

async function updateZone(client, id, zone) {
  await client.send(
    new UpdateCommand({
      TableName: ADDRESS_TABLE,
      Key: { id },
      UpdateExpression: 'SET #zone = :zone, #updated_at = :updated_at',
      ExpressionAttributeNames: {
        '#zone': 'zone',
        '#updated_at': 'updated_at'
      },
      ExpressionAttributeValues: {
        ':zone': zone,
        ':updated_at': new Date().toISOString()
      }
    })
  );
}

async function main() {
  const { apply, force, verbose } = parseArgs(process.argv.slice(2));
  const client = getDynamoDBClient();

  console.log(`Mode: ${apply ? 'APPLY' : 'DRY-RUN'} | force=${force ? 'yes' : 'no'}`);
  console.log('Loading zone mappings...');
  const { districtToZone, prefixToZones } = await buildZoneMaps(client);
  console.log(`Mappings: districts=${districtToZone.size}, prefixes=${prefixToZones.size}`);

  const addresses = await scanAll(client, ADDRESS_TABLE, 'id, district, pincode, #z', { '#z': 'zone' });
  let scanned = 0;
  let resolved = 0;
  let updated = 0;
  let skippedHasZone = 0;
  let ambiguous = 0;
  let unresolved = 0;
  let ambiguousRandomAssigned = 0;
  let unresolvedDefaultAssigned = 0;

  for (const a of addresses) {
    scanned += 1;
    const hasZone = String(a.zone || '').trim();
    if (hasZone && !force) {
      skippedHasZone += 1;
      continue;
    }

    let zone = '';
    let source = '';

    const d = norm(a.district);
    if (d && districtToZone.has(d)) {
      zone = districtToZone.get(d);
      source = 'district';
    } else {
      const px = getPrefix3(a.pincode);
      if (px && prefixToZones.has(px)) {
        const zones = [...prefixToZones.get(px)];
        if (zones.length === 1) {
          zone = zones[0];
          source = 'pincode_prefix';
        } else {
          ambiguous += 1;
          zone = pickRandom(zones);
          source = 'ambiguous_random';
          ambiguousRandomAssigned += 1;
          if (verbose) {
            console.log(`⚠️ id=${a.id} ambiguous prefix ${px} => ${zones.join(',')} | picked=${zone}`);
          }
        }
      }
    }

    if (!zone) {
      unresolved += 1;
      zone = 'Z00';
      source = 'unresolved_default';
      unresolvedDefaultAssigned += 1;
      if (verbose) {
        console.log(`⚠️ id=${a.id} unresolved (district="${a.district || ''}" pincode="${a.pincode || ''}") | picked=${zone}`);
      }
    }

    resolved += 1;
    if (apply) {
      await updateZone(client, a.id, zone);
      updated += 1;
      if (verbose) console.log(`✅ id=${a.id} zone=${zone} (${source})`);
    } else if (verbose) {
      console.log(`🧪 id=${a.id} zone=${zone} (${source})`);
    }
  }

  console.log('\nDone');
  console.log(
    JSON.stringify(
      {
        table: ADDRESS_TABLE,
        mode: apply ? 'apply' : 'dry_run',
        force,
        scanned,
        resolved,
        updated,
        skipped_has_zone: skippedHasZone,
        ambiguous_prefix: ambiguous,
        unresolved,
        ambiguous_random_assigned: ambiguousRandomAssigned,
        unresolved_default_assigned: unresolvedDefaultAssigned
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error('Failed:', err.message || err);
  process.exit(1);
});
