import { Router } from 'express';
import { ContactController } from './contact.controller';

export class ContactRoutes {
  readonly router: Router = Router();
  readonly controller: ContactController = new ContactController();

  constructor() {
    this.initRoutes();
  }

  initRoutes(): void {
    this.router.post('/', this.controller.submit);
  }
}
