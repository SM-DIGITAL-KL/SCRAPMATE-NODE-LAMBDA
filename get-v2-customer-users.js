const User = require('./models/User');
const Address = require('./models/Address');
require('dotenv').config();

// Import xlsx to create Excel files
const XLSX = require('xlsx');

async function getAllV2CustomerAppUsers() {
  try {
    console.log('Fetching all v2 customer_app users...');
    
    // Get DynamoDB client to scan all users
    const { getDynamoDBClient } = require('./config/dynamodb');
    const { ScanCommand } = require('@aws-sdk/lib-dynamodb');
    
    const client = getDynamoDBClient();
    const TABLE_NAME = 'users';
    
    let lastKey = null;
    const allUsers = [];
    
    // Scan all users from DynamoDB
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
        // Filter for v2 customer_app users
        const v2CustomerAppUsers = response.Items.filter(user => {
          return user.app_version === 'v2' && user.app_type === 'customer_app';
        });
        
        allUsers.push(...v2CustomerAppUsers);
        console.log(`Found ${v2CustomerAppUsers.length} v2 customer_app users in this batch. Total so far: ${allUsers.length}`);
      }

      lastKey = response.LastEvaluatedKey;
    } while (lastKey);

    console.log(`\nTotal v2 customer_app users found: ${allUsers.length}`);
    
    if (allUsers.length === 0) {
      console.log('No v2 customer_app users found.');
      return;
    }
    
    // Prepare data for Excel export
    // Map the user data to include only the most important fields
    // Also fetch and include address information for each user
    const userDataForExcel = [];
    
    console.log('\nFetching addresses for users...');
    
    for (let i = 0; i < allUsers.length; i++) {
      const user = allUsers[i];
      const addresses = await Address.findByCustomerId(user.id);
      
      if (addresses && addresses.length > 0) {
        // If user has multiple addresses, we'll add a row for each address
        addresses.forEach((address, addrIndex) => {
          userDataForExcel.push({
            ID: user.id,
            Name: user.name,
            Email: user.email,
            Mobile: user.mob_num,
            UserType: user.user_type,
            AppVersion: user.app_version,
            AppType: user.app_type,
            AddressID: address.id,
            Address: address.address,
            AddressType: address.addres_type,
            BuildingNo: address.building_no,
            Landmark: address.landmark,
            Latitude: address.latitude,
            Longitude: address.longitude,
            LatLog: address.lat_log,
            CreatedAt: user.created_at,
            UpdatedAt: user.updated_at,
            FcmToken: user.fcm_token ? 'Yes' : 'No',
            DelStatus: user.del_status || 'Active'
          });
        });
      } else {
        // If user has no addresses, still add their user info with empty address fields
        userDataForExcel.push({
          ID: user.id,
          Name: user.name,
          Email: user.email,
          Mobile: user.mob_num,
          UserType: user.user_type,
          AppVersion: user.app_version,
          AppType: user.app_type,
          AddressID: '',
          Address: '',
          AddressType: '',
          BuildingNo: '',
          Landmark: '',
          Latitude: '',
          Longitude: '',
          LatLog: '',
          CreatedAt: user.created_at,
          UpdatedAt: user.updated_at,
          FcmToken: user.fcm_token ? 'Yes' : 'No',
          DelStatus: user.del_status || 'Active'
        });
      }
      
      // Log progress
      if ((i + 1) % 50 === 0 || i === allUsers.length - 1) {
        console.log(`Processed ${i + 1}/${allUsers.length} users`);
      }
    }
    
    console.log(`\nPrepared ${userDataForExcel.length} rows for Excel export (${allUsers.length} users with their addresses)`);
    
    // Create a new workbook and add the data
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(userDataForExcel);
    
    // Adjust column widths for better readability
    const colWidths = [
      { wch: 15 }, // ID
      { wch: 25 }, // Name
      { wch: 30 }, // Email
      { wch: 15 }, // Mobile
      { wch: 10 }, // UserType
      { wch: 10 }, // AppVersion
      { wch: 15 }, // AppType
      { wch: 10 }, // AddressID
      { wch: 50 }, // Address
      { wch: 15 }, // AddressType
      { wch: 15 }, // BuildingNo
      { wch: 20 }, // Landmark
      { wch: 15 }, // Latitude
      { wch: 15 }, // Longitude
      { wch: 20 }, // LatLog
      { wch: 20 }, // CreatedAt
      { wch: 20 }, // UpdatedAt
      { wch: 10 }, // FcmToken
      { wch: 10 }  // DelStatus
    ];
    worksheet['!cols'] = colWidths;
    
    XLSX.utils.book_append_sheet(workbook, worksheet, 'V2_Customer_Users');
    
    // Generate filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `v2-customer-app-users-${timestamp}.xlsx`;
    
    // Write the Excel file
    XLSX.writeFile(workbook, filename);
    
    console.log(`\nExcel file created successfully: ${filename}`);
    console.log(`File contains ${allUsers.length} v2 customer_app users`);
    
    // Show sample of data
    console.log('\nSample of exported data:');
    console.table(userDataForExcel.slice(0, 5)); // Show first 5 records
    
  } catch (error) {
    console.error('Error fetching v2 customer_app users:', error);
    throw error;
  }
}

// Run the function
if (require.main === module) {
  (async () => {
    try {
      await getAllV2CustomerAppUsers();
      console.log('\nScript completed successfully!');
      process.exit(0);
    } catch (error) {
      console.error('\nScript failed with error:', error);
      process.exit(1);
    }
  })();
}

module.exports = { getAllV2CustomerAppUsers };