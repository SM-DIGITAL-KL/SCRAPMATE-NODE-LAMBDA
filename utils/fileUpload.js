const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { uploadBufferToS3 } = require('./s3Upload');

// Ensure upload directories exist (for fallback/local storage)
const ensureDir = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

// Configure multer storage - using memory storage for S3 upload
const createMemoryStorage = () => {
  return multer.memoryStorage();
};

// Configure multer storage with dynamic path (fallback for local storage)
const createStorage = (uploadPath) => {
  return multer.diskStorage({
    destination: (req, file, cb) => {
      ensureDir(uploadPath);
      cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
      const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname);
      cb(null, uniqueName);
    }
  });
};

// Default storage
const storage = createStorage(path.join(__dirname, '../public/uploads'));

// File filter
const fileFilter = (req, file, cb) => {
  // If file is not provided or is empty, allow it (optional file upload)
  if (!file || !file.originalname) {
    return cb(null, true);
  }
  
  const allowedTypes = /jpeg|jpg|png|gif|webp/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);
  
  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(new Error('Only image files are allowed!'));
  }
};

// Multer instance
const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: fileFilter
});

// Create upload instances using memory storage for S3 upload
const profileUpload = multer({
  storage: createMemoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: fileFilter
});

const shopImageUpload = multer({
  storage: createMemoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: fileFilter
});

const deliveryBoyUpload = multer({
  storage: createMemoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: fileFilter
});

const categoryImageUpload = multer({
  storage: createMemoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: fileFilter
});

// Order images upload (multiple files)
const orderImageUpload = multer({
  storage: createMemoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: fileFilter
});

// Document file filter - allows any file type (images, PDFs, etc.)
const documentFileFilter = (req, file, cb) => {
  // If file is not provided or is empty, allow it (optional file upload)
  if (!file || !file.originalname) {
    return cb(null, true);
  }
  
  // Allow any file type - images, PDFs, documents, etc.
  // Only check file size (handled by limits)
  return cb(null, true);
};

// Document upload (any file type) for Aadhar and Driving License
const documentUpload = multer({
  storage: createMemoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: documentFileFilter
});

// Helper function to get file size
const getFileSize = (filePath) => {
  try {
    const stats = fs.statSync(filePath);
    const fileSizeInMB = (stats.size / (1024 * 1024)).toFixed(2);
    return fileSizeInMB + ' MB';
  } catch (err) {
    return '0 MB';
  }
};

// Helper function to delete file (local)
const deleteFile = (filePath) => {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
    return false;
  } catch (err) {
    console.error('Error deleting file:', err);
    return false;
  }
};

