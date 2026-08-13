require('dotenv').config()

export const environment = process.env.NODE_ENV as string
export const port = Number(process.env.PORT)
export const APP_NAME = process.env.APP_NAME as string

export const env = {
  NODE_ENV: process.env.NODE_ENV as string,
  API_VERSION: 'v1',
  LOG_DIRECTORY: process.env.LOGDIRECTORY as string,
}

export const apiVersion = env.API_VERSION

export const tokenInfo = {
  accessTokenValidityDays: Number(process.env.ACCESS_TOKEN_VALIDITY_DAYS),
  refreshTokenValidityDays: Number(process.env.REFRESH_TOKEN_VALIDITY_DAYS),
  issuer: process.env.TOKEN_ISSUER as string,
  audience: process.env.TOKEN_AUDIENCE as string,
}

export const SMTP = {
  host: process.env.SMTP_HOST as string,
  port: Number(process.env.SMTP_PORT),
  secure: process.env.SMTP_SECURE === 'true',
  user: process.env.SMTP_USER as string,
  pass: process.env.SMTP_PASS as string,
  fromName: process.env.SMTP_FROM_NAME as string,
  fromEmail: process.env.SMTP_FROM_EMAIL as string,
  contactToEmail: process.env.CONTACT_TO_EMAIL as string,
  sendAutoReply: process.env.CONTACT_SEND_AUTO_REPLY !== 'false',
}

export const MINIO = {
  endPoint: process.env.MINIO_ENDPOINT as string,
  port: Number(process.env.MINIO_PORT),
  useSSL: process.env.MINIO_USE_SSL === 'true',
  accessKey: process.env.MINIO_ACCESS_KEY as string,
  secretKey: process.env.MINIO_SECRET_KEY as string,
  bucket: process.env.MINIO_BUCKET as string,
  publicBaseUrl: process.env.MINIO_PUBLIC_BASE_URL as string,
}

export const AUTHORIZENET = {
  apiLoginId: process.env.AUTHORIZENET_API_LOGIN_ID as string,
  transactionKey: process.env.AUTHORIZENET_TRANSACTION_KEY as string,
  clientKey: process.env.AUTHORIZENET_CLIENT_KEY as string,
  env: process.env.AUTHORIZENET_ENV as string,
}

export const MEMBERSHIP = {
  monthlyAmount: Number(process.env.MEMBERSHIP_MONTHLY_AMOUNT),
  yearlyAmount: Number(process.env.MEMBERSHIP_YEARLY_AMOUNT),
}
