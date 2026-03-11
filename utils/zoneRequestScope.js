const Address = require('../models/Address');
const Shop = require('../models/Shop');
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const { getDynamoDBClient } = require('../config/dynamodb');
const { ScanCommand } = require('@aws-sdk/lib-dynamodb');

const ZONE_TABLE = 'district_pincode_prefixes';
const ZONE_CACHE_TTL_MS = 10 * 60 * 1000;

let zoneMappingsCache = {
  loadedAt: 0,
  prefixToZones: new Map()
};

function normalizeZoneFromEmail(email) {
  const value = String(email || '').trim().toLowerCase();
  const match = value.match(/^zone(\d{1,2})@scrapmate\.co\.in$/i);
  if (!match) return '';
  const n = parseInt(match[1], 10);
  if (Number.isNaN(n) || n < 1 || n > 48) return '';
  return `Z${String(n).padStart(2, '0')}`;
}

function normalizeZoneCode(zoneValue) {
  const raw = String(zoneValue || '').trim().toUpperCase();
  if (!raw) return '';
  const match = raw.match(/^(?:ZONE|Z)\s*0*(\d{1,2})$/);
  if (!match) return '';
  const n = parseInt(match[1], 10);
  if (Number.isNaN(n) || n < 1 || n > 48) return '';
  return `Z${String(n).padStart(2, '0')}`;
}

function getPrefix3(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length >= 3 ? digits.slice(0, 3) : '';
}

function extractPincode(text) {
  const match = String(text || '').match(/\b(\d{6})\b/);
  return match ? match[1] : '';
}

async function loadZonePrefixMappings() {
  const now = Date.now();
  if ((now - zoneMappingsCache.loadedAt) < ZONE_CACHE_TTL_MS && zoneMappingsCache.prefixToZones.size > 0) {
    return zoneMappingsCache;
  }

  const client = getDynamoDBClient();
  const prefixToZones = new Map();
  let lastKey = null;

  const zoneCodeFromItem = (item) => {
    if (item.zone) return normalizeZoneCode(item.zone);
    if (item.zone_code) return normalizeZoneCode(item.zone_code);
    if (item.zone_no !== undefined && item.zone_no !== null && item.zone_no !== '') {
      const n = Number(item.zone_no);
      if (!Number.isNaN(n)) return `Z${String(n).padStart(2, '0')}`;
    }
    return '';
  };

  do {
    const response = await client.send(new ScanCommand({
      TableName: ZONE_TABLE,
      ProjectionExpression: 'pincode_prefixes, #z, zone_code, zone_no',
      ExpressionAttributeNames: { '#z': 'zone' },
      ExclusiveStartKey: lastKey || undefined
    }));

    for (const item of response.Items || []) {
      const zone = zoneCodeFromItem(item);
      if (!zone) continue;
      const prefixes = Array.isArray(item.pincode_prefixes) ? item.pincode_prefixes : [];
      for (const prefix of prefixes) {
        const key = getPrefix3(prefix);
        if (!key) continue;
        if (!prefixToZones.has(key)) prefixToZones.set(key, new Set());
        prefixToZones.get(key).add(zone);
      }
    }

    lastKey = response.LastEvaluatedKey;
  } while (lastKey);

  zoneMappingsCache = {
    loadedAt: now,
    prefixToZones
  };

  return zoneMappingsCache;
}

function getUserIdFromRequest(req, tokenPayload, tokenUser) {
  const raw = req.query.userId
    || req.query.user_id
    || req.headers['x-user-id']
    || req.headers['user-id']
    || req.user?.id
    || req.user?.user_id
    || req.user?.customer_id
    || (tokenPayload ? (tokenPayload.id || tokenPayload.user_id || tokenPayload.customer_id) : '')
    || tokenUser?.id
    || '';

  return typeof raw === 'string' && !isNaN(raw) ? parseInt(raw, 10) : raw;
}

async function resolveRequestZone(req, options = {}) {
  const allowQueryZone = options.allowQueryZone !== false;

  const emailZone = normalizeZoneFromEmail(req.user?.email || req.headers['x-user-email'] || '');
  if (emailZone) return emailZone;

  if (allowQueryZone && req.query.zone) {
    const explicitZone = normalizeZoneCode(req.query.zone);
    if (explicitZone) return explicitZone;
  }

  const authHeader = String(req.headers?.authorization || '');
  const bearerToken = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7).trim()
    : '';

  let tokenPayload = null;
  if (bearerToken) {
    try {
      tokenPayload = jwt.decode(bearerToken) || null;
    } catch (_) {
      tokenPayload = null;
    }
  }

  const mobileRaw = req.query.phoneNumber
    || req.query.phone
    || req.query.mobile
    || req.headers['x-user-phone']
    || req.headers['x-phone-number']
    || (tokenPayload ? (tokenPayload.phone_number || tokenPayload.mob_num || tokenPayload.phoneNumber) : '')
    || '';

  let tokenUser = null;
  const normalizedMobile = String(mobileRaw || '').replace(/\D/g, '');
  if (normalizedMobile) {
    try {
      tokenUser = await User.findByMobile(normalizedMobile);
    } catch (_) {
      tokenUser = null;
    }
  }

  const userId = getUserIdFromRequest(req, tokenPayload, tokenUser);
  if (!userId) return '';

  try {
    const addresses = await Address.findByCustomerId(userId);
    const latest = Array.isArray(addresses) && addresses.length > 0 ? addresses[0] : null;
    const zone = normalizeZoneCode(Address.normalizeZone(latest?.zone || ''));
    if (zone) return zone;
  } catch (_) {}

  try {
    const shops = await Shop.findAllByUserId(userId);
    const shop = Array.isArray(shops) && shops.length > 0 ? shops[0] : null;
    if (!shop) return '';

    const explicitZone = normalizeZoneCode(Address.normalizeZone(shop.zone || ''));
    if (explicitZone) return explicitZone;

    const pincode = String(shop.pincode || extractPincode(shop.address || '')).trim();
    const prefix = getPrefix3(pincode);
    if (!prefix) return '';

    const mappings = await loadZonePrefixMappings();
    const candidates = mappings.prefixToZones.get(prefix);
    if (!candidates || candidates.size === 0) return '';

    return [...candidates].sort()[0];
  } catch (_) {
    return '';
  }
}

module.exports = {
  normalizeZoneFromEmail,
  normalizeZoneCode,
  resolveRequestZone
};
