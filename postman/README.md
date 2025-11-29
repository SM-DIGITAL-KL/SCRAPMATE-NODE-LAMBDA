# ScrapMate V2 API Postman Collection

This directory contains Postman collections and environments for testing the ScrapMate V2 API endpoints.

## Files

1. **V2_API_Collection.postman_collection.json** - Complete Postman collection with all V2 API endpoints
2. **V2_API_Environment.postman_environment.json** - Postman environment with variables for easy testing

## Import Instructions

### Import Collection
1. Open Postman
2. Click **Import** button
3. Select `V2_API_Collection.postman_collection.json`
4. Click **Import**

### Import Environment
1. In Postman, click the **Environments** icon (top right)
2. Click **Import**
3. Select `V2_API_Environment.postman_environment.json`
4. Click **Import**
5. Select the environment from the dropdown

## Setup

### 1. Configure Environment Variables

After importing, update these variables in your environment:

- **base_url**: Your API base URL (default: `https://6dc2e7973f38.ngrok-free.app`)
- **api_key**: Your API key for authentication
- **phone_number**: Test phone number (default: `9876543210`)
- **user_id**: Will be auto-populated after login
- **auth_token**: Will be auto-populated after OTP verification

### 2. Test Phone Numbers

For testing, these phone numbers have special OTP:
- `9605056015` → OTP: `487600`
- `7994095833` → OTP: `487600`

## API Endpoints

### Authentication

#### 1. Login - Send OTP
- **Method**: `POST`
- **URL**: `/api/v2/auth/login`
- **Body**:
  ```json
  {
    "phoneNumber": "9876543210"
  }
  ```
- **Response**: Returns OTP, isNewUser flag, and userType

#### 2. Verify OTP - Complete Login
- **Method**: `POST`
- **URL**: `/api/v2/auth/verify-otp`
- **Body**:
  ```json
  {
    "phoneNumber": "9876543210",
    "otp": "123456",
    "joinType": "b2c"  // Required for new users: "b2b", "b2c", or "delivery"
  }
  ```
- **Response**: Returns user data, JWT token, and dashboardType

### Shop Types

#### 3. Get All Shop Types
- **Method**: `GET`
- **URL**: `/api/v2/shop-types`
- **Response**: Returns array of shop types with dashboard types

### Dashboard Management

#### 4. Get User Dashboards
- **Method**: `GET`
- **URL**: `/api/v2/user/dashboards/:userId`
- **Response**: Returns allowed dashboards for the user

#### 5. Validate Dashboard Access
- **Method**: `POST`
- **URL**: `/api/v2/user/validate-dashboard`
- **Body**:
  ```json
  {
    "userId": 1234567890,
    "dashboardType": "b2c"  // "b2b", "b2c", or "delivery"
  }
  ```
- **Response**: Returns canAccess boolean and reason

#### 6. Switch Dashboard
- **Method**: `POST`
- **URL**: `/api/v2/user/switch-dashboard`
- **Body**:
  ```json
  {
    "userId": 1234567890,
    "targetDashboard": "b2b"  // "b2b", "b2c", or "delivery"
  }
  ```
- **Response**: Returns success status and dashboard info

## Testing Flow

1. **Send OTP**: Use "Login - Send OTP" request
   - Copy the OTP from response
   - Update `otp` variable in environment

2. **Verify OTP**: Use "Verify OTP - Complete Login" request
   - Token and user_id are automatically saved to environment variables

3. **Get Dashboards**: Use "Get User Dashboards" request
   - Uses saved `user_id` from login

4. **Validate/Switch**: Use validation or switch endpoints as needed

## Headers

All requests require:
- `api-key`: Your API key
- `Content-Type`: `application/json` (for POST requests)
- `ngrok-skip-browser-warning`: `true` (for ngrok URLs)

## Response Format

All responses follow this format:

```json
{
  "status": "success" | "error",
  "message": "Description message",
  "data": { ... } | null
}
```

## Error Handling

- **400**: Bad Request (missing/invalid parameters)
- **403**: Forbidden (admin users, invalid dashboard access)
- **404**: Not Found (user not found)
- **500**: Internal Server Error

## Notes

- The collection includes automated tests for each endpoint
- Token and user_id are automatically saved after successful login
- All endpoints require API key authentication
- OTP is returned in response for development/testing purposes