// Helper function to upload file buffer to S3
async function uploadFileToS3(file, folder = 'images') {
  console.log(`\n📤 [FILE UPLOAD HELPER] Starting file upload process...`);
  console.log(`   Folder: ${folder}`);
  
  try {
    if (!file) {
      console.error(`   ❌ File object is null/undefined`);
      throw new Error('File object is required');
    }
    
    console.log(`   ✅ File object exists`);
    console.log(`   Original name: ${file.originalname || 'N/A'}`);
    console.log(`   MIME type: ${file.mimetype || 'N/A'}`);
    console.log(`   File size: ${file.size || 'N/A'} bytes`);
    
    if (!file.buffer || !Buffer.isBuffer(file.buffer)) {
      console.error(`   ❌ Invalid buffer`);
      console.error(`   Has buffer: ${!!file.buffer}`);
      console.error(`   Buffer type: ${file.buffer ? file.buffer.constructor.name : 'none'}`);
      throw new Error('File buffer is required and must be a Buffer');
    }
    
    console.log(`   ✅ Buffer is valid`);
    console.log(`   Buffer size: ${file.buffer.length} bytes (${(file.buffer.length / 1024 / 1024).toFixed(2)} MB)`);
    console.log(`   Buffer type: ${file.buffer.constructor.name}`);
    
    if (!file.originalname) {
      console.error(`   ❌ Original name is missing`);
      throw new Error('File originalname is required');
    }
    
    console.log(`   ✅ Original name exists: ${file.originalname}`);
    
    // Validate minimum file size - reject suspiciously small files (likely corrupted/placeholder)
    const MIN_FILE_SIZE = 100; // Minimum 100 bytes (1x1 pixel PNGs are ~70 bytes)
    if (file.buffer.length < MIN_FILE_SIZE) {
      console.error(`   ❌ File size is too small (suspicious/corrupted)`);
      console.error(`   File size: ${file.buffer.length} bytes`);
      console.error(`   Minimum required: ${MIN_FILE_SIZE} bytes`);
      console.error(`   This might be a placeholder or corrupted image (1x1 pixel images are ~70 bytes)`);
      throw new Error(`File size is too small (${file.buffer.length} bytes). Minimum required: ${MIN_FILE_SIZE} bytes. File might be corrupted or a placeholder.`);
    }
    
    // Validate maximum file size (should already be validated by multer, but double-check)
    if (file.size && file.size > 10 * 1024 * 1024) {
      console.error(`   ❌ File size exceeds limit`);
      console.error(`   File size: ${file.size} bytes (${(file.size / 1024 / 1024).toFixed(2)} MB)`);
      console.error(`   Max size: 10 MB`);
      throw new Error('File size exceeds 10MB limit');
    }
    
    // Validate image file header (PNG, JPEG, GIF, WebP)
    const imageHeaders = {
      png: [0x89, 0x50, 0x4E, 0x47], // PNG: 89 50 4E 47
      jpeg: [0xFF, 0xD8, 0xFF], // JPEG: FF D8 FF
      gif: [0x47, 0x49, 0x46], // GIF: 47 49 46
      webp: [0x52, 0x49, 0x46, 0x46] // WebP: 52 49 46 46 (RIFF)
    };
    
    const bufferStart = file.buffer.slice(0, 4);
    let isValidImage = false;
    let detectedFormat = null;
    
    for (const [format, header] of Object.entries(imageHeaders)) {
      let matches = true;
      for (let i = 0; i < header.length; i++) {
        if (bufferStart[i] !== header[i]) {
          matches = false;
          break;
        }
      }
      if (matches) {
        isValidImage = true;
        detectedFormat = format.toUpperCase();
        break;
      }
    }
    
    if (!isValidImage) {
      console.error(`   ❌ File does not appear to be a valid image`);
      console.error(`   First bytes (hex): ${Array.from(bufferStart).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' ')}`);
      console.error(`   Expected: PNG (89 50 4E 47), JPEG (FF D8 FF), GIF (47 49 46), or WebP (52 49 46 46)`);
      throw new Error('File does not appear to be a valid image file (PNG, JPEG, GIF, or WebP). File might be corrupted.');
    }
    
    console.log(`   ✅ Image format validated: ${detectedFormat}`);
    console.log(`   ✅ File size validation passed (${file.buffer.length} bytes, min: ${MIN_FILE_SIZE} bytes, max: 10MB)`);
    
    const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname);
    console.log(`   Generated unique filename: ${uniqueName}`);
    console.log(`   Calling uploadBufferToS3...`);
    
    const result = await uploadBufferToS3(file.buffer, uniqueName, folder);
    
    console.log(`\n✅ [FILE UPLOAD HELPER] Upload completed successfully`);
    console.log(`   Result:`, {
      s3Key: result.s3Key,
      s3Url: result.s3Url?.substring(0, 100) + '...',
      filename: result.filename
    });
    
    return result;
  } catch (err) {
    console.error(`\n❌ [FILE UPLOAD HELPER] Error occurred`);
    console.error(`   Error message: ${err.message}`);
    console.error(`   Error name: ${err.name}`);
    console.error(`   File object:`, file ? {
      hasBuffer: !!file.buffer,
      bufferType: file.buffer ? file.buffer.constructor.name : 'none',
      originalname: file.originalname || 'none',
      mimetype: file.mimetype || 'none',
      size: file.size || 'none',
      bufferLength: file.buffer ? file.buffer.length : 0
    } : 'file is null/undefined');
    throw err;
  }
}

module.exports = {
  upload,
  profileUpload,
  shopImageUpload,
  deliveryBoyUpload,
  categoryImageUpload,
  orderImageUpload,
  documentUpload,
  getFileSize,
  deleteFile,
  ensureDir,
  uploadFileToS3
};
