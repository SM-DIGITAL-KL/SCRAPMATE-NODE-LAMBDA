# EditProfileScreen Address Saving Analysis

## Summary

**✅ YES - EditProfileScreen DOES save address to the customer table**

## Flow Analysis

### 1. Frontend (EditProfileScreen.tsx)

**Location**: Lines 223-229

```typescript
if (isCustomerApp) {
  // For customer_app users, send address in customer object
  if (address.trim()) {
    updateData.customer = {
      address: address.trim(),
    };
  }
}
```

- When user clicks "Save Changes" in EditProfileScreen
- If it's a customer_app user AND address field has value
- Sends `updateData.customer.address` to backend via `updateProfile` API

### 2. Backend (v2ProfileService.js)

**Location**: Lines 1706-1772

```javascript
if (user.user_type === 'C' && (updateData.name !== undefined || updateData.email !== undefined || updateData.customer || updateData.address)) {
  const customer = await Customer.findByUserId(userId);
  
  if (customer) {
    const customerUpdateData = {};
    
    if (updateData.customer) {
      if (updateData.customer.address !== undefined) {
        customerUpdateData.address = updateData.customer.address;
      }
      // ... other customer fields
    }
    
    if (Object.keys(customerUpdateData).length > 0) {
      await Customer.update(customer.id, customerUpdateData);
      console.log(`✅ Customer ${customer.id} updated successfully`);
    }
  }
}
```

- Backend receives `updateData.customer.address`
- Finds customer record by `user_id`
- Updates `customer.address` field in the `customer` table
- ✅ **Address IS saved to customer table**

## Important Notes

### Two Different Address Storage Systems

1. **Customer Table Address** (`customer.address`):
   - Saved via EditProfileScreen "Save Changes" button
   - Single address field in customer record
   - Used for basic customer information

2. **Addresses Table** (`addresses` table):
   - Saved via AddAddressModal component
   - Multiple addresses per customer
   - More detailed (building_no, landmark, coordinates, etc.)
   - Used for order pickup addresses

### Current Issue

For phone `9074135121`:
- **User ID**: 1767542896922
- **Customer Record ID**: 1767542897156
- **Addresses in addresses table**: 5 addresses saved with `customer_id = 1767542896922` (user_id)
- **Customer table address**: Currently empty (N/A)

**Problem**: 
- Addresses are saved with `customer_id = user_id` (1767542896922)
- But admin panel was checking `customer.id` (1767542897156) to find addresses
- This mismatch causes addresses not to show in admin panel

**Solution Applied**:
- Updated admin panel to check addresses using both:
  1. `customer.address` from customer table
  2. `addresses` table using `customer.id` OR `user.id` as customer_id

## Verification

To verify if address is saved to customer table:
1. Check `customer.address` field in customer record
2. Check if `Customer.update()` was called successfully
3. Check backend logs for: `✅ Customer ${customer.id} updated successfully`

