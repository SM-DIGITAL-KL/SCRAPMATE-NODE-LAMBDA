const Address = require('../models/Address');

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

      if (!addres_type || !['Work', 'Home', 'Other'].includes(addres_type)) {
        console.log('❌ Validation failed: invalid addres_type');
        return res.status(400).json({
          status: 'error',
          msg: 'addres_type must be one of: Work, Home, Other'
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
      const addressData = {
        customer_id: parseInt(customer_id),
        address: address.trim(),
        addres_type: addres_type,
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
        if (!['Work', 'Home', 'Other'].includes(addres_type)) {
          console.log('❌ Validation failed: invalid addres_type');
          return res.status(400).json({
            status: 'error',
            msg: 'addres_type must be one of: Work, Home, Other'
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
}

module.exports = V2AddressController;

