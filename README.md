# Node.js Server with JWT Authentication

A Node.js Express server with MVC architecture, JWT authentication, MySQL database, and Redis caching.

## Features

- ✅ MVC (Model-View-Controller) architecture
- ✅ JWT token authentication
- ✅ Environment variables configuration (.env)
- ✅ MySQL database integration
- ✅ Redis caching
- ✅ Protected routes with authentication middleware

## Project Structure

```
nodeserver/
├── config/           # Configuration files
│   ├── database.js   # MySQL connection
│   └── redis.js      # Redis client
├── controllers/      # Business logic
│   ├── authController.js
│   └── userController.js
├── models/           # Data models
│   └── User.js
├── routes/           # Route definitions
│   ├── authRoutes.js
│   ├── userRoutes.js
│   └── customerRoutes.js
├── middleware/       # Custom middleware
│   └── authMiddleware.js
├── .env              # Environment variables (create from .env.example)
├── .env.example      # Environment variables template
└── index.js          # Main entry point
```

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Create `.env` file:**
   ```bash
   cp .env.example .env
   ```

3. **Update `.env` with your configuration:**
   - Database credentials
   - Redis URL and token
   - JWT secret (use a strong secret in production)

4. **Start the server:**
   ```bash
   # Production
   npm start

   # Development with auto-reload
   npm run dev
   ```

## API Endpoints

### Authentication Routes

#### Register User
```http
POST /auth/register
Content-Type: application/json

{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "password123"
}
```

**Response:**
```json
{
  "message": "✅ User registered successfully",
  "user": {
    "id": 1,
    "name": "John Doe",
    "email": "john@example.com"
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

#### Login
```http
POST /auth/login
Content-Type: application/json

{
  "email": "john@example.com",
  "password": "password123"
}
```

**Response:**
```json
{
  "message": "✅ Login successful",
  "user": {
    "id": 1,
    "name": "John Doe",
    "email": "john@example.com"
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

#### Get Profile (Protected)
```http
GET /auth/profile
Authorization: Bearer <your-jwt-token>
```

**Response:**
```json
{
  "user": {
    "id": 1,
    "name": "John Doe",
    "email": "john@example.com"
  }
}
```

### User Routes

#### Create User
```http
POST /users
Content-Type: application/json

{
  "name": "Jane Doe",
  "email": "jane@example.com"
}
```

#### Get User by ID (Protected)
```http
GET /users/:id
Authorization: Bearer <your-jwt-token>
```

### Customer Routes

#### Check Customer by Name
```http
GET /customers/check/:name
```

## Using JWT Tokens

1. **Register or Login** to get a JWT token
2. **Include the token** in the `Authorization` header for protected routes:
   ```
   Authorization: Bearer <your-jwt-token>
   ```

### Example with cURL

```bash
# Register
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"John Doe","email":"john@example.com","password":"password123"}'

# Login
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"john@example.com","password":"password123"}'

# Get Profile (with token)
curl -X GET http://localhost:3000/auth/profile \
  -H "Authorization: Bearer <your-token-here>"
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | 3000 |
| `DB_HOST` | MySQL host | localhost |
| `DB_PORT` | MySQL port | 8889 |
| `DB_USER` | MySQL username | root |
| `DB_PASSWORD` | MySQL password | root |
| `DB_NAME` | MySQL database name | scrapmate1 |
| `REDIS_URL` | Redis URL | - |
| `REDIS_TOKEN` | Redis token | - |
| `JWT_SECRET` | JWT secret key | - |
| `JWT_EXPIRES_IN` | JWT expiration time | 24h |

## Dependencies

- `express` - Web framework
- `mysql2` - MySQL database driver
- `@upstash/redis` - Redis client
- `jsonwebtoken` - JWT token generation/verification
- `bcryptjs` - Password hashing
- `dotenv` - Environment variable management
- `nodemon` - Auto-reload during development (dev dependency)

## Scripts

- `npm start` - Run the server (production)
- `npm run dev` - Run with auto-reload on file changes (development)

