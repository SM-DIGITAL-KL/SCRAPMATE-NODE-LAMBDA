# FCM Push Notification Setup Guide

This guide explains how to set up and use the FCM push notification API endpoint.

## Prerequisites

1. **Firebase Project**: You need a Firebase project with Cloud Messaging enabled
2. **Service Account Key**: Download the Firebase service account JSON key
3. **Dependencies**: Install `firebase-admin` package

## Installation

### 1. Install Dependencies

```bash
npm install firebase-admin
```

### 2. Firebase Service Account Setup

You have two options for Firebase authentication:

#### Option A: Environment Variable (Recommended for Serverless)

Set the `FIREBASE_SERVICE_ACCOUNT` environment variable with the JSON content:

```bash
export FIREBASE_SERVICE_ACCOUNT='{"type":"service_account","project_id":"your-project-id",...}'
```

#### Option B: Service Account File

1. Go to Firebase Console → Project Settings → Service Accounts
2. Click "Generate New Private Key"
3. Download the JSON file
4. Set the path in your environment or pass it to `initializeFirebase()`

#### Option C: Project ID Only (for serverless with default credentials)

Set `FIREBASE_PROJECT_ID` environment variable:

```bash
export FIREBASE_PROJECT_ID='your-project-id'
```

## API Endpoints

### Send Notification to Single User

**Endpoint**: `POST /api/v2/notifications/send`

**Headers**:
```
api-key: your-api-key
Content-Type: application/json
```

**Request Body**:
```json
{
  "phone_number": "9074135121",  // OR
  "user_id": 123,                 // Either phone_number or user_id is required
  "title": "Notification Title",
  "body": "Notification message body",
  "data": {                       // Optional
    "type": "order_update",
    "order_id": "12345",
    "custom_field": "value"
  }
}
```

**Response (Success)**:
```json
{
  "status": "success",
  "msg": "Notification sent successfully",
  "data": {
    "user_id": 123,
    "phone_number": 9074135121,
    "messageId": "0:1234567890"
  }
}
```

**Response (Error)**:
```json
{
  "status": "error",
  "msg": "User not found",
  "data": null
}
```

### Send Notification to Multiple Users

**Endpoint**: `POST /api/v2/notifications/send-bulk`

**Request Body**:
```json
{
  "phone_numbers": ["9074135121", "9876543210"],  // OR
  "user_ids": [123, 456],                          // Either array is required
  "title": "Bulk Notification Title",
  "body": "Bulk notification message",
  "data": {
    "type": "general_announcement"
  }
}
```

**Response**:
```json
{
  "status": "success",
  "msg": "Bulk notification sent",
  "data": {
    "totalUsers": 2,
    "successCount": 2,
    "failureCount": 0
  }
}
```

## Usage Examples

### Using cURL

```bash
# Send notification by phone number
curl -X POST https://your-api-url/api/v2/notifications/send \
  -H "api-key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "phone_number": "9074135121",
    "title": "Test Notification",
    "body": "This is a test notification",
    "data": {
      "type": "test"
    }
  }'

# Send notification by user_id
curl -X POST https://your-api-url/api/v2/notifications/send \
  -H "api-key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": 123,
    "title": "Order Update",
    "body": "Your order has been accepted",
    "data": {
      "type": "order_update",
      "order_id": "12345"
    }
  }'
```

### Using PHP (for Admin Panel)

```php
<?php
function sendPushNotification($phoneNumber, $title, $body, $data = []) {
    $apiUrl = 'https://your-api-url/api/v2/notifications/send';
    $apiKey = 'your-api-key';
    
    $payload = [
        'phone_number' => $phoneNumber,
        'title' => $title,
        'body' => $body,
        'data' => $data
    ];
    
    $ch = curl_init($apiUrl);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'api-key: ' . $apiKey,
        'Content-Type: application/json'
    ]);
    
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    
    return [
        'success' => $httpCode === 200,
        'response' => json_decode($response, true)
    ];
}

// Example usage
$result = sendPushNotification(
    '9074135121',
    'Order Status Update',
    'Your pickup request has been accepted',
    ['type' => 'order_update', 'order_id' => '12345']
);

if ($result['success']) {
    echo "Notification sent successfully!\n";
    print_r($result['response']);
} else {
    echo "Failed to send notification\n";
    print_r($result['response']);
}
?>
```

### Using JavaScript/Node.js

```javascript
const axios = require('axios');

async function sendPushNotification(phoneNumber, title, body, data = {}) {
  try {
    const response = await axios.post(
      'https://your-api-url/api/v2/notifications/send',
      {
        phone_number: phoneNumber,
        title: title,
        body: body,
        data: data
      },
      {
        headers: {
          'api-key': 'your-api-key',
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log('Notification sent:', response.data);
    return response.data;
  } catch (error) {
    console.error('Error sending notification:', error.response?.data || error.message);
    throw error;
  }
}

// Example usage
sendPushNotification(
  '9074135121',
  'Test Notification',
  'This is a test message',
  { type: 'test' }
);
```

## Important Notes

1. **Customer App Only**: The API only sends notifications to users with `app_type = 'customer_app'`
2. **FCM Token Required**: Users must have a valid FCM token registered (stored via `/api/fcm_token_store`)
3. **Phone Number Format**: Phone numbers should be provided as strings (e.g., "9074135121")
4. **User ID Format**: User IDs should be numbers
5. **Data Payload**: All data values are automatically converted to strings (FCM requirement)

## Error Handling

Common error responses:

- **400 Bad Request**: Missing required fields (title, body, or phone_number/user_id)
- **404 Not Found**: User not found
- **400 Bad Request**: User does not have FCM token registered
- **400 Bad Request**: User is not a customer_app user
- **500 Internal Server Error**: FCM service error or server error

## Testing

### Test with Phone Number 9074135121

```bash
curl -X POST http://localhost:3000/api/v2/notifications/send \
  -H "api-key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "phone_number": "9074135121",
    "title": "Test Notification",
    "body": "Testing FCM push notification",
    "data": {
      "type": "test",
      "timestamp": "'$(date -u +"%Y-%m-%dT%H:%M:%SZ")'"
    }
  }'
```

## Troubleshooting

1. **"Firebase Admin SDK not initialized"**: 
   - Check that `FIREBASE_SERVICE_ACCOUNT` or `FIREBASE_PROJECT_ID` is set
   - Verify service account JSON is valid

2. **"User not found"**:
   - Verify the phone number or user_id exists in the database
   - Check that the user has `app_type = 'customer_app'`

3. **"User does not have an FCM token registered"**:
   - User needs to log in to the mobile app first
   - FCM token is stored when user logs in via `/api/fcm_token_store`

4. **"Invalid FCM token"**:
   - Token may have expired or been unregistered
   - User needs to log in again to refresh the token

## Integration with PHP Admin Panel

The API can be easily called from the PHP admin panel. See the PHP example above for implementation details.




