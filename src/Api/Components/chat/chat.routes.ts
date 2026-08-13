import { Router } from 'express';
import authentication from '../../../middleware/authentication';
import requireMembership from '../../../middleware/requireMembership';
import { ChatController } from './chat.controller';

export class ChatRoutes {
  readonly router: Router = Router();
  readonly controller: ChatController = new ChatController();

  constructor() {
    this.initRoutes();
  }

  initRoutes(): void {
    this.router.post('/', authentication, requireMembership, this.controller.chat);
  }
}
