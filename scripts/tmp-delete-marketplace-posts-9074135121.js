require('dotenv').config();

const { getDynamoDBClient } = require('../config/dynamodb');
const { ScanCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');

const PHONE = '9074135121';
const APPLY = process.argv.includes('--apply');

const toStr = (value) => String(value ?? '').trim();

const scanAll = async (client, params) => {
  const items = [];
  let lastEvaluatedKey;
  do {
    const response = await client.send(
      new ScanCommand({
        ...params,
        ExclusiveStartKey: lastEvaluatedKey,
      })
    );
    if (Array.isArray(response?.Items)) {
      items.push(...response.Items);
    }
    lastEvaluatedKey = response?.LastEvaluatedKey;
  } while (lastEvaluatedKey);
  return items;
};

const deleteById = async (client, tableName, id) => {
  await client.send(
    new DeleteCommand({
      TableName: tableName,
      Key: { id },
    })
  );
};

(async () => {
  const client = getDynamoDBClient();

  const users = await scanAll(client, {
    TableName: 'users',
    FilterExpression: 'mob_num = :mobile',
    ExpressionAttributeValues: {
      ':mobile': Number(PHONE),
    },
  });

  const userIds = Array.from(
    new Set(
      users
        .map((u) => Number(u?.id))
        .filter((id) => Number.isFinite(id) && id > 0)
    )
  );

  const bulkSell = await scanAll(client, { TableName: 'bulk_sell_requests' });
  const bulkBuy = await scanAll(client, { TableName: 'bulk_scrap_requests' });
  const pendingBuy = await scanAll(client, { TableName: 'pending_bulk_buy_orders' });

  const sellPosts = bulkSell.filter((item) => userIds.includes(Number(item?.seller_id)));
  const buyPosts = bulkBuy.filter((item) => userIds.includes(Number(item?.buyer_id)));
  const pendingBuyPosts = pendingBuy.filter((item) => userIds.includes(Number(item?.buyer_id)));

  if (APPLY) {
    for (const post of sellPosts) {
      await deleteById(client, 'bulk_sell_requests', post.id);
    }
    for (const post of buyPosts) {
      await deleteById(client, 'bulk_scrap_requests', post.id);
    }
    for (const post of pendingBuyPosts) {
      await deleteById(client, 'pending_bulk_buy_orders', post.id);
    }
  }

  console.log(
    JSON.stringify(
      {
        mode: APPLY ? 'apply' : 'dry_run',
        phone: PHONE,
        user_ids: userIds,
        counts: {
          users: users.length,
          sell_posts: sellPosts.length,
          buy_posts: buyPosts.length,
          pending_buy_posts: pendingBuyPosts.length,
        },
        ids: {
          sell_posts: sellPosts.map((post) => toStr(post.id)),
          buy_posts: buyPosts.map((post) => toStr(post.id)),
          pending_buy_posts: pendingBuyPosts.map((post) => toStr(post.id)),
        },
      },
      null,
      2
    )
  );
})().catch((error) => {
  console.error('❌ tmp-delete-marketplace-posts-9074135121 failed:', error);
  process.exit(1);
});

