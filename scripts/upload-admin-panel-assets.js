const fs = require('fs');
const path = require('path');
const { uploadToS3 } = require('../utils/s3Upload');

const ADMIN_ASSETS_DIR = path.join(__dirname, '..', 'admin-panel', 'public', 'assets');
const S3_PREFIX = 'admin-panel/assets';

function getAllFiles(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat && stat.isDirectory()) {
      results = results.concat(getAllFiles(filePath));
    } else {
      results.push(filePath);
    }
  });
  return results;
}

async function uploadAdminAssets() {
  if (!fs.existsSync(ADMIN_ASSETS_DIR)) {
    console.error(`❌ Admin panel assets directory not found: ${ADMIN_ASSETS_DIR}`);
    process.exit(1);
  }

  console.log(`📁 Uploading admin-panel assets from ${ADMIN_ASSETS_DIR}`);
  const files = getAllFiles(ADMIN_ASSETS_DIR);
  console.log(`   Found ${files.length} files to upload\n`);

  let uploaded = 0;
  let failed = 0;

  for (const filePath of files) {
    const relativePath = path.relative(ADMIN_ASSETS_DIR, filePath).replace(/\\/g, '/');
    const s3Key = `${S3_PREFIX}/${relativePath}`;
    try {
      await uploadToS3(filePath, s3Key);
      uploaded++;
      if (uploaded % 50 === 0) {
        console.log(`   ✅ Uploaded ${uploaded}/${files.length} files...`);
      }
    } catch (err) {
      failed++;
      console.error(`   ❌ Failed to upload ${relativePath}: ${err.message}`);
    }
  }

  console.log('\n📊 Upload summary:');
  console.log(`   ✅ Uploaded: ${uploaded}`);
  console.log(`   ❌ Failed: ${failed}`);

  if (failed > 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  uploadAdminAssets()
    .then(() => {
      console.log('\n✅ Admin-panel assets uploaded to S3 successfully!');
      process.exit(0);
    })
    .catch(err => {
      console.error('❌ Upload failed:', err);
      process.exit(1);
    });
}

module.exports = { uploadAdminAssets };

