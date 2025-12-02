const fs = require('fs');
const path = require('path');
const { getDynamoDBClient } = require('../config/dynamodb');
const { PutCommand, BatchWriteCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');
const { loadEnvFromFile } = require('../utils/loadEnv');

loadEnvFromFile();

/**
 * Parse all customer data from SQL with better parsing
 */
function parseAllCustomers(sqlContent) {
  const items = [];
  
  // Find all INSERT INTO statements
  const insertRegex = /INSERT INTO `customer`[^;]+;/gi;
  const matches = sqlContent.match(insertRegex);
  
  if (!matches) {
    return items;
  }
  
  for (const match of matches) {
    // Extract column names
    const colMatch = match.match(/INSERT INTO `customer`\s*\(([^)]+)\)/i);
    if (!colMatch) continue;
    
    const columns = [];
    const colString = colMatch[1];
    const colRegex = /`([^`]+)`/g;
    let colMatchResult;
    while ((colMatchResult = colRegex.exec(colString)) !== null) {
      columns.push(colMatchResult[1]);
    }
    
    // Extract values section
    const valuesMatch = match.match(/VALUES\s+(.+);/is);
    if (!valuesMatch) continue;
    
    const valuesString = valuesMatch[1];
    
    // More robust row parsing - handle nested parentheses
    let currentRow = '';
    let depth = 0;
    let inString = false;
    let stringChar = null;
    
    for (let i = 0; i < valuesString.length; i++) {
      const char = valuesString[i];
      
      if (!inString) {
        if (char === '"' || char === "'") {
          inString = true;
          stringChar = char;
          currentRow += char;
        } else if (char === '(') {
          depth++;
          if (depth === 1) {
            currentRow = '';
          } else {
            currentRow += char;
          }
        } else if (char === ')') {
          if (depth === 1) {
            // Complete row
            const rowValues = parseSQLValues(currentRow);
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
                
                if (value === 'NULL' || value === null || value === '') {
                  value = null;
                }
                
                if (typeof value === 'string' && value.trim() !== '') {
                  value = value.trim();
                }
                
                item[col] = value;
              });
              items.push(item);
            }
            currentRow = '';
          } else {
            currentRow += char;
          }
          depth--;
        } else if (char === ',' && depth === 0) {
          // Skip commas between rows
          continue;
        } else {
          currentRow += char;
        }
      } else {
        currentRow += char;
        if (char === stringChar && (i === 0 || valuesString[i - 1] !== '\\')) {
          inString = false;
        }
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
  
  console.log(`\n📋 Parsing ALL customer data from SQL...`);
  const sqlItems = parseAllCustomers(sqlContent);
  console.log(`  📊 SQL file has: ${sqlItems.length} customers`);
  
  // Get unique IDs
  const sqlIds = new Set(sqlItems.map(item => String(item.id)).filter(id => id && id !== 'null'));
  console.log(`  📊 Unique customer IDs in SQL: ${sqlIds.size}`);
  
  console.log(`\n🔍 Checking DynamoDB...`);
  const dynamoItems = await getDynamoDBCustomers();
  console.log(`  📊 DynamoDB has: ${dynamoItems.length} customers`);
  
  // Get DynamoDB IDs
  const dynamoIds = new Set(dynamoItems.map(item => String(item.id)).filter(id => id && id !== 'null'));
  console.log(`  📊 Unique customer IDs in DynamoDB: ${dynamoIds.size}`);
  
  // Find missing IDs
  const missingIds = [];
  sqlIds.forEach(id => {
    if (!dynamoIds.has(id)) {
      missingIds.push(id);
    }
  });
  
  console.log(`\n🔎 Missing customer IDs: ${missingIds.length}`);
  
  if (missingIds.length === 0) {
    console.log(`\n✅ No missing customers!\n`);
    return;
  }
  
  // Find missing items
  const missingItems = sqlItems.filter(item => {
    const id = String(item.id);
    return missingIds.includes(id);
  });
  
  console.log(`\n📋 Missing customer details:`);
  missingItems.forEach((item, index) => {
    console.log(`  ${index + 1}. ID: ${item.id}, Name: ${item.name || 'N/A'}, Contact: ${item.contact || 'N/A'}, User ID: ${item.user_id || 'N/A'}`);
  });
  
  // Add timestamps
  missingItems.forEach(item => {
    if (!item.created_at) {
      item.created_at = new Date().toISOString();
    }
    if (!item.updated_at) {
      item.updated_at = new Date().toISOString();
    }
    if (item.created_at && typeof item.created_at === 'string' && !item.created_at.includes('T')) {
      try {
        item.created_at = new Date(item.created_at).toISOString();
      } catch (e) {}
    }
    if (item.updated_at && typeof item.updated_at === 'string' && !item.updated_at.includes('T')) {
      try {
        item.updated_at = new Date(item.updated_at).toISOString();
      } catch (e) {}
    }
  });
  
  // Import missing items
  console.log(`\n📦 Importing ${missingItems.length} missing customers...`);
  const client = getDynamoDBClient();
  const batchSize = 25;
  let imported = 0;
  
  for (let i = 0; i < missingItems.length; i += batchSize) {
    const batch = missingItems.slice(i, i + batchSize);
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
  
  // Verify final count
  console.log(`\n🔍 Verifying final count...`);
  const finalItems = await getDynamoDBCustomers();
  const finalIds = new Set(finalItems.map(item => String(item.id)).filter(id => id && id !== 'null'));
  
  console.log(`\n✅ Final Results:`);
  console.log(`   SQL customers: ${sqlItems.length} (${sqlIds.size} unique IDs)`);
  console.log(`   DynamoDB customers: ${finalItems.length} (${finalIds.size} unique IDs)`);
  console.log(`   Imported: ${imported} customers`);
  console.log(`   Still missing: ${sqlIds.size - finalIds.size}\n`);
}

if (require.main === module) {
  main().catch(error => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { parseAllCustomers };


