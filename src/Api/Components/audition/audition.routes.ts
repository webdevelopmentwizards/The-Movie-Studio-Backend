import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import optionalAuthentication from '../../../middleware/optionalAuthentication';
import { AuditionController } from './audition.controller';

const uploadDir = path.join(process.cwd(), 'temp_uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${file.fieldname}-${Date.now()}-${randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 100 * 1024 * 1024,
    files: 2,
  },
});

export class AuditionRoutes {
  readonly router: Router = Router();
  readonly controller: AuditionController = new AuditionController();

  constructor() {
    this.initRoutes();
  }

  initRoutes(): void {
    this.router.post(
      '/submit',
      optionalAuthentication,
      upload.fields([
        { name: 'video', maxCount: 1 },
        { name: 'photo', maxCount: 1 },
      ]),
      this.controller.submit,
    );
  }
}
