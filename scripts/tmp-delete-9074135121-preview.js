require('dotenv').config();
const { getDynamoDBClient } = require('../config/dynamodb');
const { ScanCommand } = require('@aws-sdk/lib-dynamodb');

(async () => {
  const client = getDynamoDBClient();
  const phone = 9074135121;

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

  const users = await scanAll({
    TableName: 'users',
    FilterExpression: 'mob_num = :m',
    ExpressionAttributeValues: { ':m': phone }
  });
  const userIds = users.map((u) => u.id);

  const customerAppUsers = users
    .filter((u) => u.app_type === 'customer_app' || u.user_type === 'C')
    .map((u) => ({ id: u.id, user_type: u.user_type, app_type: u.app_type || null, name: u.name || null, del_status: u.del_status || null }));

  const customersAll = await scanAll({ TableName: 'customer' });
  const customers = customersAll.filter((c) => Number(c.contact) === phone || userIds.includes(c.user_id));
  const customerIds = customers.map((c) => c.id);

  const shopsAll = await scanAll({ TableName: 'shops' });
  const shops = shopsAll.filter((s) =>
    userIds.includes(s.user_id) ||
    Number(s.contact) === phone || String(s.contact || '') === String(phone) ||
    Number(s.contact_number) === phone || String(s.contact_number || '') === String(phone)
  );

  const addressesAll = await scanAll({ TableName: 'addresses' });
  const addresses = addressesAll.filter((a) => userIds.includes(a.customer_id) || customerIds.includes(a.customer_id));

  console.log(JSON.stringify({
    phone,
    user_ids: userIds,
    customer_app_users: customerAppUsers,
    delete_counts: {
      customers: customers.length,
      shops: shops.length,
      addresses: addresses.length,
      customer_app_users: customerAppUsers.length
    },
    customer_ids: customerIds,
    shop_ids: shops.map((s) => s.id),
    address_ids: addresses.map((a) => a.id)
  }, null, 2));
})();
