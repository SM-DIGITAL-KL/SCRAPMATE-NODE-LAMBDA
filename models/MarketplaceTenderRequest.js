const { getDynamoDBClient } = require('../config/dynamodb');
const { PutCommand, ScanCommand, QueryCommand, GetCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');
const { getTableName } = require('../utils/dynamodbTableNames');

const TABLE_NAME = getTableName('marketplace_tender_requests');

const toNum = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const toText = (value) => {
  const text = String(value ?? '').trim();
  if (!text || text.toLowerCase() === 'null' || text.toLowerCase() === 'undefined') return '';
  return text;
};

const normalizeState = (value) =>
  String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();

const isFulfilledStatus = (statusValue) => {
  const status = String(statusValue || '').trim().toLowerCase();
  return ['fulfilled', 'completed', 'closed', 'done', 'resolved'].includes(status);
};

class MarketplaceTenderRequest {
  static async create(data) {
    const client = getDynamoDBClient();
    const now = new Date().toISOString();
    const userId = toNum(data.user_id);
    const requestedState = toText(data.requested_state);
    const requestedStateNormalized = normalizeState(requestedState);

    if (!userId || !requestedState || !requestedStateNormalized) {
      throw new Error('user_id and requested_state are required');
    }

    const item = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      user_id: userId,
      user_name: toText(data.user_name) || null,
      user_phone: toText(data.user_phone) || null,
      user_type: toText(data.user_type || 'M') || 'M',
      requested_state: requestedState,
      requested_state_normalized: requestedStateNormalized,
      note: toText(data.note) || null,
      source: toText(data.source || 'vendor_app') || 'vendor_app',
      status: toText(data.status || 'pending') || 'pending',
      created_at: now,
      updated_at: now,
    };

    await client.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: item,
    }));

    return item;
  }

  static async findByUserId(userId) {
    const client = getDynamoDBClient();
    const userIdNum = toNum(userId);
    if (!userIdNum) return [];

    try {
      const items = [];
      let lastKey = null;
      do {
        const response = await client.send(new QueryCommand({
          TableName: TABLE_NAME,
          IndexName: 'user_id-index',
          KeyConditionExpression: 'user_id = :userId',
          ExpressionAttributeValues: {
            ':userId': userIdNum,
          },
          ScanIndexForward: false,
          ExclusiveStartKey: lastKey || undefined,
        }));
        if (response.Items) items.push(...response.Items);
        lastKey = response.LastEvaluatedKey;
      } while (lastKey);

      items.sort((a, b) => new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime());
      return items;
    } catch (queryError) {
      if (
        queryError.name === 'ValidationException' ||
        String(queryError.message || '').toLowerCase().includes('index')
      ) {
        console.warn('⚠️ user_id-index not available for marketplace_tender_requests, falling back to Scan.');
      } else if (queryError.name === 'ResourceNotFoundException') {
        return [];
      } else {
        throw queryError;
      }
    }

    const items = [];
    let lastKey = null;
    do {
      const response = await client.send(new ScanCommand({
        TableName: TABLE_NAME,
        FilterExpression: 'user_id = :userId',
        ExpressionAttributeValues: {
          ':userId': userIdNum,
        },
        ExclusiveStartKey: lastKey || undefined,
      }));
      if (response.Items) items.push(...response.Items);
      lastKey = response.LastEvaluatedKey;
    } while (lastKey);

    items.sort((a, b) => new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime());
    return items;
  }

  static async findActiveByUserAndState(userId, requestedState) {
    const stateNormalized = normalizeState(requestedState);
    if (!stateNormalized) return null;
    const userRequests = await this.findByUserId(userId);
    const match = userRequests.find((item) => {
      const itemState = normalizeState(item?.requested_state_normalized || item?.requested_state);
      if (itemState !== stateNormalized) return false;
      return !isFulfilledStatus(item?.status);
    });
    return match || null;
  }

  static async findAll(filters = {}) {
    const client = getDynamoDBClient();
    const stateNormalized = normalizeState(filters.requested_state || filters.state || '');
    const status = toText(filters.status).toLowerCase();

    const items = [];
    let lastKey = null;
    do {
      const response = await client.send(new ScanCommand({
        TableName: TABLE_NAME,
        ExclusiveStartKey: lastKey || undefined,
      }));
      if (response.Items) items.push(...response.Items);
      lastKey = response.LastEvaluatedKey;
    } while (lastKey);

    let filtered = items;
    if (stateNormalized) {
      filtered = filtered.filter((item) =>
        normalizeState(item?.requested_state_normalized || item?.requested_state) === stateNormalized
      );
    }
    if (status) {
      filtered = filtered.filter((item) => String(item?.status || '').trim().toLowerCase() === status);
    }

    filtered.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
    return filtered;
  }

  static async findById(id) {
    const requestId = toText(id);
    if (!requestId) return null;

    const client = getDynamoDBClient();
    const response = await client.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { id: requestId },
    }));
    return response?.Item || null;
  }

  static async deleteById(id) {
    const requestId = toText(id);
    if (!requestId) return false;

    const client = getDynamoDBClient();
    await client.send(new DeleteCommand({
      TableName: TABLE_NAME,
      Key: { id: requestId },
    }));
    return true;
  }
}

module.exports = MarketplaceTenderRequest;
