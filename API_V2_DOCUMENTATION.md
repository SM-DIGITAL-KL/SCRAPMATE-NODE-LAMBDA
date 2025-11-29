# API v2 Documentation - Shop Types & Dashboard Management

## Overview

This API v2 provides endpoints for managing shop types and dashboard switching for the new React Native project. The system supports 4 shop types with different dashboard access:

### Shop Types

| ID | Name | Description | Dashboard Access |
|----|------|-------------|------------------|
| 1 | Industrial | Industrial scrap sellers | B2B only |
| 2 | Door Step Buyer | Door-to-door scrap buyers | Delivery Partner (cannot login as B2B/B2C) |
| 3 | Retailer | Retail scrap sellers | B2C only |
| 4 | Wholesaler | Wholesale scrap sellers | B2B only |

### Dashboard Access Rules

- **B2B Dashboard**: Industrial (1) and Wholesaler (4)
- **B2C Dashboard**: Retailer (3)
- **Delivery Dashboard**: Door Step Buyer (2)
- **Dashboard Switching**: Users with B2B shop types (Industrial/Wholesaler) who also have customer accounts can switch between B2B and B2C dashboards

---

## Base URL

All v2 API endpoints are prefixed with `/api/v2`

---

## Authentication

All endpoints require an API key in the request header:
```
api-key: YOUR_API_KEY
```

---

## Endpoints

### 1. Get Shop Types

Get all available shop types in the system.

**Endpoint:** `GET /api/v2/shop-types`

**Request:**
```bash
GET /api/v2/shop-types
Headers:
  api-key: YOUR_API_KEY
```

**Response:**
```json
{
  "success": true,
  "message": "Shop types retrieved successfully",
  "data": [
    {
      "id": 1,
      "name": "Industrial",
      "description": "Industrial scrap sellers",
      "dashboard_type": "b2b"
    },
    {
      "id": 2,
      "name": "Door Step Buyer",
      "description": "Door-to-door scrap buyers",
      "dashboard_type": "delivery"
    },
    {
      "id": 3,
      "name": "Retailer",
      "description": "Retail scrap sellers",
      "dashboard_type": "b2c"
    },
    {
      "id": 4,
      "name": "Wholesaler",
      "description": "Wholesale scrap sellers",
      "dashboard_type": "b2b"
    }
  ]
}
```

---

### 2. Get User Dashboards

Get the list of dashboards a user can access based on their shop type.

**Endpoint:** `GET /api/v2/user/dashboards/:userId`

**Request:**
```bash
GET /api/v2/user/dashboards/123
Headers:
  api-key: YOUR_API_KEY
```

**Response:**
```json
{
  "success": true,
  "message": "User dashboards retrieved successfully",
  "data": {
    "userId": 123,
    "shopType": 1,
    "shopTypeName": "Industrial",
    "allowedDashboards": ["b2b"],
    "canSwitch": false
  }
}
```

**Response for users who can switch:**
```json
{
  "success": true,
  "message": "User dashboards retrieved successfully",
  "data": {
    "userId": 123,
    "shopType": 1,
    "shopTypeName": "Industrial",
    "allowedDashboards": ["b2b"],
    "canSwitch": true
  }
}
```

---

### 3. Validate Dashboard Access

Validate if a user can access a specific dashboard type.

**Endpoint:** `POST /api/v2/user/validate-dashboard`

**Request:**
```bash
POST /api/v2/user/validate-dashboard
Headers:
  api-key: YOUR_API_KEY
  Content-Type: application/json

Body:
{
  "userId": 123,
  "dashboardType": "b2b"
}
```

**Valid dashboard types:** `b2b`, `b2c`, `delivery`

**Response (Success):**
```json
{
  "success": true,
  "message": "User can access this dashboard",
  "data": {
    "canAccess": true,
    "reason": null
  }
}
```

**Response (Denied):**
```json
{
  "success": true,
  "message": "User cannot access this dashboard",
  "data": {
    "canAccess": false,
    "reason": "Shop type Industrial cannot access B2C dashboard"
  }
}
```

