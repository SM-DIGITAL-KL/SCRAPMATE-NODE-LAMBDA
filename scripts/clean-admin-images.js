const fs = require('fs');
const path = require('path');

const ADMIN_PANEL_DIR = path.join(__dirname, '..', 'admin-panel');
const PUBLIC_DIR = path.join(ADMIN_PANEL_DIR, 'public');
const ASSETS_DIR = path.join(PUBLIC_DIR, 'assets');
const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.webp', '.bmp', '.jfif', '.avif'];

function walk(dir, options = {}) {
  let results = [];
  let list;
  try {
    list = fs.readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    if (options.ignoreErrors) {
      return results;
    }
    throw err;
  }
  for (const entry of list) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // Allow caller to skip certain directories
      if (options.skipDirs && options.skipDirs.some(skip => fullPath.includes(skip))) {
        continue;
      }
      results = results.concat(walk(fullPath, options));
    } else {
      results.push(fullPath);
    }
  }
  return results;
}

function getAllAssetFiles() {
  if (!fs.existsSync(ASSETS_DIR)) {
    console.error(`❌ Assets directory not found: ${ASSETS_DIR}`);
    process.exit(1);
  }
  return walk(ASSETS_DIR).filter(file => IMAGE_EXTENSIONS.includes(path.extname(file).toLowerCase()));
}

function normalizeReference(ref) {
  if (!ref) return null;
  ref = ref.replace(/\\+/g, '/');
  if (ref.startsWith('../')) {
    ref = ref.replace(/^(\.\.\/)+/, '');
  }
  if (!ref.startsWith('assets/')) {
    // Some references might omit 'assets/' (rare). Skip those.
    if (ref.startsWith('images/')) {
      ref = `assets/${ref}`;
    } else {
      return null;
    }
  }
  ref = ref.split(/[?#]/)[0];
  return ref;
}

function collectReferences() {
  const referenced = new Set();
  const codeFiles = walk(ADMIN_PANEL_DIR, {
    ignoreErrors: true,
    skipDirs: [
      path.join(ADMIN_PANEL_DIR, 'vendor'),
      path.join(ADMIN_PANEL_DIR, 'storage'),
      path.join(ADMIN_PANEL_DIR, 'bootstrap/cache')
    ]
  }).filter(file => /\.(php|blade\.php|js|css|html)$/.test(file));
  const regexes = [
    /assets\/[A-Za-z0-9_\-\/\.]+\.(png|jpg|jpeg|gif|svg|ico|webp|bmp|jfif|avif)/gi,
    /\.\.\/images\/[A-Za-z0-9_\-\/\.]+\.(png|jpg|jpeg|gif|svg|ico|webp|bmp|jfif|avif)/gi
  ];

  for (const file of codeFiles) {
    const content = fs.readFileSync(file, 'utf8');
    for (const regex of regexes) {
      let match;
      while ((match = regex.exec(content)) !== null) {
        const ref = normalizeReference(match[0]);
        if (ref) {
          referenced.add(ref);
        }
      }
    }
  }

  return referenced;
}

function cleanImages(dryRun = true) {
  console.log(`📁 Scanning admin-panel assets in ${ASSETS_DIR}`);
  const allImages = getAllAssetFiles();
  console.log(`   Found ${allImages.length} image files`);

  const referenced = collectReferences();
  console.log(`   Referenced images found in code: ${referenced.size}`);

  let deleted = 0;
  let failed = 0;

  for (const filePath of allImages) {
    const relPath = path.relative(PUBLIC_DIR, filePath).replace(/\\+/g, '/');
    if (!referenced.has(relPath)) {
      if (dryRun) {
        console.log(`   🚫 Would delete: ${relPath}`);
      } else {
        try {
          fs.unlinkSync(filePath);
          deleted++;
          console.log(`   🗑️  Deleted: ${relPath}`);
        } catch (err) {
          failed++;
          console.error(`   ❌ Failed to delete ${relPath}: ${err.message}`);
        }
      }
    }
  }

  if (dryRun) {
    console.log('\n🔍 Dry run complete. No files were deleted.');
    console.log('   Run with "delete" argument to actually delete unused images.');
  } else {
    console.log('\n📊 Deletion summary:');
    console.log(`   🗑️  Deleted: ${deleted}`);
    console.log(`   ❌ Failed: ${failed}`);
  }
}

if (require.main === module) {
  const dryRun = process.argv[2] !== 'delete';
  if (!dryRun) {
    console.log('⚠️  WARNING: This will permanently delete unused images from admin-panel/public/assets.');
    console.log('   Make sure this is desired before proceeding.\n');
  }
  cleanImages(dryRun);
}

module.exports = { cleanImages };

