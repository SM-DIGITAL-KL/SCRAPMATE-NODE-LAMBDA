const Address = require('../models/Address');
const User = require('../models/User');
const V2AuthService = require('../services/auth/v2AuthService');
const { getDynamoDBClient } = require('../config/dynamodb');
const { ScanCommand } = require('@aws-sdk/lib-dynamodb');

const ZONE_TABLE = 'district_pincode_prefixes';
const ZONE_CACHE_TTL_MS = 10 * 60 * 1000;
const PINCODE_RE = /\b(\d{6})\b/;
const STANDARD_ADDRESS_TYPES = ['Work', 'Home', 'Other'];

let zoneCache = {
  loadedAt: 0,
  districtToZone: new Map(),
  prefixToZones: new Map()
};

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '')
    .trim();
}

function getPrefix3(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length >= 3 ? digits.slice(0, 3) : '';
}

function getPincodeFromAddress(address) {
  if (!address || typeof address !== 'string') return '';
  const match = address.match(PINCODE_RE);
  return match ? match[1] : '';
}

function parsePostcode(postcode) {
  const clean = String(postcode || '').replace(/\s/g, '');
  return /^\d{6}$/.test(clean) ? clean : '';
}

function parseDistrict(addressObj) {
  if (!addressObj) return '';
  return String(addressObj.state_district || addressObj.county || addressObj.district || '').trim();
}

function parseState(addressObj) {
  if (!addressObj) return '';
  return String(addressObj.state || addressObj.region || addressObj.state_code || '').trim();
}

