# User Types Reference

## Overview
This document lists all user types (letters) currently used in the system and their meanings.

---

## User Type Letters

### 1. **'S'** - Shop Owner / Vendor (B2B)
- **Full Name**: Shop Owner / Vendor
- **Dashboard Access**: B2B Dashboard
- **Description**: Users who own shops and sell scrap materials (B2B vendors)
- **Registration**: Created when user joins as "B2B" or "Join as B2B"
- **Can Switch To**: Can upgrade to 'SC' if they also register as B2C
- **Used In**: Vendor app (React Native)

---

### 2. **'C'** - Customer (Customer App)
- **Full Name**: Customer (Customer App - Flutter)
- **Dashboard Access**: Customer App (Flutter) - separate app
- **Description**: Customers in the Flutter customer app (separate from vendor app)
- **Registration**: Created when user registers in the Flutter customer app
- **Can Switch To**: Can register as ANY type (B2B/S, B2C/R, or Delivery/D) in vendor app
- **Used In**: Customer app (Flutter) - separate app
- **Note**: When customer app users register in vendor app, they can choose any type and a new vendor app user is created

---

### 3. **'D'** - Delivery Boy / Delivery Partner
- **Full Name**: Delivery Boy / Delivery Partner
- **Dashboard Access**: Delivery Dashboard
- **Description**: Door-to-door scrap buyers who collect scrap from customers
- **Registration**: Created when user joins as "Delivery" or "Join as Door Step Buyer"
- **Can Switch To**: Cannot switch to B2B or B2C (restricted)
- **Used In**: Vendor app (React Native)

---

### 4. **'R'** - Retailer (B2C in Vendor App)
- **Full Name**: Retailer / B2C (Vendor App)
- **Dashboard Access**: B2C Dashboard
- **Description**: B2C users in the vendor app (separate from customer app 'C')
- **Registration**: Created when user joins as "B2C" or "Join as B2C" in vendor app
- **Can Switch To**: Can upgrade to 'SR' if they also register as B2B
- **Used In**: Vendor app (React Native)
- **Note**: This is separate from 'C' which is for the customer app (Flutter)

### 5. **'SR'** - Shop Owner + Retailer (B2B + B2C in Vendor App)
- **Full Name**: Shop Owner + Retailer (Combined - Vendor App)
- **Dashboard Access**: Both B2B and B2C Dashboards
- **Description**: Users who are registered as both B2B (shop owner) and B2C (retailer) in vendor app
- **Registration**: 
  - Automatically created when a B2B user ('S') registers as B2C
  - Automatically created when a B2C user ('R') registers as B2B
- **Can Switch To**: Can switch between B2B and B2C dashboards
- **Used In**: Vendor app (React Native)
- **Note**: This is a combined user type that allows access to both dashboards in vendor app

---

### 6. **'A'** - Admin
- **Full Name**: Administrator
- **Dashboard Access**: Admin Panel (Web)
- **Description**: System administrators with full access
- **Registration**: Created manually or through admin panel
- **Can Switch To**: N/A (admin only)
- **Used In**: Web admin panel (PHP)
- **Note**: Cannot login through mobile app

---

### 7. **'U'** - User (Generic Web User)
- **Full Name**: Generic User
- **Dashboard Access**: Web Panel (limited access)
- **Description**: Generic users for web login (not for mobile apps)
- **Registration**: Created through web admin panel
- **Can Switch To**: N/A
- **Used In**: Web admin panel (PHP)
- **Note**: Cannot login through mobile app

---

## Dashboard Access Summary

| User Type | B2B Dashboard | B2C Dashboard | Delivery Dashboard | Web Admin | Customer App |
|-----------|---------------|---------------|-------------------|-----------|--------------|
| **'S'** | ✅ Yes | ❌ No | ❌ No | ❌ No | ❌ No |
| **'R'** | ❌ No | ✅ Yes | ❌ No | ❌ No | ❌ No |
| **'C'** | ❌ No | ❌ No | ❌ No | ❌ No | ✅ Yes |
| **'D'** | ❌ No | ❌ No | ✅ Yes | ❌ No | ❌ No |
| **'SR'** | ✅ Yes | ✅ Yes | ❌ No | ❌ No | ❌ No |
| **'A'** | ❌ No | ❌ No | ❌ No | ✅ Yes | ❌ No |
| **'U'** | ❌ No | ❌ No | ❌ No | ✅ Yes (Limited) | ❌ No |

---

## User Type Upgrade Flow

### B2B → SR (Vendor App)
- When a user with type **'S'** (B2B) registers/logs in as B2C in vendor app
- System automatically upgrades `user_type` from **'S'** to **'SR'**
- User can now access both B2B and B2C dashboards

### B2C → SR (Vendor App)
- When a user with type **'R'** (B2C in vendor app) registers/logs in as B2B
- System automatically upgrades `user_type` from **'R'** to **'SR'**
- User can now access both B2B and B2C dashboards

### Customer App → Any Vendor App Type
- When a user with type **'C'** (customer app) registers in vendor app
- User can choose ANY type: B2B ('S'), B2C ('R'), or Delivery ('D')
- System creates a NEW vendor app user with the selected type
- Original customer app user remains unchanged

---

## Registration Mapping

| Join Type (Frontend) | User Type Created | Dashboard Type | App |
|---------------------|-------------------|----------------|-----|
| `'b2b'` | **'S'** | B2B | Vendor App |
| `'b2c'` | **'R'** | B2C | Vendor App |
| `'delivery'` | **'D'** | Delivery | Vendor App |
| Customer App Registration | **'C'** | Customer App | Customer App (Flutter) |

---

## App Type Separation

### Customer App Users
- User type **'C'** with `app_type = 'customer_app'` or no `app_type`
- Used in the Flutter customer app
- Cannot login to vendor app (creates new vendor app user instead)

### Vendor App Users
- User types: **'S'**, **'C'**, **'D'**, **'SC'** with `app_type = 'vendor_app'` or no `app_type`
- Used in the React Native vendor app
- All vendor app registrations get `app_type = 'vendor_app'`

---

## Notes

1. **'R'** (Retailer/B2C) is for vendor app B2C users, separate from **'C'** (customer app)
2. **'SR'** is a special combined type that allows users to access both B2B and B2C dashboards in vendor app
3. **'A'** and **'U'** are web-only user types and cannot login through mobile apps
4. **'D'** (Delivery) users are restricted and cannot login as B2B or B2C
5. **'C'** (Customer app) users can register as ANY type (B2B/S, B2C/R, or Delivery/D) in vendor app
6. When customer app users register in vendor app, a NEW vendor app user is created with the selected type
7. The system automatically upgrades user types when vendor app users register for both B2B and B2C access
8. **'C'** and **'R'** are different: 'C' = customer app (Flutter), 'R' = B2C in vendor app (React Native)

---

## Code References

- **Auth Service**: `services/auth/v2AuthService.js`
- **Shop Type Service**: `services/shop/v2ShopTypeService.js`
- **Profile Service**: `services/user/v2ProfileService.js`
- **User Model**: `models/User.js`
- **Documentation**: `USERS_TABLE_STRUCTURE.md`

