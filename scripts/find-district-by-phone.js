/**
 * Find district details for addresses linked to a mobile number.
 *
 * Usage:
 *   node scripts/find-district-by-phone.js <mobile_number>
 * Example:
 *   node scripts/find-district-by-phone.js 8056744395
 */

require('dotenv').config();
const { loadEnvFromFile } = require('../utils/loadEnv');
loadEnvFromFile();

const User = require('../models/User');
const Customer = require('../models/Customer');
const Address = require('../models/Address');

const PINCODE_RE = /\b(\d{6})\b/;

function normalize(value) {
  return value ? String(value).trim() : '';
}

function getPincode(address) {
  const text = typeof address === 'string' ? address : '';
  const m = text.match(PINCODE_RE);
  return m ? m[1] : '';
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

async function districtFromPincode(pin) {
  if (!pin) return '';
  try {
    const data = await fetchJson(`https://api.postalpincode.in/pincode/${pin}`);
    if (
      Array.isArray(data) &&
      data[0] &&
      data[0].Status === 'Success' &&
      Array.isArray(data[0].PostOffice) &&
      data[0].PostOffice[0]
    ) {
      return normalize(data[0].PostOffice[0].District);
    }
  } catch (err) {
    return '';
  }
  return '';
}

async function districtFromLatLng(lat, lon) {
  try {
    const data = await fetchJson(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&addressdetails=1&zoom=10`,
      { 'User-Agent': 'scrapmate-find-district/1.0 (ops@scrapmate.co.in)' }
    );
    const a = data && data.address ? data.address : {};
    return normalize(a.state_district || a.county || a.district || '');
  } catch (err) {
    return '';
  }
}

async function main() {
  const mobile = process.argv[2];
  if (!mobile) {
    console.error('Usage: node scripts/find-district-by-phone.js <mobile_number>');
    process.exit(1);
  }

  const user = await User.findByMobile(mobile);
  if (!user) {
    console.error(`No user found for mobile: ${mobile}`);
    process.exit(1);
  }

  let customer = null;
  try {
    customer = await Customer.findByUserId(user.id);
  } catch (err) {
    // Continue; addresses may be stored by user.id only.
  }

  const ids = new Set([user.id]);
  if (customer && customer.id !== undefined && customer.id !== null) ids.add(customer.id);

  const all = [];
  for (const id of ids) {
    try {
      const rows = await Address.findByCustomerId(id);
      if (Array.isArray(rows) && rows.length) all.push(...rows);
    } catch (err) {
      // Ignore per-id errors and continue.
    }
  }

  const addresses = [...new Map(all.map((a) => [a.id, a])).values()];
  console.log(`User ID: ${user.id}`);
  console.log(`Customer ID: ${customer?.id || 'N/A'}`);
  console.log(`Address records found: ${addresses.length}\n`);

  for (const a of addresses) {
    const existing = normalize(a.district);
    const pin = getPincode(a.address);
    let inferred = '';
    let source = '';

    if (pin) {
      inferred = await districtFromPincode(pin);
      if (inferred) source = 'pincode';
    }
    if (!inferred) {
      const coords = getCoordinates(a);
      if (coords) {
        inferred = await districtFromLatLng(coords.lat, coords.lon);
        if (inferred) source = 'latlng';
      }
    }

    console.log(`Address ID: ${a.id}`);
    console.log(`Address: ${a.address || 'N/A'}`);
    console.log(`District (saved): ${existing || 'N/A'}`);
    console.log(`District (inferred): ${inferred || 'N/A'}${source ? ` [${source}]` : ''}`);
    console.log('---');
  }
}

main().catch((err) => {
  console.error('Error:', err.message || err);
  process.exit(1);
});

