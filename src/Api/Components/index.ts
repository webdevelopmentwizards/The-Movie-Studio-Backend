import { Router, Request, Response, NextFunction } from 'express';
import { NotFoundError } from '../../core/ApiError';
import { AccessRoutes } from './access/access.routes';
import { FileRoutes } from './upload/upload.routes';
import { ContactRoutes } from './contact/contact.routes';
import { AuditionRoutes } from './audition/audition.routes';
import { MembershipRoutes } from './membership/membership.routes';
import { ChatRoutes } from './chat/chat.routes';

export const registerApiRoutes = (
  router: Router,
  prefix = '',
): void => {
  router.get(prefix, (_req: Request, res: Response) =>
    res.send('The Movie Studio Backend Running'),
  );
  router.use(`${prefix}/auth`, new AccessRoutes().router);
  router.use(`${prefix}/file`, new FileRoutes().router);
  router.use(`${prefix}/contact`, new ContactRoutes().router);
  router.use(`${prefix}/audition`, new AuditionRoutes().router);
  router.use(`${prefix}/membership`, new MembershipRoutes().router);
  router.use(`${prefix}/chat`, new ChatRoutes().router);

  router.use((req: Request, res: Response, next: NextFunction) => next(new NotFoundError()));
};
