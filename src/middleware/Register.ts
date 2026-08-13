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
  router.use(compression());

  router.use(express.json());
  router.use(express.urlencoded({ limit: "100mb", extended: true }));

  router.use(cookieParser());
};

export default registerMiddleware;