---

### 4. Switch Dashboard

Switch user's current dashboard (B2B ↔ B2C).

**Endpoint:** `POST /api/v2/user/switch-dashboard`

**Request:**
```bash
POST /api/v2/user/switch-dashboard
Headers:
  api-key: YOUR_API_KEY
  Content-Type: application/json

Body:
{
  "userId": 123,
  "targetDashboard": "b2c"
}
```

**Valid target dashboards:** `b2b`, `b2c`, `delivery`

**Response (Success):**
```json
{
  "success": true,
  "message": "Dashboard switched successfully",
  "data": {
    "userId": 123,
    "currentDashboard": "b2c",
    "shopType": 1,
    "shopTypeName": "Industrial"
  }
}
```

**Response (Error - Cannot Switch):**
```json
{
  "success": false,
  "message": "Cannot switch to this dashboard",
  "reason": "Shop type Industrial cannot switch to B2C dashboard"
}
```

---

## Error Responses

All endpoints may return the following error responses:

**400 Bad Request:**
```json
{
  "success": false,
  "message": "User ID is required"
}
```

**403 Forbidden:**
```json
{
  "success": false,
  "message": "Cannot switch to this dashboard",
  "reason": "Shop type Industrial cannot switch to B2C dashboard"
}
```

**404 Not Found:**
```json
{
  "success": false,
  "message": "User not found"
}
```

**500 Internal Server Error:**
```json
{
  "success": false,
  "message": "Failed to retrieve shop types",
  "error": "Error message details"
}
```

---

## Usage Examples

### Example 1: Check User's Allowed Dashboards

```javascript
// After user login, check what dashboards they can access
const response = await fetch('/api/v2/user/dashboards/123', {
  headers: {
    'api-key': 'YOUR_API_KEY'
  }
});

const data = await response.json();
console.log('Allowed dashboards:', data.data.allowedDashboards);
console.log('Can switch:', data.data.canSwitch);
```

### Example 2: Validate Before Switching

```javascript
// Before switching, validate if user can access target dashboard
const response = await fetch('/api/v2/user/validate-dashboard', {
  method: 'POST',
  headers: {
    'api-key': 'YOUR_API_KEY',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    userId: 123,
    dashboardType: 'b2c'
  })
});

const data = await response.json();
if (data.data.canAccess) {
  // Proceed with dashboard switch
} else {
  // Show error message
  console.error(data.data.reason);
}
```

### Example 3: Switch Dashboard

```javascript
// Switch user's dashboard
const response = await fetch('/api/v2/user/switch-dashboard', {
  method: 'POST',
  headers: {
    'api-key': 'YOUR_API_KEY',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    userId: 123,
    targetDashboard: 'b2c'
  })
});

const data = await response.json();
if (data.success) {
  // Navigate to new dashboard
  console.log('Switched to:', data.data.currentDashboard);
} else {
  // Show error
  console.error(data.reason);
}
```

---

## Implementation Notes

1. **Door Step Buyer (ID: 2)**: These users are delivery partners and cannot login as B2B or B2C. They should only access the delivery dashboard.

2. **Dashboard Switching**: Currently, users with B2B shop types (Industrial/Wholesaler) who also have customer accounts can switch to B2C. This logic can be customized based on business requirements.

3. **Users Without Shops**: Users without a shop record default to B2C dashboard if they are customers (user_type: 'C' or 'U').

4. **Future Enhancements**: 
   - Store current dashboard preference in user profile
   - Support multiple shops per user with different types
   - Add dashboard switching history/logging

---

## Testing

You can test these endpoints using:

1. **Postman/Insomnia**: Import the endpoints and test with valid API keys
2. **cURL**: Use command line tools
3. **React Native App**: Integrate into the mobile app

Example cURL command:
```bash
curl -X GET "http://localhost:3000/api/v2/shop-types" \
  -H "api-key: YOUR_API_KEY"
```

