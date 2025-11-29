# Local Development Guide

This guide explains how to run the ScrapMate API server locally on your PC.

## Quick Start

### Option 1: Express Server (Recommended for Development)

Run the Express app directly without serverless-http:

```bash
npm start
```

Or:

```bash
npm run local
```

**API Endpoint:** `http://localhost:3000/api`

**Test:**
```bash
curl http://localhost:3000/api -H 'api-key: zyubkfzeumeoviaqzcsrvfwdzbiwnlnn'
```

### Option 2: Serverless Offline (Simulates Lambda)

Run using serverless-offline to simulate AWS Lambda locally:

```bash
npm run offline
```

Or:

```bash
npm run local:serverless
```

**API Endpoint:** `http://localhost:3000/dev/api`

**Test:**
```bash
curl http://localhost:3000/dev/api -H 'api-key: zyubkfzeumeoviaqzcsrvfwdzbiwnlnn'
```

### Option 3: Development Mode (Auto-reload)

Run with nodemon for automatic reloading on file changes:

```bash
npm run dev
```

**API Endpoint:** `http://localhost:3000/api`

## Environment Setup

### 1. Load AWS Credentials

The app will automatically load credentials from:
- `aws.txt` file (if exists)
- `.env` file
- Environment variables

### 2. Required Environment Variables

Make sure you have these set (in `aws.txt` or `.env`):

```bash
API_KEY=zyubkfzeumeoviaqzcsrvfwdzbiwnlnn
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_REGION=ap-south-1
S3_BUCKET_NAME=scrapmate-images
```

### 3. Optional: Redis

If you want Redis caching locally:

```bash
REDIS_URL=your-redis-url
REDIS_TOKEN=your-redis-token
```

## Testing Endpoints

### Health Check
```bash
curl http://localhost:3000/api -H 'api-key: zyubkfzeumeoviaqzcsrvfwdzbiwnlnn'
```

### Get All Tables
```bash
curl http://localhost:3000/api/get_all_tables -H 'api-key: zyubkfzeumeoviaqzcsrvfwdzbiwnlnn'
```

### Count Rows
```bash
curl http://localhost:3000/api/count_row/users -H 'api-key: zyubkfzeumeoviaqzcsrvfwdzbiwnlnn'
```

### Login
```bash
curl -X POST http://localhost:3000/api/login \
  -H 'Content-Type: application/json' \
  -H 'api-key: zyubkfzeumeoviaqzcsrvfwdzbiwnlnn' \
  -d '{"email":"test@admin.in","password":"123"}'
```

## Differences Between Modes

### Express Mode (`npm start`)
- ✅ Fastest startup
- ✅ Direct Express app execution
- ✅ Best for development and debugging
- ✅ No Lambda simulation overhead
- ❌ Doesn't simulate Lambda environment

### Serverless Offline (`npm run offline`)
- ✅ Simulates AWS Lambda environment
- ✅ Tests serverless-http wrapper
- ✅ Closer to production environment
- ❌ Slower startup
- ❌ Routes prefixed with `/dev`

### Development Mode (`npm run dev`)
- ✅ Auto-reload on file changes
- ✅ Best for active development
- ✅ Same as Express mode but with nodemon

## Troubleshooting

### Port Already in Use

If port 3000 is already in use, set a different port:

```bash
PORT=8000 npm start
```

### AWS Credentials Not Found

Make sure `aws.txt` exists or set environment variables:

```bash
export AWS_ACCESS_KEY_ID=your-key
export AWS_SECRET_ACCESS_KEY=your-secret
export AWS_REGION=ap-south-1
```

### DynamoDB Connection Issues

For local development, you can:
1. Use AWS DynamoDB (requires credentials)
2. Use DynamoDB Local (Docker)
3. Mock the DynamoDB client

## Stopping the Server

Press `Ctrl+C` in the terminal where the server is running.

