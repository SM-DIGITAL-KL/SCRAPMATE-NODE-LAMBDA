const fs = require('fs');
const path = require('path');
const { getDynamoDBClient } = require('../config/dynamodb');
const { PutCommand, BatchWriteCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');
const { loadEnvFromFile } = require('../utils/loadEnv');

// Load environment variables
loadEnvFromFile();

/**
 * Parse SQL INSERT statements and convert to DynamoDB items
 */
function parseSQLInserts(sqlContent, tableName) {
  const items = [];
  
  // Find all INSERT INTO statements for the table
  const escapedTableName = tableName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const insertPattern = `INSERT INTO \`${escapedTableName}\`[^;]+;`;
  const insertRegex = new RegExp(insertPattern, 'gi');
  const matches = sqlContent.match(insertRegex);
  
  if (!matches) {
    return items;
  }
  
  for (const match of matches) {
    // Extract column names - improved regex
    const columns = [];
    const colMatch = match.match(/INSERT INTO `[^`]+`\s*\(([^)]+)\)/i);
    if (!colMatch) continue;
    
    const colString = colMatch[1];
    const colRegex = /`([^`]+)`/g;
    let colMatchResult;
    while ((colMatchResult = colRegex.exec(colString)) !== null) {
      columns.push(colMatchResult[1]);
    }
    
    // Extract values
    const valuesMatch = match.match(/VALUES\s+(.+);/is);
    if (!valuesMatch) continue;
    
    const valuesString = valuesMatch[1];
    // Parse each row - improved to handle multiline values
    const rowRegex = /\(([^)]*(?:\([^)]*\)[^)]*)*)\)/g;
    let rowMatch;
    
    while ((rowMatch = rowRegex.exec(valuesString)) !== null) {
      const rowValues = parseSQLValues(rowMatch[1]);
      if (rowValues.length === columns.length) {
        const item = {};
        columns.forEach((col, index) => {
          let value = rowValues[index];
          // Convert numeric strings to numbers for id fields
          if (col === 'id' || col.includes('_id') || col === 'user_id' || col === 'shop_id') {
            if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
              const numValue = parseInt(value.trim());
              if (!isNaN(numValue)) {
                value = numValue;
              }
            }
          }
          // Convert 'NULL' to null
          if (value === 'NULL' || value === null || value === '') {
            value = null;
          }
          // Remove quotes from strings
          if (typeof value === 'string' && value.trim() !== '') {
            value = value.trim();
          }
          item[col] = value;
        });
        items.push(item);
      }
    }
  }
  
  return items;
}

/**
 * Parse SQL values (handles strings, numbers, NULL, etc.)
 */
function parseSQLValues(valueString) {
  const values = [];
  let current = '';
  let inString = false;
  let stringChar = null;
  let i = 0;
  
  while (i < valueString.length) {
    const char = valueString[i];
    
    if (!inString) {
      if (char === '"' || char === "'") {
        inString = true;
        stringChar = char;
        current = '';
      } else if (char === ',') {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    } else {
      if (char === stringChar && (i === 0 || valueString[i - 1] !== '\\')) {
        inString = false;
        values.push(current);
        current = '';
        // Skip comma after string
        if (i + 1 < valueString.length && valueString[i + 1] === ',') {
          i++;
        }
      } else {
        current += char;
      }
    }
    i++;
  }
  
  if (current.trim()) {
    values.push(current.trim());
  }
  
  return values.map(v => {
    if (v === 'NULL' || v === '') return null;
    // Remove quotes if present
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      return v.slice(1, -1);
    }
    return v;
  });
}

/**
 * Get all items from DynamoDB table
 */
async function getDynamoDBItems(tableName) {
  const client = getDynamoDBClient();
  const items = [];
  let lastKey = null;
  
  do {
    const params = {
      TableName: tableName
    };
    
    if (lastKey) {
      params.ExclusiveStartKey = lastKey;
    }
    
    try {
      const command = new ScanCommand(params);
      const response = await client.send(command);
      
      if (response.Items) {
        items.push(...response.Items);
      }
      
      lastKey = response.LastEvaluatedKey;
    } catch (error) {
      // Table might not exist
      if (error.name === 'ResourceNotFoundException') {
        console.log(`  ⚠️  Table ${tableName} does not exist in DynamoDB`);
        return [];
      }
      throw error;
    }
  } while (lastKey);
  
  return items;
}

