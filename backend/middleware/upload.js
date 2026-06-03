import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Emulating __dirname in ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Ensure absolute uploads directory exists safely
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Memory and size constraint configuration
const uploadLimits = {
  fileSize: 50 * 1024 * 1024, // 50MB Limit
  files: 1, // Only 1 file per request
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});

const upload = multer({
  storage: storage,
  limits: uploadLimits,
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    // Allow zip files and extensionless binaries
    if (ext === '.zip' || ext === '') {
      cb(null, true);
    } else {
      cb(new Error('Only ZIP archives or pre-compiled Linux binaries are supported.'), false);
    }
  }
});

export default upload;