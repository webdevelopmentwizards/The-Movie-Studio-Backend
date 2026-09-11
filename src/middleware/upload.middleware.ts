import multer from 'multer';
import path from 'path';
import fs from 'fs';

const TEMP_DIR = path.join(process.cwd(), 'tmp', 'uploads');
fs.mkdirSync(TEMP_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, TEMP_DIR),
  filename: (_req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}-${safe}`);
  },
});

export const upload = multer({
  storage,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB
    files: 10,
  },
});

/** Audition fields: video + photo */
export const auditionUpload = upload.fields([
  { name: 'video', maxCount: 1 },
  { name: 'photo', maxCount: 1 },
]);

/** Any single image field */
export const singleImageUpload = upload.single('image');

/** Any single video field */
export const singleVideoUpload = upload.single('video');

/** Generic single file field (existing /upload API) */
export const singleFileUpload = upload.single('file');
