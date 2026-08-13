import { Router } from 'express';
import authentication from '../../../middleware/authentication';
import { MembershipController } from './membership.controller';

export class MembershipRoutes {
  readonly router: Router = Router();
  readonly controller: MembershipController = new MembershipController();

  constructor() {
    this.initRoutes();
  }

  initRoutes(): void {
    this.router.get('/config', this.controller.config);
    this.router.get('/me', authentication, this.controller.me);
    this.router.post('/pay', authentication, this.controller.pay);
  }
}
