# Shop Types in ScrapMate System

## Overview
Shop types are used to categorize different types of shops/vendors in the system. The `shop_type` field is stored in the `shops` table (DynamoDB) and `shops` table (MySQL in PHP admin).

## Shop Type Values

| ID | Name | Description |
|----|------|-------------|
| **1** | **Industrial** | Industrial scrap sellers |
| **2** | **Door Step Buyer** | Door-to-door scrap buyers |
| **3** | **Retailer** | Retail scrap sellers |
| **4** | **Wholesaler** | Wholesale scrap sellers |

## Database Schema

### MySQL (PHP Admin)
```sql
`shop_type` int DEFAULT NULL COMMENT '1=Industrial , 2=Door Step Buyer , 3=Retailer , 4=Wholesaler '
```

### DynamoDB (Node.js API)
- **Table**: `shops`
- **Field**: `shop_type` (Number/String)
- **Values**: `1`, `2`, `3`, `4` (or `"1"`, `"2"`, `"3"`, `"4"` as strings)

## Shop Types Table

There is a `shop_types` reference table in MySQL with the following data:

```sql
INSERT INTO `shop_types` (`id`, `name`, `created_at`, `updated_at`) VALUES
(1, 'Industrial', '2024-08-31 07:08:10', '2024-08-31 07:08:10'),
(2, 'Door Step Buyer ', '2024-08-31 07:09:24', '2024-08-31 07:09:24'),
(3, 'Retailer', '2024-08-31 07:09:24', '2024-08-31 07:09:24'),
(4, 'Wholesaler', '2024-08-31 07:09:44', '2024-08-31 07:09:44');
```

## Usage in Code

### Flutter App (Registration)
The Flutter app shows these shop types during registration:
- **Industrial** (ID: 1) - "You want to sell your scrap"
- **Door step buyer** (ID: 2) - "You want to sell your scrap"
- **Retailer** (ID: 3) - "You want to sell your scrap"
- **Wholesale** (ID: 4) - "You want to sell your scrap"

### PHP Admin Panel
The AgentController displays shop types as:
- `1` → "Industrial"
- `2` → "Door Step Buyer "
- `3` → "Retailer"
- `4` → "Wholesaler"

### Node.js API
- Shop type is stored in the `shop_type` field when creating/updating shops
- Used for filtering shops in agent panel: `/api/agent/shops?shop_type_id=1`

## Example Shop Record

```json
{
  "id": 123,
  "user_id": 456,
  "shopname": "ABC Scrap Dealers",
  "shop_type": 1,
  "email": "abc@example.com",
  "contact": 9876543210,
  "address": "123 Main St",
  "location": "City",
  "state": "State",
  "place": "Place",
  "language": 1,
  "profile_photo": "/uploads/shop.jpg",
  "pincode": "123456",
  "lat_log": "12.345,77.890",
  "place_id": null,
  "del_status": 1,
  "created_at": "2024-01-15T10:30:00.000Z",
  "updated_at": "2024-01-15T10:30:00.000Z"
}
```

## Notes
- Shop type is **optional** (can be `NULL`)
- Shop type is stored as an integer in the database
- In the Flutter app, shop type is sometimes handled as a string (`"1"`, `"2"`, etc.)
- The shop type is used for filtering and categorization in the admin panel
- All shop types are associated with `user_type = 'S'` (Shop) in the users table

