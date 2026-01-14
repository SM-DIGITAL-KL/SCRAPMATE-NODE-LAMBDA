# Address Saving Flow After Login/OTP

## Summary

**❌ Address is NOT automatically saved in the database after login/OTP verification.**

The address must be manually saved by the user through the address modal or profile screens.

## Flow Details

### 1. Login/OTP Verification (`LoginScreen.tsx`)

After successful OTP verification:
- User data is stored (token, user info)
- **Address is CHECKED but NOT saved**
- If address is missing, a modal is shown to collect it

**Code Location**: `scrapmate/src/screens/Auth/LoginScreen.tsx` (lines 238-268)

```typescript
// Check if user has any addresses
let hasAddress = false;
try {
  if (user?.id) {
    const addresses = await getCustomerAddresses(user.id);
    hasAddress = addresses && addresses.length > 0;
  }
} catch (error) {
  console.error('Error checking addresses:', error);
  hasAddress = false;
}

// If address, email, or valid name is missing, show modal
if (!hasAddress || !hasEmail || !hasValidName) {
  console.log('⚠️ LoginScreen: Address, email, or valid name missing - showing required modal');
  setUserDataForModal(user);
  setIsAddressRequired(true);
  setShowAddressModal(true);
  // Don't call onLoginSuccess yet - wait for address/email/name to be added
  return;
}
```

### 2. Backend OTP Verification (`v2AuthService.js`)

The `verifyOtpAndLogin` function:
- ✅ Verifies OTP
- ✅ Finds or creates user
- ✅ Returns user data
- ❌ **Does NOT save addresses**

**Code Location**: `SCRAPMATE-NODE-LAMBDA/services/auth/v2AuthService.js` (line 384)

### 3. Address Saving (`AddAddressModal.tsx`)

Addresses are saved separately when:
- User fills the address modal after login
- User adds address from profile/settings
- User updates address

**Code Location**: `scrapmate/src/components/AddAddressModal.tsx` (lines 128-182)

```typescript
const handleSaveAddress = async () => {
  // ... validation ...
  
  // Save address
  const addressData: SaveAddressData = {
    customer_id: userData.id,
    address: fullAddress,
    addres_type: addressType,
    building_no: buildingNumber,
    landmark: landmark,
    latitude: selectedLocation?.latitude,
    longitude: selectedLocation?.longitude,
    lat_log: selectedLocation ? `${selectedLocation.latitude},${selectedLocation.longitude}` : undefined,
  };
  
  await saveAddress(addressData);
  // ... success handling ...
};
```

### 4. Backend Address API (`v2AddressController.js`)

Address is saved via `POST /api/v2/addresses` endpoint:
- Validates customer_id
- Creates address record in `addresses` table
- Stores address, coordinates, landmark, etc.

**Code Location**: `SCRAPMATE-NODE-LAMBDA/controllers/v2AddressController.js` (line 18)

## Database Tables

1. **`customer` table**: Stores basic customer info (name, email, phone)
   - Does NOT store addresses (address field is usually empty)

2. **`addresses` table**: Stores all customer addresses
   - `customer_id`: Links to customer
   - `address`: Full address string
   - `latitude`, `longitude`: Coordinates
   - `lat_log`: Combined coordinates string
   - `landmark`, `building_no`: Additional details

## Current Issue

Based on the script results:
- Customer with phone `7982881901`: No address found
- Customer with phone `9497508398`: No address found

**Possible reasons**:
1. User logged in but didn't complete the address modal
2. Address modal was dismissed/skipped
3. Address saving failed silently
4. User never added an address after login

## Recommendations

1. **Add logging** to track when address modal is shown vs. when address is saved
2. **Make address mandatory** during first login (don't allow skipping)
3. **Add retry logic** if address save fails
4. **Check address saving API** for any errors in production logs