async function resolveFromLatLng(lat, lng) {
  if (lat === undefined || lng === undefined || lat === null || lng === null) {
    return { district: '', state: '', pincode: '' };
  }
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}&addressdetails=1&zoom=18`,
      {
        headers: {
          'User-Agent': 'scrapmate-v2-address-controller/1.0 (ops@scrapmate.co.in)'
        }
      }
    );
    if (!res.ok) return { district: '', state: '', pincode: '' };
    const data = await res.json();
    return {
      district: parseDistrict(data?.address),
      state: parseState(data?.address),
      pincode: parsePostcode(data?.address?.postcode)
    };
  } catch (error) {
    return { district: '', state: '', pincode: '' };
  }
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

async function loadZoneMappings() {
  const now = Date.now();
  if ((now - zoneCache.loadedAt) < ZONE_CACHE_TTL_MS && zoneCache.districtToZone.size > 0) {
    return zoneCache;
  }

  const client = getDynamoDBClient();
  let lastKey = null;
  const districtToZone = new Map();
  const prefixToZones = new Map();

  do {
    const response = await client.send(new ScanCommand({
      TableName: ZONE_TABLE,
      ProjectionExpression: 'district_name, district_slug, pincode_prefixes, #z, zone_code, zone_no',
      ExpressionAttributeNames: { '#z': 'zone' },
      ExclusiveStartKey: lastKey || undefined
    }));

    const items = response.Items || [];
    for (const item of items) {
      const zone = zoneCodeFromItem(item);
      if (!zone) continue;

      const districtName = normalizeText(item.district_name);
      const districtSlug = normalizeText(item.district_slug);
      if (districtName && districtName !== 'all' && districtName !== 'alldistricts') {
        districtToZone.set(districtName, zone);
      }
      if (districtSlug && districtSlug !== 'all' && districtSlug !== 'alldistricts') {
        districtToZone.set(districtSlug, zone);
      }

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

  zoneCache = {
    loadedAt: now,
    districtToZone,
    prefixToZones
  };
  return zoneCache;
}

async function deriveAddressGeoFields({ address, latitude, longitude }) {
  const fromAddressPin = getPincodeFromAddress(address);
  const fromGeo = await resolveFromLatLng(latitude, longitude);
  const district = fromGeo.district || '';
  const state = fromGeo.state || '';
  const pincode = fromAddressPin || fromGeo.pincode || '';

  let zone = '';
  try {
    const mappings = await loadZoneMappings();
    // Priority: zone by first 3 digits of pincode found in address text.
    const addressPrefix = getPrefix3(fromAddressPin);
    if (addressPrefix && mappings.prefixToZones.has(addressPrefix)) {
      const choices = [...mappings.prefixToZones.get(addressPrefix)].sort();
      zone = choices.length > 0 ? choices[0] : '';
    }

    // Fallback: district mapping.
    if (!zone) {
      const districtKey = normalizeText(district);
      if (districtKey && mappings.districtToZone.has(districtKey)) {
        zone = mappings.districtToZone.get(districtKey);
      }
    }

    // Final fallback: pincode prefix (including geocode pincode if address pin missing).
    if (!zone) {
      const prefix = getPrefix3(pincode);
      if (prefix && mappings.prefixToZones.has(prefix)) {
        const choices = [...mappings.prefixToZones.get(prefix)].sort();
        zone = choices.length > 0 ? choices[0] : '';
      }
    }
  } catch (error) {
    console.warn('⚠️ Failed to load zone mappings:', error.message);
  }

  return {
    district,
    state,
    pincode,
    zone: zone || 'Z00'
  };
}

class V2AddressController {
  /**
   * POST /api/v2/addresses
   * Save a new address for a customer
   * Body: {
   *   customer_id: number,
   *   address: string,
   *   addres_type: 'Work' | 'Home' | 'Other',
   *   building_no?: string,
   *   landmark?: string,
   *   lat_log?: string (format: "latitude,longitude"),
   *   latitude?: number,
   *   longitude?: number
   * }
   */
  static async saveAddress(req, res) {
    try {
      console.log('📍 V2AddressController.saveAddress called');
      console.log('   Request body:', JSON.stringify(req.body, null, 2));
      
      const { customer_id, address, addres_type, building_no, landmark, lat_log, latitude, longitude } = req.body;

      // Validation
      if (!customer_id) {
        console.log('❌ Validation failed: customer_id is required');
        return res.status(400).json({
          status: 'error',
          msg: 'customer_id is required'
        });
      }

      if (!address || address.trim() === '') {
        console.log('❌ Validation failed: address is required');
        return res.status(400).json({
          status: 'error',
          msg: 'address is required'
        });
      }

      if (!addres_type || !STANDARD_ADDRESS_TYPES.includes(addres_type)) {
        console.log('❌ Validation failed: invalid addres_type');
        return res.status(400).json({
          status: 'error',
          msg: `addres_type must be one of: ${STANDARD_ADDRESS_TYPES.join(', ')}`
        });
      }

      // Validate that we have either lat_log or both latitude and longitude
      if (!lat_log && (latitude === undefined || longitude === undefined)) {
        console.log('❌ Validation failed: location data missing');
        return res.status(400).json({
          status: 'error',
          msg: 'Either lat_log or both latitude and longitude are required'
        });
      }

      console.log('✅ Validation passed, creating address...');

      // Parse and validate latitude/longitude
      let parsedLatitude = undefined;
      let parsedLongitude = undefined;
      
      if (latitude !== undefined && latitude !== null && latitude !== '') {
        parsedLatitude = typeof latitude === 'string' ? parseFloat(latitude) : latitude;
        if (isNaN(parsedLatitude)) {
          parsedLatitude = undefined;
        }
      }
      
      if (longitude !== undefined && longitude !== null && longitude !== '') {
        parsedLongitude = typeof longitude === 'string' ? parseFloat(longitude) : longitude;
        if (isNaN(parsedLongitude)) {
          parsedLongitude = undefined;
        }
      }
      
      // Ensure lat_log is created from latitude/longitude if not provided
      let finalLatLog = lat_log ? lat_log.trim() : undefined;
      if (!finalLatLog && parsedLatitude !== undefined && parsedLongitude !== undefined) {
        finalLatLog = `${parsedLatitude},${parsedLongitude}`;
      }

      // Create address
      const derivedGeo = await deriveAddressGeoFields({
        address: address.trim(),
        latitude: parsedLatitude,
        longitude: parsedLongitude
      });
      const addressData = {
        customer_id: parseInt(customer_id),
        address: address.trim(),
        addres_type: addres_type,
        district: derivedGeo.district,
        state: derivedGeo.state,
        pincode: derivedGeo.pincode,
        zone: derivedGeo.zone,
        building_no: building_no ? building_no.trim() : '',
        landmark: landmark ? landmark.trim() : '',
        lat_log: finalLatLog,
        latitude: parsedLatitude,
        longitude: parsedLongitude
      };

      console.log('   Address data to save:', JSON.stringify(addressData, null, 2));
      console.log('   Parsed location:', {
        latitude: parsedLatitude,
        longitude: parsedLongitude,
        lat_log: finalLatLog
      });

      const savedAddress = await Address.create(addressData);

      console.log('✅ Address saved successfully:', savedAddress.id);

      return res.status(200).json({
        status: 'success',
        msg: 'Address saved successfully',
        data: savedAddress
      });
    } catch (error) {
      console.error('❌ V2AddressController.saveAddress error:', error);
      console.error('   Error stack:', error.stack);
      return res.status(500).json({
        status: 'error',
        msg: error.message || 'Failed to save address'
      });
    }
  }

  /**
   * GET /api/v2/addresses/customer/:customerId
   * Get all addresses for a customer
   */
  static async getCustomerAddresses(req, res) {
    try {
      console.log('📥 V2AddressController.getCustomerAddresses called');
      const { customerId } = req.params;
      console.log('   customerId:', customerId);

      if (!customerId) {
        console.error('   ❌ customerId is missing');
        return res.status(400).json({
          status: 'error',
          msg: 'customerId is required'
        });
      }

      console.log('   🔍 Calling Address.findByCustomerId...');
      const addresses = await Address.findByCustomerId(customerId);
      console.log('   ✅ Found addresses:', addresses?.length || 0);

      return res.status(200).json({
        status: 'success',
        data: addresses || []
      });
    } catch (error) {
      console.error('❌ V2AddressController.getCustomerAddresses error:', error);
      console.error('   Error message:', error.message);
      console.error('   Error stack:', error.stack);
      return res.status(500).json({
        status: 'error',
        msg: error.message || 'Failed to get addresses'
      });
    }
  }

  /**
   * GET /api/v2/addresses/marketplace/customer/:customerId
   * Get latest marketplace address for a customer
   */
  static async getMarketplaceAddress(req, res) {
    try {
      const { customerId } = req.params;
      if (!customerId) {
        return res.status(400).json({
          status: 'error',
          msg: 'customerId is required'
        });
      }

      const addresses = await Address.findByCustomerId(customerId);
      const sorted = (addresses || []).sort((a, b) => {
        const aTime = new Date(a.updated_at || a.created_at || 0).getTime();
        const bTime = new Date(b.updated_at || b.created_at || 0).getTime();
        return bTime - aTime;
      });

      return res.status(200).json({
        status: 'success',
        data: sorted[0] || null
      });
    } catch (error) {
      console.error('❌ V2AddressController.getMarketplaceAddress error:', error);
      return res.status(500).json({
        status: 'error',
        msg: error.message || 'Failed to get marketplace address'
      });
    }
  }

  /**
   * POST /api/v2/addresses/marketplace/upsert
   * Upsert marketplace address and mark marketplace role as M (without changing core user_type)
   * Body: {
   *   customer_id: number,
   *   address: string,
   *   building_no?: string,
   *   landmark?: string,
   *   lat_log?: string,
   *   latitude?: number,
   *   longitude?: number
   * }
   */
  static async upsertMarketplaceAddress(req, res) {
    try {
      const { customer_id, address, building_no, landmark, lat_log, latitude, longitude } = req.body || {};

      if (!customer_id) {
        return res.status(400).json({
          status: 'error',
          msg: 'customer_id is required'
        });
      }

      let parsedLatitude = undefined;
      let parsedLongitude = undefined;
      if (latitude !== undefined && latitude !== null && latitude !== '') {
        parsedLatitude = typeof latitude === 'string' ? parseFloat(latitude) : latitude;
        if (Number.isNaN(parsedLatitude)) parsedLatitude = undefined;
      }
      if (longitude !== undefined && longitude !== null && longitude !== '') {
        parsedLongitude = typeof longitude === 'string' ? parseFloat(longitude) : longitude;
        if (Number.isNaN(parsedLongitude)) parsedLongitude = undefined;
      }

      const finalLatLog = (lat_log && String(lat_log).trim())
        ? String(lat_log).trim()
        : ((parsedLatitude !== undefined && parsedLongitude !== undefined)
          ? `${parsedLatitude},${parsedLongitude}`
          : '');

      const cid = parseInt(customer_id, 10);
      let savedAddress = null;
      const normalizedAddress = String(address || '').trim();
      const hasAddressPayload = normalizedAddress !== '';
      if (hasAddressPayload) {
        const derivedGeo = await deriveAddressGeoFields({
          address: normalizedAddress,
          latitude: parsedLatitude,
          longitude: parsedLongitude
        });

        const existingAddresses = await Address.findByCustomerId(cid);
        const latestExistingAddress = (existingAddresses || [])
          .sort((a, b) => {
            const aTime = new Date(a.updated_at || a.created_at || 0).getTime();
            const bTime = new Date(b.updated_at || b.created_at || 0).getTime();
            return bTime - aTime;
          })[0];

        const addressData = {
          customer_id: cid,
          address: normalizedAddress,
          addres_type: STANDARD_ADDRESS_TYPES.includes(req.body?.addres_type) ? req.body.addres_type : 'Other',
          district: derivedGeo.district,
          state: derivedGeo.state,
          pincode: derivedGeo.pincode,
          zone: derivedGeo.zone,
          building_no: building_no ? String(building_no).trim() : '',
          landmark: landmark ? String(landmark).trim() : '',
          lat_log: finalLatLog,
          latitude: parsedLatitude,
          longitude: parsedLongitude
        };

        if (latestExistingAddress?.id) {
          savedAddress = await Address.update(latestExistingAddress.id, addressData);
        } else {
          savedAddress = await Address.create(addressData);
        }
      }

      // Additive marketplace role flag on current user.
      try {
        await User.updateProfile(cid, { marketplace_user_type: 'M' });
      } catch (userUpdateErr) {
        console.warn(`⚠️ Failed to set marketplace_user_type='M' for user ${cid}:`, userUpdateErr.message);
      }

      // Ensure a dedicated vendor_app marketplace profile exists (user_type='M')
      // while preserving existing R/S/SR users for the same mobile number.
      try {
        const baseUser = await User.findById(cid);
        const phone = String(baseUser?.mob_num || '').replace(/\D/g, '');
        if (phone.length === 10) {
          const marketplaceUser = await V2AuthService.findOrCreateMarketplaceUser(phone);
          if (marketplaceUser?.id) {
            console.log(`✅ Ensured marketplace user for phone ${phone}: user_id=${marketplaceUser.id}, type=${marketplaceUser.user_type}`);
          }
        } else {
          console.warn(`⚠️ Could not ensure marketplace user: invalid phone for user ${cid}`);
        }
      } catch (marketplaceEnsureErr) {
        console.warn(`⚠️ Failed to ensure dedicated marketplace user for base user ${cid}:`, marketplaceEnsureErr.message);
      }

      return res.status(200).json({
        status: 'success',
        msg: hasAddressPayload
          ? 'Marketplace address saved successfully'
          : 'Marketplace profile ensured successfully',
        data: savedAddress
      });
    } catch (error) {
      console.error('❌ V2AddressController.upsertMarketplaceAddress error:', error);
      return res.status(500).json({
        status: 'error',
        msg: error.message || 'Failed to save marketplace address'
      });
    }
  }

  /**
   * PUT /api/v2/addresses/:addressId
   * Update an address
   */
  static async updateAddress(req, res) {
    try {
      console.log('📍 V2AddressController.updateAddress called');
      console.log('   Request body:', JSON.stringify(req.body, null, 2));
      
      const { addressId } = req.params;
      const { address, addres_type, building_no, landmark, lat_log, latitude, longitude } = req.body;

      if (!addressId) {
        console.log('❌ Validation failed: addressId is required');
        return res.status(400).json({
          status: 'error',
          msg: 'addressId is required'
        });
      }

      const updateData = {};
      if (address !== undefined) updateData.address = address.trim();
      if (addres_type !== undefined) {
        if (!STANDARD_ADDRESS_TYPES.includes(addres_type)) {
          console.log('❌ Validation failed: invalid addres_type');
          return res.status(400).json({
            status: 'error',
            msg: `addres_type must be one of: ${STANDARD_ADDRESS_TYPES.join(', ')}`
          });
        }
        updateData.addres_type = addres_type;
      }
      if (building_no !== undefined) updateData.building_no = building_no.trim();
      if (landmark !== undefined) updateData.landmark = landmark.trim();
      
      // Parse and validate latitude/longitude
      let parsedLatitude = undefined;
      let parsedLongitude = undefined;
      
      if (latitude !== undefined && latitude !== null && latitude !== '') {
        parsedLatitude = typeof latitude === 'string' ? parseFloat(latitude) : latitude;
        if (isNaN(parsedLatitude)) {
          parsedLatitude = undefined;
        }
      }
      
      if (longitude !== undefined && longitude !== null && longitude !== '') {
        parsedLongitude = typeof longitude === 'string' ? parseFloat(longitude) : longitude;
        if (isNaN(parsedLongitude)) {
          parsedLongitude = undefined;
        }
      }
      
      // Handle lat_log: if provided, use it; otherwise create from latitude/longitude
      if (lat_log !== undefined && lat_log !== null && lat_log !== '') {
        if (!lat_log.includes(',')) {
          console.log('❌ Validation failed: lat_log format invalid');
          return res.status(400).json({
            status: 'error',
            msg: 'lat_log must be in format "latitude,longitude"'
          });
        }
        updateData.lat_log = lat_log.trim();
        
        // If lat_log is provided but latitude/longitude are not, parse from lat_log
        if (parsedLatitude === undefined && parsedLongitude === undefined) {
          const [lat, lng] = lat_log.split(',').map(Number);
          if (!isNaN(lat) && !isNaN(lng)) {
            parsedLatitude = lat;
            parsedLongitude = lng;
          }
        }
      } else if (parsedLatitude !== undefined && parsedLongitude !== undefined) {
        // If latitude/longitude are provided but lat_log is not, create lat_log from them
        updateData.lat_log = `${parsedLatitude},${parsedLongitude}`;
      }
      
      // Add latitude and longitude to updateData if they were parsed
      if (parsedLatitude !== undefined) {
        updateData.latitude = parsedLatitude;
      }
      if (parsedLongitude !== undefined) {
        updateData.longitude = parsedLongitude;
      }

      const shouldDeriveGeo =
        address !== undefined ||
        lat_log !== undefined ||
        latitude !== undefined ||
        longitude !== undefined;

      if (shouldDeriveGeo) {
        const existingAddress = await Address.findById(parseInt(addressId));
        const resolvedAddress = updateData.address !== undefined
          ? updateData.address
          : (existingAddress?.address || '');
        const resolvedLatitude = parsedLatitude !== undefined
          ? parsedLatitude
          : (existingAddress?.latitude !== undefined ? Number(existingAddress.latitude) : undefined);
        const resolvedLongitude = parsedLongitude !== undefined
          ? parsedLongitude
          : (existingAddress?.longitude !== undefined ? Number(existingAddress.longitude) : undefined);

        const derivedGeo = await deriveAddressGeoFields({
          address: resolvedAddress,
          latitude: resolvedLatitude,
          longitude: resolvedLongitude
        });
        updateData.district = derivedGeo.district;
        updateData.state = derivedGeo.state;
        updateData.pincode = derivedGeo.pincode;
        updateData.zone = derivedGeo.zone;
      }

      console.log('   Update data:', JSON.stringify(updateData, null, 2));
      console.log('   Parsed location:', {
        latitude: parsedLatitude,
        longitude: parsedLongitude,
        lat_log: updateData.lat_log
      });

      if (Object.keys(updateData).length === 0) {
        console.log('❌ Validation failed: No fields to update');
        return res.status(400).json({
          status: 'error',
          msg: 'No fields to update'
        });
      }

      const updatedAddress = await Address.update(parseInt(addressId), updateData);

      console.log('✅ Address updated successfully:', updatedAddress);

      return res.status(200).json({
        status: 'success',
        msg: 'Address updated successfully',
        data: updatedAddress
      });
    } catch (error) {
      console.error('❌ V2AddressController.updateAddress error:', error);
      console.error('   Error stack:', error.stack);
      return res.status(500).json({
        status: 'error',
        msg: error.message || 'Failed to update address'
      });
    }
  }

  /**
   * DELETE /api/v2/addresses/:addressId
   * Delete an address (soft delete)
   */
  static async deleteAddress(req, res) {
    try {
      const { addressId } = req.params;

      if (!addressId) {
        return res.status(400).json({
          status: 'error',
          msg: 'addressId is required'
        });
      }

      await Address.delete(parseInt(addressId));

      return res.status(200).json({
        status: 'success',
        msg: 'Address deleted successfully'
      });
    } catch (error) {
      console.error('V2AddressController.deleteAddress error:', error);
      return res.status(500).json({
        status: 'error',
        msg: error.message || 'Failed to delete address'
      });
    }
  }

  /**
   * GET /api/v2/addresses/geo/resolve
   * Resolve district/state/pincode/zone from address + lat/lng using zone mapping flow.
   * Query: latitude, longitude, address (optional)
   */
  static async resolveGeo(req, res) {
    try {
      const { latitude, longitude, address } = req.query || {};
      const lat = latitude !== undefined && latitude !== null && latitude !== ''
        ? Number(latitude)
        : undefined;
      const lng = longitude !== undefined && longitude !== null && longitude !== ''
        ? Number(longitude)
        : undefined;

      if (lat === undefined || lng === undefined || Number.isNaN(lat) || Number.isNaN(lng)) {
        return res.status(400).json({
          status: 'error',
          msg: 'latitude and longitude are required',
          data: null
        });
      }

      const derivedGeo = await deriveAddressGeoFields({
        address: String(address || ''),
        latitude: lat,
        longitude: lng
      });

      return res.status(200).json({
        status: 'success',
        msg: 'Geo resolved successfully',
        data: derivedGeo
      });
    } catch (error) {
      console.error('❌ V2AddressController.resolveGeo error:', error);
      return res.status(500).json({
        status: 'error',
        msg: error.message || 'Failed to resolve geo fields',
        data: null
      });
    }
  }
}

module.exports = V2AddressController;
