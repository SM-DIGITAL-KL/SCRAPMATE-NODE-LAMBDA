#!/usr/bin/env node

/**
 * Fix Order GSI Keys Script
 * 
 * This script fixes orders that have GSI key attributes (shop_id, delv_boy_id, delv_id)
 * with invalid types (like null objects) that cause "ValidationException: The update 
 * expression attempted to update the secondary index key to unsupported type" errors.
 * 
 * Usage:
 *   node scripts/fix-order-gsi-keys.js <orderId>
 * 
 * Example:
 *   node scripts/fix-order-gsi-keys.js 1769142700678
 */

const { getDynamoDBClient } = require('../config/dynamodb');
const { GetCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');

const TABLE_NAME = 'orders';

async function fixOrderGsiKeys(orderId) {
  try {
    const client = getDynamoDBClient();
    const id = typeof orderId === 'string' && !isNaN(orderId) ? parseInt(orderId) : orderId;
    
    console.log(`🔧 Fixing GSI keys for order ${id}...\n`);
    
    // First, get the current order
    const getCommand = new GetCommand({
      TableName: TABLE_NAME,
      Key: { id: id }
    });
    
    const response = await client.send(getCommand);
    const order = response.Item;
    
    if (!order) {
      console.log(`❌ Order ${id} not found`);
      return;
    }
    
    console.log(`📋 Order found: ${order.order_number || order.order_no || order.id}`);
    console.log(`   Current GSI key attributes:`);
    console.log(`   - shop_id: ${JSON.stringify(order.shop_id)} (type: ${typeof order.shop_id})`);
    console.log(`   - delv_boy_id: ${JSON.stringify(order.delv_boy_id)} (type: ${typeof order.delv_boy_id})`);
    console.log(`   - delv_id: ${JSON.stringify(order.delv_id)} (type: ${typeof order.delv_id})`);
    console.log();
    
    // Check which GSI keys need to be removed
    const gsiKeyAttributes = ['shop_id', 'delv_boy_id', 'delv_id'];
    const removeAttributes = [];
    
    for (const attr of gsiKeyAttributes) {
      if (order[attr] !== undefined) {
        const value = order[attr];
        const type = typeof value;
        
        // Check if value is invalid for GSI key
        // Valid types for GSI keys are: string, number
        // Invalid types are: null (object), object, boolean, undefined
        if (value === null || type === 'object' || type === 'boolean') {
          removeAttributes.push(attr);
          console.log(`⚠️  ${attr} has invalid type (${type} = ${JSON.stringify(value)}) - needs to be removed`);
        } else if (type === 'string' && (value === '' || value === 'null')) {
          removeAttributes.push(attr);
          console.log(`⚠️  ${attr} has invalid value ("${value}") - needs to be removed`);
        }
      }
    }
    
    if (removeAttributes.length === 0) {
      console.log(`✅ No invalid GSI key attributes found. Order is already clean.`);
      return;
    }
    
    console.log(`\n📝 Removing invalid GSI key attributes: ${removeAttributes.join(', ')}`);
    
    // Build REMOVE expression
    const removeExpression = removeAttributes.map((attr, index) => `#attr${index}`).join(', ');
    const expressionAttributeNames = {};
    removeAttributes.forEach((attr, index) => {
      expressionAttributeNames[`#attr${index}`] = attr;
    });
    
    // Also update updated_at
    expressionAttributeNames['#updated'] = 'updated_at';
    
    const updateExpression = `SET #updated = :updated REMOVE ${removeExpression}`;
    
    console.log(`\n🔧 Update expression: ${updateExpression}`);
    console.log(`   Expression attribute names:`, expressionAttributeNames);
    
    // Execute the update
    const updateCommand = new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { id: id },
      UpdateExpression: updateExpression,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: {
        ':updated': new Date().toISOString()
      },
      ReturnValues: 'ALL_NEW'
    });
    
    const updateResponse = await client.send(updateCommand);
    
    console.log(`\n✅ Successfully fixed order ${id}`);
    console.log(`   Updated order GSI keys:`);
    console.log(`   - shop_id: ${JSON.stringify(updateResponse.Attributes?.shop_id)}`);
    console.log(`   - delv_boy_id: ${JSON.stringify(updateResponse.Attributes?.delv_boy_id)}`);
    console.log(`   - delv_id: ${JSON.stringify(updateResponse.Attributes?.delv_id)}`);
    
  } catch (error) {
    console.error(`\n❌ Error fixing order ${orderId}:`, error.message);
    if (error.__type) {
      console.error(`   Error type: ${error.__type}`);
    }
    process.exit(1);
  }
}

// Main
const orderId = process.argv[2];

if (!orderId) {
  console.log('Usage: node scripts/fix-order-gsi-keys.js <orderId>');
  console.log('Example: node scripts/fix-order-gsi-keys.js 1769142700678');
  process.exit(1);
}

fixOrderGsiKeys(orderId);
