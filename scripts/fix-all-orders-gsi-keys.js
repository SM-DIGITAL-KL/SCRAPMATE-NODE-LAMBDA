#!/usr/bin/env node

/**
 * Fix All Orders GSI Keys Script
 * 
 * This script scans all orders and fixes those that have GSI key attributes 
 * (shop_id, delv_boy_id, delv_id) with invalid types (like null objects).
 * 
 * Usage:
 *   node scripts/fix-all-orders-gsi-keys.js [--dry-run]
 * 
 * Options:
 *   --dry-run    Show what would be fixed without making changes
 */

const { getDynamoDBClient } = require('../config/dynamodb');
const { ScanCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');

const TABLE_NAME = 'orders';
const BATCH_SIZE = 100;

async function scanAndFixOrders(dryRun = false) {
  const client = getDynamoDBClient();
  
  console.log(`${dryRun ? '🔍 [DRY RUN]' : '🔧'} Scanning all orders for invalid GSI key attributes...\n`);
  
  let lastKey = null;
  let scannedCount = 0;
  let fixedCount = 0;
  let errorCount = 0;
  const ordersWithIssues = [];
  
  do {
    try {
      const scanCommand = new ScanCommand({
        TableName: TABLE_NAME,
        Limit: BATCH_SIZE,
        ...(lastKey && { ExclusiveStartKey: lastKey })
      });
      
      const response = await client.send(scanCommand);
      const orders = response.Items || [];
      lastKey = response.LastEvaluatedKey;
      
      scannedCount += orders.length;
      
      for (const order of orders) {
        const gsiKeyAttributes = ['shop_id', 'delv_boy_id', 'delv_id'];
        const invalidAttributes = [];
        
        for (const attr of gsiKeyAttributes) {
          if (order[attr] !== undefined) {
            const value = order[attr];
            const type = typeof value;
            
            // Check if value is invalid for GSI key
            if (value === null || type === 'object' || type === 'boolean') {
              invalidAttributes.push(attr);
            } else if (type === 'string' && (value === '' || value === 'null')) {
              invalidAttributes.push(attr);
            }
          }
        }
        
        if (invalidAttributes.length > 0) {
          ordersWithIssues.push({
            id: order.id,
            order_number: order.order_number || order.order_no,
            invalidAttributes: invalidAttributes,
            values: invalidAttributes.reduce((acc, attr) => {
              acc[attr] = order[attr];
              return acc;
            }, {})
          });
          
          if (!dryRun) {
            try {
              await fixOrder(client, order.id, invalidAttributes);
              fixedCount++;
              console.log(`✅ Fixed order ${order.id} (removed: ${invalidAttributes.join(', ')})`);
            } catch (err) {
              errorCount++;
              console.error(`❌ Error fixing order ${order.id}: ${err.message}`);
            }
          } else {
            console.log(`🔍 [DRY RUN] Would fix order ${order.id} (remove: ${invalidAttributes.join(', ')})`);
          }
        }
      }
      
      if (scannedCount % 1000 === 0) {
        console.log(`   Scanned ${scannedCount} orders...`);
      }
      
    } catch (error) {
      console.error(`❌ Error scanning orders: ${error.message}`);
      process.exit(1);
    }
  } while (lastKey);
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`📊 Summary:`);
  console.log(`   Total orders scanned: ${scannedCount}`);
  console.log(`   Orders with invalid GSI keys: ${ordersWithIssues.length}`);
  
  if (!dryRun) {
    console.log(`   Orders fixed: ${fixedCount}`);
    console.log(`   Errors: ${errorCount}`);
  } else {
    console.log(`   Orders that would be fixed: ${ordersWithIssues.length}`);
  }
  
  if (ordersWithIssues.length > 0) {
    console.log(`\n📋 Orders with issues:`);
    ordersWithIssues.forEach((o, i) => {
      console.log(`   ${i + 1}. Order ${o.id} (Order #${o.order_number || 'N/A'})`);
      console.log(`      Invalid attributes: ${o.invalidAttributes.join(', ')}`);
      console.log(`      Values: ${JSON.stringify(o.values)}`);
    });
  }
  
  console.log(`\n${'='.repeat(60)}`);
  
  if (dryRun && ordersWithIssues.length > 0) {
    console.log(`\n💡 To fix these orders, run without --dry-run:`);
    console.log(`   node scripts/fix-all-orders-gsi-keys.js`);
  }
}

async function fixOrder(client, orderId, invalidAttributes) {
  const removeExpression = invalidAttributes.map((attr, index) => `#attr${index}`).join(', ');
  const expressionAttributeNames = {};
  
  invalidAttributes.forEach((attr, index) => {
    expressionAttributeNames[`#attr${index}`] = attr;
  });
  
  expressionAttributeNames['#updated'] = 'updated_at';
  
  const updateExpression = `SET #updated = :updated REMOVE ${removeExpression}`;
  
  const updateCommand = new UpdateCommand({
    TableName: TABLE_NAME,
    Key: { id: orderId },
    UpdateExpression: updateExpression,
    ExpressionAttributeNames: expressionAttributeNames,
    ExpressionAttributeValues: {
      ':updated': new Date().toISOString()
    }
  });
  
  await client.send(updateCommand);
}

// Main
const dryRun = process.argv.includes('--dry-run');

scanAndFixOrders(dryRun);
