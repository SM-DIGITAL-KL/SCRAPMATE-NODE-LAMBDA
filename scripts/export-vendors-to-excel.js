#!/usr/bin/env node

/**
 * Script to export all v1 and v2 vendors to an Excel file
 * First column will be phone number
 * Usage: node scripts/export-vendors-to-excel.js [env]
 * Example: node scripts/export-vendors-to-excel.js prod
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { getDynamoDBClient } = require('../config/dynamodb');
const { ScanCommand } = require('@aws-sdk/lib-dynamodb');
const { getTableName } = require('../utils/dynamodbTableNames');

// Try to use xlsx library, fallback to CSV if not available
let XLSX;
try {
  XLSX = require('xlsx');
} catch (e) {
  console.log('⚠️  xlsx library not found. Installing...');
  console.log('   Run: npm install xlsx');
  console.log('   Or the script will create a CSV file instead.\n');
}

const client = getDynamoDBClient();

// Parse command line arguments
const args = process.argv.slice(2);
const env = args[0] || process.env.NODE_ENV || 'prod';

async function exportVendorsToExcel() {
  process.env.NODE_ENV = env;
  const tableName = getTableName('users');
  
  console.log(`\n📊 Exporting Vendors to Excel/CSV`);
  console.log(`   Environment: ${env}`);
  console.log(`   Table: ${tableName}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    // Vendor user types: S (Shop), R (Recycler), SR (Shop+Recycler), D (Delivery)
    const vendorTypes = ['S', 'R', 'SR', 'D'];
    
    let allUsers = [];
    let lastKey = null;

    // Scan all users
    console.log('📋 Scanning users table...');
    do {
      const params = {
        TableName: tableName,
        ProjectionExpression: 'id, mob_num, user_type, app_type, app_version, #name, del_status',
        ExpressionAttributeNames: {
          '#name': 'name',
        },
      };

      if (lastKey) {
        params.ExclusiveStartKey = lastKey;
      }

      const command = new ScanCommand(params);
      const response = await client.send(command);

      if (response.Items && response.Items.length > 0) {
        allUsers = allUsers.concat(response.Items);
        if (allUsers.length % 1000 === 0) {
          console.log(`   Scanned ${allUsers.length} users so far...`);
        }
      }

      lastKey = response.LastEvaluatedKey;
    } while (lastKey);

    console.log(`✅ Total users scanned: ${allUsers.length}\n`);

    // Filter vendors (v1 and v2)
    const vendors = allUsers.filter(user => 
      vendorTypes.includes(user.user_type) &&
      user.mob_num && // Must have phone number
      (user.del_status !== 2 || !user.del_status) && // Not deleted
      (user.app_version === 'v1' || user.app_version === 'v2' || !user.app_version) // v1, v2, or no version (treat as v1)
    );

    // Separate v1 and v2 vendors
    const v1Vendors = vendors.filter(v => v.app_version === 'v1' || !v.app_version);
    const v2Vendors = vendors.filter(v => v.app_version === 'v2');

    console.log(`📦 Total vendors found: ${vendors.length}`);
    console.log(`   V1 Vendors: ${v1Vendors.length}`);
    console.log(`   V2 Vendors: ${v2Vendors.length}`);
    console.log(`   S (Shop):        ${vendors.filter(v => v.user_type === 'S').length}`);
    console.log(`   R (Recycler):    ${vendors.filter(v => v.user_type === 'R').length}`);
    console.log(`   SR (Shop+Recycler): ${vendors.filter(v => v.user_type === 'SR').length}`);
    console.log(`   D (Delivery):    ${vendors.filter(v => v.user_type === 'D').length}`);
    console.log('');

    if (vendors.length === 0) {
      console.log('⚠️  No vendors found.');
      process.exit(0);
    }

    // Prepare data for export
    // Sort by app_version (v2 first, then v1), then by phone number
    const sortedVendors = vendors.sort((a, b) => {
      const aVersion = a.app_version || 'v1';
      const bVersion = b.app_version || 'v1';
      if (aVersion !== bVersion) {
        return aVersion === 'v2' ? -1 : 1;
      }
      return String(a.mob_num).localeCompare(String(b.mob_num));
    });

    // Create data array with phone number as first column
    const data = sortedVendors.map((vendor, index) => ({
      'Phone Number': String(vendor.mob_num || '').trim(),
      'Vendor ID': vendor.id || '',
      'Name': vendor.name || 'N/A',
      'User Type': vendor.user_type || '',
      'App Version': vendor.app_version || 'v1',
      'App Type': vendor.app_type || 'N/A',
      'Row Number': index + 1,
    }));

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    
    if (XLSX) {
      // Create Excel file
      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.json_to_sheet(data);
      
      // Set column widths
      const colWidths = [
        { wch: 15 }, // Phone Number
        { wch: 20 }, // Vendor ID
        { wch: 30 }, // Name
        { wch: 12 }, // User Type
        { wch: 12 }, // App Version
        { wch: 15 }, // App Type
        { wch: 12 }, // Row Number
      ];
      worksheet['!cols'] = colWidths;
      
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Vendors');
      
      const filename = `vendors-export-${timestamp}.xlsx`;
      const filepath = path.join(__dirname, filename);
      
      XLSX.writeFile(workbook, filepath);
      
      console.log('✅ Excel file created successfully!');
      console.log(`   File: ${filepath}`);
      console.log(`   Total vendors: ${vendors.length}`);
      console.log(`   Columns: Phone Number (first), Vendor ID, Name, User Type, App Version, App Type, Row Number\n`);
    } else {
      // Create CSV file as fallback
      const filename = `vendors-export-${timestamp}.csv`;
      const filepath = path.join(__dirname, filename);
      
      // Create CSV header
      const headers = ['Phone Number', 'Vendor ID', 'Name', 'User Type', 'App Version', 'App Type', 'Row Number'];
      const csvRows = [
        headers.join(','),
        ...data.map(row => [
          `"${String(row['Phone Number']).replace(/"/g, '""')}"`,
          row['Vendor ID'],
          `"${String(row['Name']).replace(/"/g, '""')}"`,
          row['User Type'],
          row['App Version'],
          `"${String(row['App Type']).replace(/"/g, '""')}"`,
          row['Row Number'],
        ].join(','))
      ];
      
      fs.writeFileSync(filepath, csvRows.join('\n'), 'utf8');
      
      console.log('✅ CSV file created successfully!');
      console.log(`   File: ${filepath}`);
      console.log(`   Total vendors: ${vendors.length}`);
      console.log(`   Columns: Phone Number (first), Vendor ID, Name, User Type, App Version, App Type, Row Number`);
      console.log(`\n   💡 To create an Excel file, install xlsx: npm install xlsx\n`);
    }

    // Also create a summary file
    const summary = {
      export_date: new Date().toISOString(),
      environment: env,
      total_vendors: vendors.length,
      v1_vendors: v1Vendors.length,
      v2_vendors: v2Vendors.length,
      by_user_type: {
        S: vendors.filter(v => v.user_type === 'S').length,
        R: vendors.filter(v => v.user_type === 'R').length,
        SR: vendors.filter(v => v.user_type === 'SR').length,
        D: vendors.filter(v => v.user_type === 'D').length,
      },
    };

    const summaryFilename = `vendors-export-summary-${timestamp}.json`;
    const summaryFilepath = path.join(__dirname, summaryFilename);
    fs.writeFileSync(summaryFilepath, JSON.stringify(summary, null, 2));
    console.log(`💾 Summary saved to: ${summaryFilename}\n`);

    console.log('✅ Export completed successfully!\n');

  } catch (error) {
    console.error(`❌ Error exporting vendors:`, error.message);
    console.error('   Error details:', error);
    process.exit(1);
  }
}

// Run the script
exportVendorsToExcel()
  .then(() => {
    console.log('🎉 Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });

