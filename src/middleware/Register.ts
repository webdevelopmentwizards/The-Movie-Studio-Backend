import express, { Router } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';

const registerMiddleware = (router: Router): void => {
  router.use(
    cors({
      origin: true,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-Requested-With',
        'X-Timezone',
        'Accept',
        'Origin',
        'Access-Control-Request-Method',
        'Access-Control-Request-Headers',
      ],
      exposedHeaders: ['Authorization'],
      optionsSuccessStatus: 200,
      preflightContinue: false,
    })
  );

  router.use(helmet());
  // Skip gzip for NDJSON audition progress streams so chunks flush live
  router.use(
    compression({
      filter: (req, res) => {
        const accept = String(req.headers.accept || '');
        if (accept.includes('application/x-ndjson')) return false;
        if (req.path.includes('/audition/submit')) return false;
        return compression.filter(req, res);
      },
    }),
  );

  // JSON only — multipart files go through multer disk stream, not json parser
  router.use(express.json({ limit: '2mb' }));
  router.use(express.urlencoded({ limit: '2mb', extended: true }));

  router.use(cookieParser());
};

export default registerMiddleware;
