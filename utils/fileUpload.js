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
  const allowedTypes = /jpeg|jpg|png|gif/;
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

// PDF file filter for documents
const pdfFileFilter = (req, file, cb) => {
  const allowedTypes = /pdf/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = file.mimetype === 'application/pdf';
  
  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(new Error('Only PDF files are allowed!'));
  }
};

// Document upload (PDF only) for Aadhar and Driving License
const documentUpload = multer({
  storage: createMemoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit for PDFs
  fileFilter: pdfFileFilter
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
  try {
    if (!file || !file.buffer) {
      throw new Error('Invalid file object');
    }
    
    const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname);
    const result = await uploadBufferToS3(file.buffer, uniqueName, folder);
    return result;
  } catch (err) {
    console.error('Error uploading file to S3:', err);
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
