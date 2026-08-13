import { Router } from 'express';
import { apiVersion } from '../config/globals';

import { registerApiRoutes } from './Components';
import registerErrorHandler from "../middleware/ErrorHandler"
import registerMiddleware from '../middleware/Register';
import Logger from '../core/Logger';

/**
 * Init Express REST routes
 *
 * @param {Router} router
 * @returns {void}
 */

export function initRestRoutes(router: Router): void {
   const prefix = `/api/${apiVersion}`;
  Logger.info(`Initializing REST routes on ${prefix}`);
  registerMiddleware(router);
  registerApiRoutes(router, prefix);
  registerErrorHandler(router);
}
