import { Router } from 'express';
import multer from 'multer';
import optionalAuthentication from '../../../middleware/optionalAuthentication';
import { AuditionController } from './audition.controller';

const upload = multer({
  storage: multer.memoryStorage(),
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
