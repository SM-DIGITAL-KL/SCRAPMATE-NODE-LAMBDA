const { getDynamoDBClient } = require('../config/dynamodb');
const { ScanCommand } = require('@aws-sdk/lib-dynamodb');

const TABLE_NAME = 'users';

async function countV2DoorBuyers() {
  try {
    const client = getDynamoDBClient();
    let lastKey = null;
    let totalCount = 0;
    const v2DoorBuyers = [];

    console.log('🔍 Scanning users table for v2 door buyers (user_type = "D" and app_version = "v2")...\n');

    do {
      const params = {
        TableName: TABLE_NAME
      };

      if (lastKey) {
        params.ExclusiveStartKey = lastKey;
      }

      const command = new ScanCommand(params);
      const response = await client.send(command);

      if (response.Items) {
        // Filter for v2 door buyers: user_type = 'D' and app_version = 'v2'
        const doorBuyers = response.Items.filter(user => {
          return user.user_type === 'D' && user.app_version === 'v2';
        });

        totalCount += doorBuyers.length;
        v2DoorBuyers.push(...doorBuyers);
      }

      lastKey = response.LastEvaluatedKey;
    } while (lastKey);

    console.log(`\n✅ Total v2 Door Buyers (Delivery Users): ${totalCount}\n`);

    if (v2DoorBuyers.length > 0) {
      console.log('📋 Sample v2 Door Buyers (first 10):\n');
      v2DoorBuyers.slice(0, 10).forEach((user, index) => {
        console.log(`${index + 1}. ID: ${user.id}`);
        console.log(`   Name: ${user.name || 'N/A'}`);
        console.log(`   Mobile: ${user.mob_num || 'N/A'}`);
        console.log(`   Email: ${user.email || 'N/A'}`);
        console.log(`   App Version: ${user.app_version || 'N/A'}`);
        console.log(`   User Type: ${user.user_type || 'N/A'}`);
        console.log(`   Created At: ${user.created_at || 'N/A'}`);
        console.log('');
      });

      if (v2DoorBuyers.length > 10) {
        console.log(`... and ${v2DoorBuyers.length - 10} more v2 door buyers\n`);
      }
    } else {
      console.log('⚠️  No v2 door buyers found in the database.\n');
    }

    // Also count total door buyers (v1 + v2) for comparison
    let allDoorBuyersCount = 0;
    lastKey = null;
    
    do {
      const params = {
        TableName: TABLE_NAME
      };

      if (lastKey) {
        params.ExclusiveStartKey = lastKey;
      }

      const command = new ScanCommand(params);
      const response = await client.send(command);

      if (response.Items) {
        const doorBuyers = response.Items.filter(user => {
          return user.user_type === 'D';
        });
        allDoorBuyersCount += doorBuyers.length;
      }

      lastKey = response.LastEvaluatedKey;
    } while (lastKey);

    console.log(`📊 Statistics:`);
    console.log(`   Total Door Buyers (v1 + v2): ${allDoorBuyersCount}`);
    console.log(`   v2 Door Buyers: ${totalCount}`);
    console.log(`   v1 Door Buyers: ${allDoorBuyersCount - totalCount}`);
    console.log(`   v2 Percentage: ${allDoorBuyersCount > 0 ? ((totalCount / allDoorBuyersCount) * 100).toFixed(2) : 0}%\n`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Error counting v2 door buyers:', error);
    process.exit(1);
  }
}

countV2DoorBuyers();











