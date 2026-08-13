import { Router } from 'express';
import validator from '../../../validations/validator';
import authentication from '../../../middleware/authentication';
import { AppSigninValidationSchema, AppSignupValidationSchema } from './../../../validations/payloadSchema/AccessSchema';
import { AccessController } from './access.controller';

export class AccessRoutes {

  readonly router: Router = Router();
  readonly controller: AccessController = new AccessController()

  constructor() {
    this.initRoutes();
  }

  initRoutes(): void {
    this.router.post(
      '/login',
      validator(AppSigninValidationSchema),
      this.controller.login
    );

    this.router.post(
      '/signup',
      validator(AppSignupValidationSchema),
      this.controller.register
    );

    this.router.post(
      '/register',
      validator(AppSignupValidationSchema),
      this.controller.register
    );

    this.router.post(
      '/logout',
      authentication,
      this.controller.logout
    );

    this.router.get(
      '/me',
      authentication,
      this.controller.me
    );

    this.router.get('/google', this.controller.googleAuth);
    this.router.get('/google/callback', this.controller.googleCallback);
    this.router.get('/facebook', this.controller.facebookAuth);
    this.router.get('/facebook/callback', this.controller.facebookCallback);
  }
}
