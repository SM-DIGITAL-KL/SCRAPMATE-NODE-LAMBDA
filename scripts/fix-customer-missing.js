const fs = require('fs');
const path = require('path');
const { getDynamoDBClient } = require('../config/dynamodb');
const { PutCommand, BatchWriteCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');
const { loadEnvFromFile } = require('../utils/loadEnv');

loadEnvFromFile();

/**
 * Parse SQL INSERT statements for customer table
 */
function parseCustomerInserts(sqlContent) {
  const items = [];
  
  const insertRegex = /INSERT INTO `customer`[^;]+;/gi;
  const matches = sqlContent.match(insertRegex);
  
  if (!matches) {
    return items;
  }
  
  for (const match of matches) {
    // Extract column names
    const columns = [];
    const colMatch = match.match(/INSERT INTO `customer`\s*\(([^)]+)\)/i);
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
    // Parse each row - handle multiline values
    const rowRegex = /\(([^)]*(?:\([^)]*\)[^)]*)*)\)/g;
    let rowMatch;
    
    while ((rowMatch = rowRegex.exec(valuesString)) !== null) {
      const rowValues = parseSQLValues(rowMatch[1]);
      if (rowValues.length === columns.length) {
        const item = {};
        columns.forEach((col, index) => {
          let value = rowValues[index];
          
          // Convert numeric fields
          if (col === 'id' || col === 'user_id' || col === 'contact' || col === 'language' || col === 'del_status') {
            if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
              const numValue = parseInt(value.trim());
              if (!isNaN(numValue)) {
                value = numValue;
              }
            }
          }
          
          // Handle NULL
          if (value === 'NULL' || value === null || value === '') {
            value = null;
          }
          
          // Clean strings
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
 * Parse SQL values
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
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      return v.slice(1, -1);
    }
    return v;
  });
}

/**
 * Get all customers from DynamoDB
 */
async function getDynamoDBCustomers() {
  const client = getDynamoDBClient();
  const items = [];
  let lastKey = null;
  
  do {
    const params = {
      TableName: 'customer'
    };
    
    if (lastKey) {
      params.ExclusiveStartKey = lastKey;
    }
    
    const command = new ScanCommand(params);
    const response = await client.send(command);
    
    if (response.Items) {
      items.push(...response.Items);
    }
    
    lastKey = response.LastEvaluatedKey;
  } while (lastKey);
  
  return items;
}

/**
 * Find missing customers
 */
function findMissingCustomers(sqlItems, dynamoItems) {
  const dynamoIds = new Set();
  
  dynamoItems.forEach(item => {
    const id = item.id;
    if (id !== null && id !== undefined) {
      dynamoIds.add(String(id));
    }
  });
  
  const missingItems = sqlItems.filter(item => {
    const id = item.id;
    if (id === null || id === undefined) {
      return true;
    }
    return !dynamoIds.has(String(id));
  });
  
  return missingItems;
}

/**
 * Import missing customers
 */
async function importMissingCustomers(items) {
  if (items.length === 0) {
    return 0;
  }
  
  const client = getDynamoDBClient();
  const batchSize = 25;
  let imported = 0;
  
  console.log(`\n📦 Importing ${items.length} missing customers...`);
  
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
          'customer': writeRequests
        }
      });
      
      await client.send(command);
      imported += batch.length;
      console.log(`  ✅ Imported batch ${Math.floor(i / batchSize) + 1} (${batch.length} items)`);
    } catch (error) {
      console.error(`  ❌ Error importing batch ${Math.floor(i / batchSize) + 1}:`, error.message);
      
      // Try individual puts
      for (const item of batch) {
        try {
          const putCommand = new PutCommand({
            TableName: 'customer',
            Item: item
          });
          await client.send(putCommand);
          imported++;
          console.log(`    ✅ Imported customer ID: ${item.id}`);
        } catch (putError) {
          console.error(`    ❌ Failed to import customer ID ${item.id || 'unknown'}:`, putError.message);
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
  
  console.log(`\n📋 Parsing customer data from SQL...`);
  const sqlItems = parseCustomerInserts(sqlContent);
  console.log(`  📊 SQL file has: ${sqlItems.length} customers`);
  
  console.log(`\n🔍 Checking DynamoDB...`);
  const dynamoItems = await getDynamoDBCustomers();
  console.log(`  📊 DynamoDB has: ${dynamoItems.length} customers`);
  
  console.log(`\n🔎 Finding missing customers...`);
  const missingItems = findMissingCustomers(sqlItems, dynamoItems);
  console.log(`  📊 Missing customers: ${missingItems.length}`);
  
  if (missingItems.length === 0) {
    console.log(`\n✅ No missing customers - table is up to date!\n`);
    return;
  }
  
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
        // Keep original
      }
    }
    if (item.updated_at && typeof item.updated_at === 'string' && !item.updated_at.includes('T')) {
      try {
        item.updated_at = new Date(item.updated_at).toISOString();
      } catch (e) {
        // Keep original
      }
    }
  });
  
  // Show missing customer IDs
  console.log(`\n📋 Missing customer IDs:`);
  missingItems.forEach(item => {
    console.log(`  - ID: ${item.id}, Name: ${item.name || 'N/A'}, Contact: ${item.contact || 'N/A'}`);
  });
  
  // Import missing items
  const imported = await importMissingCustomers(missingItems);
  
  // Verify final count
  console.log(`\n🔍 Verifying final count...`);
  const finalItems = await getDynamoDBCustomers();
  console.log(`\n✅ Final count: ${finalItems.length} customers in DynamoDB`);
  console.log(`   SQL count: ${sqlItems.length} customers`);
  console.log(`   Imported: ${imported} customers`);
  console.log(`   Difference: ${sqlItems.length - finalItems.length}\n`);
}

if (require.main === module) {
  main().catch(error => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { parseCustomerInserts, findMissingCustomers, importMissingCustomers };