/**
 * Find missing items by comparing SQL items with DynamoDB items
 */
function findMissingItems(sqlItems, dynamoItems, keyField = 'id') {
  const dynamoKeys = new Set();
  
  // Create a set of existing keys from DynamoDB
  dynamoItems.forEach(item => {
    const key = item[keyField];
    if (key !== null && key !== undefined) {
      dynamoKeys.add(String(key));
    }
  });
  
  // Find items in SQL that don't exist in DynamoDB
  const missingItems = sqlItems.filter(item => {
    const key = item[keyField];
    if (key === null || key === undefined) {
      return true; // Include items without keys (they might be new)
    }
    return !dynamoKeys.has(String(key));
  });
  
  return missingItems;
}

/**
 * Import missing items to DynamoDB table
 */
async function importMissingItems(tableName, items, keyField = 'id') {
  if (items.length === 0) {
    return 0;
  }
  
  const client = getDynamoDBClient();
  const batchSize = 25; // DynamoDB batch write limit
  let imported = 0;
  
  console.log(`  📦 Importing ${items.length} missing items to ${tableName}...`);
  
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const writeRequests = batch.map(item => ({
      PutRequest: {
        Item: item
      }
    }));
    
    try {
      const command = new BatchWriteCommand({
        RequestItems: {
          [tableName]: writeRequests
        }
      });
      
      await client.send(command);
      imported += batch.length;
      console.log(`    ✅ Imported batch ${Math.floor(i / batchSize) + 1} (${batch.length} items)`);
    } catch (error) {
      console.error(`    ❌ Error importing batch ${Math.floor(i / batchSize) + 1}:`, error.message);
      
      // Try individual puts if batch fails
      for (const item of batch) {
        try {
          const putCommand = new PutCommand({
            TableName: tableName,
            Item: item
          });
          await client.send(putCommand);
          imported++;
        } catch (putError) {
          console.error(`      ❌ Failed to import item with ${keyField} ${item[keyField] || 'unknown'}:`, putError.message);
        }
      }
    }
  }
  
  return imported;
}

/**
 * Main function
 */
