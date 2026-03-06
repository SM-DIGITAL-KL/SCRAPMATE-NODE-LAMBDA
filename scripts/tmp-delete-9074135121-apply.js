require('dotenv').config();
const { getDynamoDBClient } = require('../config/dynamodb');
const { ScanCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');

const PHONE = 9074135121;
const APPLY = process.argv.includes('--apply');

(async () => {
  const client = getDynamoDBClient();

  const scanAll = async (params) => {
    const out = [];
    let last;
    do {
      const res = await client.send(new ScanCommand({ ...params, ExclusiveStartKey: last }));
      if (res.Items) out.push(...res.Items);
      last = res.LastEvaluatedKey;
    } while (last);
    return out;
  };

  const deleteById = async (tableName, id) => {
    if (!APPLY) return;
    await client.send(new DeleteCommand({
      TableName: tableName,
      Key: { id }
    }));
  };

  const users = await scanAll({
    TableName: 'users',
    FilterExpression: 'mob_num = :m',
    ExpressionAttributeValues: { ':m': PHONE }
  });

  const userIds = users.map((u) => u.id);

  const customerAppUsers = users.filter(
    (u) => u.app_type === 'customer_app' || u.user_type === 'C'
  );

  const customersAll = await scanAll({ TableName: 'customer' });
  const customers = customersAll.filter((c) =>
    Number(c.contact) === PHONE || userIds.includes(c.user_id)
  );
  const customerIds = customers.map((c) => c.id);

  const shopsAll = await scanAll({ TableName: 'shops' });
  const shops = shopsAll.filter((s) =>
    userIds.includes(s.user_id) ||
    Number(s.contact) === PHONE || String(s.contact || '') === String(PHONE) ||
    Number(s.contact_number) === PHONE || String(s.contact_number || '') === String(PHONE)
  );

  const addressesAll = await scanAll({ TableName: 'addresses' });
  const addresses = addressesAll.filter((a) =>
    userIds.includes(a.customer_id) || customerIds.includes(a.customer_id)
  );

  const deleted = {
    addresses: [],
    shops: [],
    customers: [],
    customer_app_users: []
  };

  for (const a of addresses) {
    await deleteById('addresses', a.id);
    deleted.addresses.push(a.id);
  }

  for (const s of shops) {
    await deleteById('shops', s.id);
    deleted.shops.push(s.id);
  }

  for (const c of customers) {
    await deleteById('customer', c.id);
    deleted.customers.push(c.id);
  }

  for (const u of customerAppUsers) {
    await deleteById('users', u.id);
    deleted.customer_app_users.push(u.id);
  }

  console.log(JSON.stringify({
    phone: PHONE,
    mode: APPLY ? 'apply' : 'dry_run',
    matched: {
      users_total_by_phone: users.length,
      customer_app_users: customerAppUsers.length,
      customers: customers.length,
      shops: shops.length,
      addresses: addresses.length
    },
    deleted
  }, null, 2));
})();
