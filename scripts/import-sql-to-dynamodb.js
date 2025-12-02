const fs = require('fs');
const path = require('path');
const { getDynamoDBClient } = require('../config/dynamodb');
const { PutCommand, BatchWriteCommand } = require('@aws-sdk/lib-dynamodb');
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
    // Extract column names
    const columnMatch = match.match(/INSERT INTO `[^`]+` \(`([^`]+)`(?:, `([^`]+)`)*\)/i);
    if (!columnMatch) continue;
    
    const columns = [];
    let colMatch;
    const colRegex = /`([^`]+)`/g;
    while ((colMatch = colRegex.exec(match)) !== null) {
      if (colMatch[1] !== tableName) {
        columns.push(colMatch[1]);
      }
    }
    
    // Extract values
    const valuesMatch = match.match(/VALUES\s+(.+);/is);
    if (!valuesMatch) continue;
    
    const valuesString = valuesMatch[1];
    // Parse each row
    const rowRegex = /\(([^)]+)\)/g;
    let rowMatch;
    
    while ((rowMatch = rowRegex.exec(valuesString)) !== null) {
      const rowValues = parseSQLValues(rowMatch[1]);
      if (rowValues.length === columns.length) {
        const item = {};
        columns.forEach((col, index) => {
          let value = rowValues[index];
          // Convert numeric strings to numbers
          if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
            const numValue = parseInt(value.trim());
            if (!isNaN(numValue)) {
              value = numValue;
            }
          }
          // Convert 'NULL' to null
          if (value === 'NULL' || value === null) {
            value = null;
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
      if (char === stringChar && valueString[i - 1] !== '\\') {
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
 * Import data to DynamoDB table
 */
async function importToDynamoDB(tableName, items) {
  const client = getDynamoDBClient();
  const batchSize = 25; // DynamoDB batch write limit
  
  console.log(`\n📦 Importing ${items.length} items to table: ${tableName}`);
  
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
      console.log(`  ✅ Imported batch ${Math.floor(i / batchSize) + 1} (${batch.length} items)`);
    } catch (error) {
      console.error(`  ❌ Error importing batch ${Math.floor(i / batchSize) + 1}:`, error.message);
      
      // Try individual puts if batch fails
      for (const item of batch) {
        try {
          const putCommand = new PutCommand({
            TableName: tableName,
            Item: item
          });
          await client.send(putCommand);
        } catch (putError) {
          console.error(`    ❌ Failed to import item with id ${item.id || 'unknown'}:`, putError.message);
        }
      }
    }
  }
  
  console.log(`✅ Completed importing to ${tableName}`);
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
  
  // Tables to import (excluding Laravel system tables)
  const tablesToImport = [
    'category_keywords',
    'item_keywords',
    'shop_types',
    'store_category',
    'admin_profile', // Update if needed
    'category_img_keywords', // Update if needed
    'call_logs', // Update if needed
  ];
  
  console.log(`\n🔍 Processing ${tablesToImport.length} tables...\n`);
  
  for (const tableName of tablesToImport) {
    try {
      console.log(`\n📋 Processing table: ${tableName}`);
      const items = parseSQLInserts(sqlContent, tableName);
      
      if (items.length === 0) {
        console.log(`  ⚠️  No data found for ${tableName}`);
        continue;
      }
      
      console.log(`  📊 Found ${items.length} items`);
      
      // Add timestamps if missing
      items.forEach(item => {
        if (!item.created_at) {
          item.created_at = new Date().toISOString();
        }
        if (!item.updated_at) {
          item.updated_at = new Date().toISOString();
        }
        // Convert timestamp strings to ISO format if needed
        if (item.created_at && typeof item.created_at === 'string' && !item.created_at.includes('T')) {
          item.created_at = new Date(item.created_at).toISOString();
        }
        if (item.updated_at && typeof item.updated_at === 'string' && !item.updated_at.includes('T')) {
          item.updated_at = new Date(item.updated_at).toISOString();
        }
      });
      
      await importToDynamoDB(tableName, items);
    } catch (error) {
      console.error(`❌ Error processing ${tableName}:`, error.message);
      console.error(error.stack);
    }
  }
  
  console.log(`\n✅ Import completed!\n`);
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { parseSQLInserts, importToDynamoDB };

