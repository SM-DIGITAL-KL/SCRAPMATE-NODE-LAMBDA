#!/usr/bin/env node

/**
 * Export all addresses (with district) from DynamoDB to XLSX.
 *
 * Usage:
 *   node scripts/export-addresses-with-district-xlsx.js
 */

require('dotenv').config();
const path = require('path');
const { getDynamoDBClient } = require('../config/dynamodb');
const { ScanCommand } = require('@aws-sdk/lib-dynamodb');

let XLSX;
try {
  XLSX = require('xlsx');
} catch (err) {
  console.error('❌ xlsx package not found. Run: npm install xlsx');
  process.exit(1);
}

const TABLE_NAME = 'addresses';

function formatTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
}

function toNumberOrEmpty(value) {
  if (value === null || value === undefined || value === '') return '';
  const num = Number(value);
  return Number.isNaN(num) ? '' : num;
}

function toText(value) {
  return value === null || value === undefined ? '' : String(value);
}

async function fetchAllAddresses(client) {
  const all = [];
  let lastKey = null;

  do {
    const params = { TableName: TABLE_NAME };
    if (lastKey) params.ExclusiveStartKey = lastKey;

    const res = await client.send(new ScanCommand(params));
    if (Array.isArray(res.Items) && res.Items.length) {
      all.push(...res.Items);
    }
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);

  return all;
}

async function main() {
  console.log('\n📊 Exporting addresses with district to XLSX...');
  const client = getDynamoDBClient();
  const addresses = await fetchAllAddresses(client);

  console.log(`✅ Total addresses fetched: ${addresses.length}`);
  if (!addresses.length) {
    console.log('⚠️ No address records found.');
    return;
  }

  const rows = addresses.map((a, idx) => ({
    'SL NO': idx + 1,
    'ID': toText(a.id),
    'CUSTOMER ID': toText(a.customer_id),
    'ADDRESS': toText(a.address),
    'DISTRICT': toText(a.district),
    'STATE': toText(a.state),
    'PLACE': toText(a.place),
    'PINCODE': toText(a.pincode),
    'LATITUDE': toNumberOrEmpty(a.latitude),
    'LONGITUDE': toNumberOrEmpty(a.longitude),
    'LAT_LOG': toText(a.lat_log),
    'ADDRESS TYPE': toText(a.addres_type),
    'LANDMARK': toText(a.landmark),
    'BUILDING NO': toText(a.building_no),
    'DEL STATUS': toText(a.del_status),
    'CREATED AT': toText(a.created_at),
    'UPDATED AT': toText(a.updated_at)
  }));

  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(rows);
  worksheet['!cols'] = [
    { wch: 8 }, { wch: 18 }, { wch: 18 }, { wch: 60 }, { wch: 22 },
    { wch: 18 }, { wch: 20 }, { wch: 10 }, { wch: 12 }, { wch: 12 },
    { wch: 24 }, { wch: 14 }, { wch: 30 }, { wch: 16 }, { wch: 10 },
    { wch: 24 }, { wch: 24 }
  ];

  XLSX.utils.book_append_sheet(workbook, worksheet, 'Addresses');

  const filename = `addresses-with-district-${formatTimestamp()}.xlsx`;
  const filepath = path.join(__dirname, filename);
  XLSX.writeFile(workbook, filepath);

  console.log(`📁 File created: ${filepath}`);
  console.log('✅ Export completed.\n');
}

main().catch((err) => {
  console.error('❌ Export failed:', err.message || err);
  process.exit(1);
});

