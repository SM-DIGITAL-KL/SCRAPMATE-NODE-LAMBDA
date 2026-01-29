/**
 * Export users to Excel (.xlsx) for a specific date range
 * Usage: node scripts/export-users-excel.js [startDate] [endDate]
 * Example: node scripts/export-users-excel.js 2026-01-20 2026-01-27
 */

require('dotenv').config();
const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');
const User = require('../models/User');
const { getDynamoDBClient } = require('../config/dynamodb');
const { ScanCommand } = require('@aws-sdk/lib-dynamodb');

async function exportUsersToExcel(startDate, endDate) {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 Exporting Users to Excel');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log(`📅 Date Range: ${startDate} to ${endDate}\n`);

  const client = getDynamoDBClient();
  const allUsers = [];
  
  // Convert date strings to Date objects for comparison
  const startDateTime = new Date(`${startDate} 00:00:00`);
  const endDateTime = new Date(`${endDate} 23:59:59`);
  
  console.log('🔍 Fetching users from DynamoDB...');
  
  // Scan all users and filter by date range
  let lastKey = null;
  let totalScanned = 0;
  
  do {
    const params = {
      TableName: 'users',
      FilterExpression: '(attribute_not_exists(del_status) OR del_status <> :deleted)',
      ExpressionAttributeValues: {
        ':deleted': 2
      }
    };
    
    if (lastKey) {
      params.ExclusiveStartKey = lastKey;
    }
    
    const command = new ScanCommand(params);
    const response = await client.send(command);
    
    if (response.Items) {
      totalScanned += response.Items.length;
      
      // Filter users by date range
      const filteredUsers = response.Items.filter(user => {
        if (!user.created_at) return false;
        const userDate = new Date(user.created_at);
        return userDate >= startDateTime && userDate <= endDateTime;
      });
      
      allUsers.push(...filteredUsers);
      console.log(`   📊 Scanned ${totalScanned} users, found ${allUsers.length} in date range...`);
    }
    
    lastKey = response.LastEvaluatedKey;
  } while (lastKey);
  
  console.log(`\n✅ Total users found: ${allUsers.length}\n`);
  
  if (allUsers.length === 0) {
    console.log('⚠️  No users found in the specified date range.');
    return;
  }
  
  // Create a new workbook
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Users');
  
  // Define columns
  worksheet.columns = [
    { header: 'SL NO', key: 'slNo', width: 10 },
    { header: 'USER ID', key: 'id', width: 15 },
    { header: 'NAME', key: 'name', width: 30 },
    { header: 'EMAIL', key: 'email', width: 35 },
    { header: 'MOBILE NUMBER', key: 'mob_num', width: 18 },
    { header: 'USER TYPE', key: 'user_type', width: 15 },
    { header: 'APP TYPE', key: 'app_type', width: 15 },
    { header: 'APP VERSION', key: 'app_version', width: 15 },
    { header: 'CREATED AT', key: 'created_at', width: 25 },
    { header: 'UPDATED AT', key: 'updated_at', width: 25 },
    { header: 'STATUS', key: 'del_status', width: 12 }
  ];
  
  // Style header row
  worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  worksheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF6C5CE7' }
  };
  worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
  
  // Add user data
  allUsers.forEach((user, index) => {
    const row = worksheet.addRow({
      slNo: index + 1,
      id: user.id || 'N/A',
      name: user.name || 'N/A',
      email: user.email || 'N/A',
      mob_num: user.mob_num || 'N/A',
      user_type: user.user_type || 'N/A',
      app_type: user.app_type || 'N/A',
      app_version: user.app_version || 'v1',
      created_at: user.created_at ? new Date(user.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : 'N/A',
      updated_at: user.updated_at ? new Date(user.updated_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : 'N/A',
      del_status: user.del_status === 2 ? 'Deleted' : (user.del_status === 1 ? 'Active' : 'Active')
    });
    
    // Alternate row colors for better readability
    if (index % 2 === 0) {
      row.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF8F9FA' }
      };
    }
  });
  
  // Freeze header row
  worksheet.views = [{ state: 'frozen', ySplit: 1 }];
  
  // Generate filename
  const filename = `users_${startDate}_to_${endDate}.xlsx`;
  const filepath = path.join(__dirname, '..', filename);
  
  // Write to file
  await workbook.xlsx.writeFile(filepath);
  
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ Excel file created successfully!');
  console.log(`📁 File: ${filepath}`);
  console.log(`📊 Total rows: ${allUsers.length + 1} (including header)`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

// Parse command line arguments
const startDate = process.argv[2] || '2026-01-20';
const endDate = process.argv[3] || '2026-01-27';

// Validate date format
const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
  console.error('❌ Error: Invalid date format. Please use YYYY-MM-DD format.');
  console.log('Usage: node scripts/export-users-excel.js [startDate] [endDate]');
  console.log('Example: node scripts/export-users-excel.js 2026-01-20 2026-01-27');
  process.exit(1);
}

// Run export
exportUsersToExcel(startDate, endDate).catch(err => {
  console.error('❌ Error exporting users:', err);
  process.exit(1);
});
