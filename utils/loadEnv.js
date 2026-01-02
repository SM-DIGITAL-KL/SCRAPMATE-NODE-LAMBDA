const fs = require('fs');
const path = require('path');

/**
 * Load environment variables from aws.txt and env.txt files
 * This file can contain any environment variables, not just AWS credentials
 */
function loadEnvFromFile() {
  // Try multiple possible paths for aws.txt and env.txt
  const possiblePaths = [
    path.join(__dirname, '..', '..', 'aws.txt'), // From utils -> root
    path.join(process.cwd(), 'aws.txt'), // From current working directory
    path.join(process.cwd(), '..', 'aws.txt'), // One level up from cwd
    // Also check for env.txt in SCRAPMATE-ADMIN-PHP directory
    path.join(__dirname, '..', '..', 'SCRAPMATE-ADMIN-PHP', 'env.txt'),
    path.join(process.cwd(), '..', 'SCRAPMATE-ADMIN-PHP', 'env.txt'),
    path.join(process.cwd(), 'SCRAPMATE-ADMIN-PHP', 'env.txt'),
  ];

  // Find all existing files
  const filesToLoad = [];
  for (const possiblePath of possiblePaths) {
    if (fs.existsSync(possiblePath)) {
      // Avoid duplicates
      if (!filesToLoad.includes(possiblePath)) {
        filesToLoad.push(possiblePath);
      }
    }
  }
  
  // Load from all found files (aws.txt first, then env.txt)
  const sortedFiles = filesToLoad.sort((a, b) => {
    // Prioritize aws.txt files first
    if (a.includes('aws.txt') && !b.includes('aws.txt')) return -1;
    if (!a.includes('aws.txt') && b.includes('aws.txt')) return 1;
    return 0;
  });

  if (sortedFiles.length > 0) {
    let totalLoaded = 0;
    
    sortedFiles.forEach((envFilePath) => {
      console.log(`📁 Loading environment variables from: ${envFilePath}`);
      const content = fs.readFileSync(envFilePath, 'utf-8');
      const lines = content.split('\n');

      let loadedCount = 0;
      lines.forEach((line) => {
        line = line.trim();
        // Skip empty lines and comments
        if (!line || line.startsWith('#')) {
          return;
        }
        
        // Support both "export KEY=value" and "KEY=value" formats
        if (line.startsWith('export ')) {
          const parts = line.substring(7).split('=', 2);
          if (parts.length === 2) {
            let key = parts[0].trim();
            let value = parts[1].trim();
            // Remove quotes if present
            if (
              (value.startsWith('"') && value.endsWith('"')) ||
              (value.startsWith("'") && value.endsWith("'"))
            ) {
              value = value.slice(1, -1);
            }
            // Only set if not already set (don't override existing env vars)
            if (!process.env[key]) {
              process.env[key] = value;
              console.log(`   ✅ Loaded ${key}`);
              loadedCount++;
              
              // Also create 4SMS_* alias if SMS_* variable is loaded (for compatibility)
              if (key.startsWith('SMS_API_') && !key.startsWith('4SMS_API_')) {
                const aliasKey = key.replace('SMS_API_', '4SMS_API_');
                if (!process.env[aliasKey]) {
                  process.env[aliasKey] = value;
                  console.log(`   ✅ Created alias ${aliasKey} = ${key}`);
                }
              }
            } else {
              console.log(`   ⏭️  Skipped ${key} (already set)`);
            }
          }
        } else if (line.includes('=')) {
          // Support KEY=value format (without export)
          const parts = line.split('=', 2);
          if (parts.length === 2) {
            let key = parts[0].trim();
            let value = parts[1].trim();
            // Remove quotes if present
            if (
              (value.startsWith('"') && value.endsWith('"')) ||
              (value.startsWith("'") && value.endsWith("'"))
            ) {
              value = value.slice(1, -1);
            }
            // Only set if not already set
            if (!process.env[key]) {
              process.env[key] = value;
              console.log(`   ✅ Loaded ${key}`);
              loadedCount++;
              
              // Also create 4SMS_* alias if SMS_* variable is loaded (for compatibility)
              if (key.startsWith('SMS_API_') && !key.startsWith('4SMS_API_')) {
                const aliasKey = key.replace('SMS_API_', '4SMS_API_');
                if (!process.env[aliasKey]) {
                  process.env[aliasKey] = value;
                  console.log(`   ✅ Created alias ${aliasKey} = ${key}`);
                }
              }
            } else {
              console.log(`   ⏭️  Skipped ${key} (already set)`);
            }
          }
        }
      });
      
      if (loadedCount > 0) {
        console.log(`✅ Loaded ${loadedCount} environment variable(s) from ${path.basename(envFilePath)}`);
        totalLoaded += loadedCount;
      } else {
        console.log(`⚠️  No new environment variables loaded from ${path.basename(envFilePath)}`);
      }
    });
    
    if (totalLoaded > 0) {
      console.log(`✅ Total: Loaded ${totalLoaded} environment variable(s) from ${sortedFiles.length} file(s)`);
    }
  } else {
    console.log('⚠️  aws.txt or env.txt not found. Using environment variables or .env file.');
  }
}

module.exports = { loadEnvFromFile };
