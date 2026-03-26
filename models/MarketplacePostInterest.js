const { getDynamoDBClient } = require('../config/dynamodb');
const { PutCommand, ScanCommand, UpdateCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');

const TABLE_NAME = 'marketplace_post_interests';

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

const normalizePostType = (value) => {
  const text = String(value || '').trim().toLowerCase();
  return text === 'buy' ? 'buy' : 'sell';
};

class MarketplacePostInterest {
  static async findExisting(userId, postId, postType) {
    const client = getDynamoDBClient();
    const items = [];
    let lastKey = null;

    do {
      const command = new ScanCommand({
        TableName: TABLE_NAME,
        FilterExpression: 'user_id = :userId AND post_id = :postId AND post_type = :postType',
        ExpressionAttributeValues: {
          ':userId': userId,
          ':postId': postId,
          ':postType': postType,
        },
        ExclusiveStartKey: lastKey || undefined,
      });

      const response = await client.send(command);
      if (response.Items) items.push(...response.Items);
      lastKey = response.LastEvaluatedKey;
    } while (lastKey);

    if (items.length === 0) return null;
    items.sort((a, b) => new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime());
    return items[0];
  }

  static async createOrUpdate(data) {
    const client = getDynamoDBClient();
    const now = new Date().toISOString();
    const userId = toNum(data.user_id);
    const postId = toText(data.post_id);
    const postType = normalizePostType(data.post_type);

    if (!userId || !postId) {
      throw new Error('user_id and post_id are required');
    }

    const existing = await this.findExisting(userId, postId, postType);
    if (existing?.id) {
      const command = new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { id: existing.id },
        UpdateExpression:
          'SET owner_id = :ownerId, owner_name = :ownerName, user_name = :userName, user_phone = :userPhone, post_title = :postTitle, post_location = :postLocation, post_price = :postPrice, post_star = :postStar, post_image = :postImage, post_snapshot = :postSnapshot, updated_at = :updatedAt',
        ExpressionAttributeValues: {
          ':ownerId': toNum(data.owner_id),
          ':ownerName': toText(data.owner_name) || null,
          ':userName': toText(data.user_name) || null,
          ':userPhone': toText(data.user_phone) || null,
          ':postTitle': toText(data.post_title) || null,
          ':postLocation': toText(data.post_location) || null,
          ':postPrice': toText(data.post_price) || null,
          ':postStar': toNum(data.post_star) || 0,
          ':postImage': toText(data.post_image) || null,
          ':postSnapshot': data.post_snapshot || null,
          ':updatedAt': now,
        },
        ReturnValues: 'ALL_NEW',
      });
      const response = await client.send(command);
      return response.Attributes || existing;
    }

    const item = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      user_id: userId,
      user_name: toText(data.user_name) || null,
      user_phone: toText(data.user_phone) || null,
      post_id: postId,
      post_type: postType,
      owner_id: toNum(data.owner_id),
      owner_name: toText(data.owner_name) || null,
      post_title: toText(data.post_title) || null,
      post_location: toText(data.post_location) || null,
      post_price: toText(data.post_price) || null,
      post_star: toNum(data.post_star) || 0,
      post_image: toText(data.post_image) || null,
      post_snapshot: data.post_snapshot || null,
      created_at: now,
      updated_at: now,
    };

    const command = new PutCommand({
      TableName: TABLE_NAME,
      Item: item,
    });
    await client.send(command);
    return item;
  }

  static async findByUserId(userId) {
    const client = getDynamoDBClient();
    const userIdNum = toNum(userId);
    if (!userIdNum) return [];

    // Prefer GSI query for performance.
    try {
      const items = [];
      let lastKey = null;
      do {
        const command = new QueryCommand({
          TableName: TABLE_NAME,
          IndexName: 'user_id-index',
          KeyConditionExpression: 'user_id = :userId',
          ExpressionAttributeValues: {
            ':userId': userIdNum,
          },
          ScanIndexForward: false,
          ExclusiveStartKey: lastKey || undefined,
        });
        const response = await client.send(command);
        if (response.Items) items.push(...response.Items);
        lastKey = response.LastEvaluatedKey;
      } while (lastKey);

      items.sort((a, b) => new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime());
      return items;
    } catch (queryError) {
      // Fallback for environments where GSI is not yet created.
      if (
        queryError.name === 'ValidationException' ||
        String(queryError.message || '').toLowerCase().includes('index')
      ) {
        console.warn('⚠️ user_id-index not available for marketplace_post_interests, falling back to Scan.');
      } else if (queryError.name === 'ResourceNotFoundException') {
        return [];
      } else {
        throw queryError;
      }
    }

    const items = [];
    let lastKey = null;
    do {
      const command = new ScanCommand({
        TableName: TABLE_NAME,
        FilterExpression: 'user_id = :userId',
        ExpressionAttributeValues: {
          ':userId': userIdNum,
        },
        ExclusiveStartKey: lastKey || undefined,
      });
      const response = await client.send(command);
      if (response.Items) items.push(...response.Items);
      lastKey = response.LastEvaluatedKey;
    } while (lastKey);

    items.sort((a, b) => new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime());
    return items;
  }
}

module.exports = MarketplacePostInterest;
