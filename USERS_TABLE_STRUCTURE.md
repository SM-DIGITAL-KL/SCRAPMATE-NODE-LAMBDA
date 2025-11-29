# DynamoDB Users Table Structure

## Table Information
- **Table Name**: `users`
- **Primary Key**: `id` (Number)
- **Region**: `ap-south-1` (default)

## Schema Structure

### Primary Key
- **Partition Key**: `id` (Number) - Auto-generated using `Date.now() + Math.floor(Math.random() * 1000)`

### Attributes

#### Required Fields (on creation)
| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `id` | Number | Unique identifier (auto-generated) | `1699123456789` |
| `name` | String | User's full name | `"John Doe"` |
| `email` | String | User's email address | `"john@example.com"` |
| `mob_num` | Number | Mobile number (converted to integer) | `9876543210` |
| `user_type` | String | User type identifier | `"C"`, `"S"`, `"D"`, `"A"` |
| `password` | String | Bcrypt hashed password | `"$2a$10$..."` |
| `created_at` | String | ISO 8601 timestamp | `"2024-01-15T10:30:00.000Z"` |
| `updated_at` | String | ISO 8601 timestamp | `"2024-01-15T10:30:00.000Z"` |

#### Optional Fields
| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `fcm_token` | String | Firebase Cloud Messaging token for push notifications | `"fcm_token_string"` |
| `address` | String | User's address (may also be stored in related tables) | `"123 Main St, City"` |
| `language` | String | Preferred language (may also be stored in related tables) | `"en"`, `"hi"` |
| `profile_pic` | String | Profile picture URL/path (may also be stored in related tables) | `"/uploads/profile.jpg"` |

**Note**: For user types `S` (Shop), `C` (Customer), and `D` (Delivery Boy), additional profile information is typically stored in separate tables:
- **Shops**: `shops` table
- **Customers**: `customer` table  
- **Delivery Boys**: `delivery_boy` table

The `updateProfile()` method can accept any fields and will update them on the user record.

### User Types
- `"C"` - Customer
- `"S"` - Shop/Vendor
- `"D"` - Delivery Boy
- `"A"` - Admin
- `"U"` - User (generic, used in web login)

## Data Access Patterns

### Queries Available
1. **Get by ID** - Direct lookup using partition key `id`
2. **Find by Mobile** - Scan with filter on `mob_num`
3. **Find by Email** - Scan with filter on `email`
4. **Find by Name** - Scan with filter on `name` (exact match)
5. **Search by Name** - Scan with in-memory filtering (partial match)
6. **Find by User Type** - Scan with filter on `user_type`
7. **Find with FCM Token** - Scan with filter on `user_type` and `fcm_token` exists

### Indexes
- **No Global Secondary Indexes (GSI)** - All queries use table scans
- **No Local Secondary Indexes (LSI)**

## Example User Document

```json
{
  "id": 1699123456789,
  "name": "John Doe",
  "email": "john@example.com",
  "mob_num": 9876543210,
  "user_type": "C",
  "password": "$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy",
  "fcm_token": "fcm_token_string_here",
  "address": "123 Main Street, City, State",
  "language": "en",
  "profile_pic": "/uploads/profiles/user123.jpg",
  "created_at": "2024-01-15T10:30:00.000Z",
  "updated_at": "2024-01-15T10:30:00.000Z"
}
```

## Operations

### Create User
```javascript
const user = await User.create(name, email, mobNum, userType, password);
```

### Find by ID
```javascript
const user = await User.findById(id);
```

### Find by Mobile
```javascript
const user = await User.findByMobile(mobNum);
```

### Update Profile
```javascript
await User.updateProfile(userId, {
  name: "New Name",
  address: "New Address"
});
```

### Update FCM Token
```javascript
await User.updateFcmToken(userId, fcmToken);
```

### Batch Operations
- `findByIds(ids)` - Get multiple users by IDs
- `batchCreate(users)` - Create multiple users
- `batchUpdate(updates)` - Update multiple users

## Caching
- Users are cached in Redis with key: `user:{id}`
- Cache is invalidated on updates

## Notes
- Mobile numbers are stored as **Numbers** (not strings) in DynamoDB
- IDs are auto-generated using timestamp + random number
- Password is hashed using bcrypt with salt rounds of 10
- All timestamps are in ISO 8601 format
- The `password` field is excluded from query results for security

## Performance Considerations
- Most queries use **Scan** operations (not Query), which can be expensive for large tables
- Consider adding GSIs for frequently queried fields:
  - `mob_num` (for mobile lookups)
  - `email` (for email lookups)
  - `user_type` (for filtering by user type)
- Current implementation uses pagination for scans to handle large datasets

