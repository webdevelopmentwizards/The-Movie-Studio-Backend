import { Router } from 'express';
import { ChatController } from './chat.controller';

export class ChatRoutes {
  readonly router: Router = Router();
  readonly controller: ChatController = new ChatController();

  constructor() {
    this.initRoutes();
  }

  initRoutes(): void {
    this.router.post('/', this.controller.chat);
  }
}
