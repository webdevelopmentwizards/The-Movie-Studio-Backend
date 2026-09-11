import { Router } from 'express';
import optionalAuthentication from '../../../middleware/optionalAuthentication';
import { auditionUpload } from '../../../middleware/upload.middleware';
import { AuditionController } from './audition.controller';

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
      auditionUpload,
      this.controller.submit,
    );
  }
}
