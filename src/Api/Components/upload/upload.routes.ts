import { Router } from 'express';
import { FileController } from './file.controller';
import authentication from '../../../middleware/authentication';
import requireMembership from '../../../middleware/requireMembership';
import { singleFileUpload } from '../../../middleware/upload.middleware';

export class FileRoutes {
  readonly router: Router = Router();
  readonly controller: FileController = new FileController();

  constructor() {
    this.initRoutes();
  }

  initRoutes(): void {
    this.router.post(
      '/upload',
      authentication,
      requireMembership,
      singleFileUpload,
      this.controller.upload,
    );

    this.router.post(
      '/delete',
      authentication,
      requireMembership,
      this.controller.delete,
    );

    this.router.put(
      '/update',
      authentication,
      requireMembership,
      singleFileUpload,
      this.controller.update,
    );
  }
}
