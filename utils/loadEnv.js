const fs = require('fs');
const path = require('path');

/**
 * Load environment variables from aws.txt file
 * This file can contain any environment variables, not just AWS credentials
 */
function loadEnvFromFile() {
  // Try multiple possible paths for aws.txt
  const possiblePaths = [
    path.join(__dirname, '..', '..', 'aws.txt'), // From utils -> root
    path.join(process.cwd(), 'aws.txt'), // From current working directory
    path.join(process.cwd(), '..', 'aws.txt'), // One level up from cwd
  ];

  let envFilePath = null;
  for (const possiblePath of possiblePaths) {
    if (fs.existsSync(possiblePath)) {
      envFilePath = possiblePath;
      break;
    }
  }

  if (envFilePath) {
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
          } else {
            console.log(`   ⏭️  Skipped ${key} (already set)`);
          }
        }
      }
    });
    
    if (loadedCount > 0) {
      console.log(`✅ Loaded ${loadedCount} environment variable(s) from ${envFilePath}`);
    } else {
      console.log(`⚠️  No new environment variables loaded from ${envFilePath}`);
    }
  } else {
    console.log('⚠️  aws.txt not found. Using environment variables or .env file.');
  }
}

module.exports = { loadEnvFromFile };