async function main() {
  const sqlFilePath = process.argv[2] || path.join(__dirname, '../scrap (2).sql');
  
  if (!fs.existsSync(sqlFilePath)) {
    console.error(`❌ SQL file not found: ${sqlFilePath}`);
    process.exit(1);
  }
  
  console.log(`📖 Reading SQL file: ${sqlFilePath}`);
  const sqlContent = fs.readFileSync(sqlFilePath, 'utf-8');
  
  // All tables that have data in SQL (excluding Laravel system tables)
  const tablesToCheck = [
    'admin_profile',
    'call_logs',
    'category_img_keywords',
    'category_keywords',
    'customer',
    'delivery_boy',
    'invoice',
    'item_keywords',
    'notifications',
    'order_rating',
    'orders',
    'packages',
    'per_pages',
    'product_category',
    'products',
    'shop_images',
    'shop_types',
    'shops',
    'store_category',
    'user_admins',
    'users',
  ];
  
  console.log(`\n🔍 Comparing ${tablesToCheck.length} tables...\n`);
  
  const summary = [];
  
  for (const tableName of tablesToCheck) {
    try {
      console.log(`\n📋 Processing table: ${tableName}`);
      
      // Parse SQL data
      const sqlItems = parseSQLInserts(sqlContent, tableName);
      console.log(`  📊 SQL file has: ${sqlItems.length} items`);
      
      if (sqlItems.length === 0) {
        console.log(`  ⚠️  No data found in SQL file for ${tableName}`);
        summary.push({
          table: tableName,
          sqlCount: 0,
          dynamoCount: 0,
          missing: 0,
          imported: 0
        });
        continue;
      }
      
      // Get DynamoDB items
      console.log(`  🔍 Checking DynamoDB...`);
      const dynamoItems = await getDynamoDBItems(tableName);
      console.log(`  📊 DynamoDB has: ${dynamoItems.length} items`);
      
      // Determine key field (usually 'id', but can be different)
      let keyField = 'id';
      if (tableName === 'orders') {
        keyField = 'order_no';
      } else if (tableName === 'customer') {
        keyField = 'id';
      }
      
      // Find missing items
      const missingItems = findMissingItems(sqlItems, dynamoItems, keyField);
      console.log(`  🔎 Missing items: ${missingItems.length}`);
      
      // Add timestamps if missing
      missingItems.forEach(item => {
        if (!item.created_at) {
          item.created_at = new Date().toISOString();
        }
        if (!item.updated_at) {
          item.updated_at = new Date().toISOString();
        }
        // Convert timestamp strings to ISO format if needed
        if (item.created_at && typeof item.created_at === 'string' && !item.created_at.includes('T')) {
          try {
            item.created_at = new Date(item.created_at).toISOString();
          } catch (e) {
            // Keep original if conversion fails
          }
        }
        if (item.updated_at && typeof item.updated_at === 'string' && !item.updated_at.includes('T')) {
          try {
            item.updated_at = new Date(item.updated_at).toISOString();
          } catch (e) {
            // Keep original if conversion fails
          }
        }
      });
      
      // Import missing items
      let imported = 0;
      if (missingItems.length > 0) {
        imported = await importMissingItems(tableName, missingItems, keyField);
        console.log(`  ✅ Imported ${imported} items`);
      } else {
        console.log(`  ✅ No missing items - table is up to date`);
      }
      
      summary.push({
        table: tableName,
        sqlCount: sqlItems.length,
        dynamoCount: dynamoItems.length,
        missing: missingItems.length,
        imported: imported
      });
      
    } catch (error) {
      console.error(`  ❌ Error processing ${tableName}:`, error.message);
      summary.push({
        table: tableName,
        sqlCount: 0,
        dynamoCount: 0,
        missing: 0,
        imported: 0,
        error: error.message
      });
    }
  }
  
  // Print summary
  console.log(`\n\n${'='.repeat(80)}`);
  console.log(`📊 SUMMARY`);
  console.log(`${'='.repeat(80)}`);
  console.log(`${'Table'.padEnd(25)} | ${'SQL'.padStart(8)} | ${'DynamoDB'.padStart(10)} | ${'Missing'.padStart(8)} | ${'Imported'.padStart(8)}`);
  console.log(`${'-'.repeat(25)}-+-${'-'.repeat(8)}-+-${'-'.repeat(10)}-+-${'-'.repeat(8)}-+-${'-'.repeat(8)}`);
  
  let totalSql = 0;
  let totalDynamo = 0;
  let totalMissing = 0;
  let totalImported = 0;
  
  summary.forEach(row => {
    const sql = row.sqlCount || 0;
    const dynamo = row.dynamoCount || 0;
    const missing = row.missing || 0;
    const imported = row.imported || 0;
    
    totalSql += sql;
    totalDynamo += dynamo;
    totalMissing += missing;
    totalImported += imported;
    
    const status = row.error ? '❌' : (missing === 0 ? '✅' : '⚠️');
    console.log(`${(row.table).padEnd(25)} | ${String(sql).padStart(8)} | ${String(dynamo).padStart(10)} | ${String(missing).padStart(8)} | ${String(imported).padStart(8)} ${status}`);
  });
  
  console.log(`${'-'.repeat(25)}-+-${'-'.repeat(8)}-+-${'-'.repeat(10)}-+-${'-'.repeat(8)}-+-${'-'.repeat(8)}`);
  console.log(`${'TOTAL'.padEnd(25)} | ${String(totalSql).padStart(8)} | ${String(totalDynamo).padStart(10)} | ${String(totalMissing).padStart(8)} | ${String(totalImported).padStart(8)}`);
  console.log(`${'='.repeat(80)}\n`);
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { parseSQLInserts, findMissingItems, importMissingItems };


