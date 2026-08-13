import { PrismaClient, Prisma } from '@prisma/client'
export {
  Users,
  Role,
  Keystore,
  Tokenstore,
  ContactSubmission,
  AuditionSubmission,
  Membership,
} from '@prisma/client'

import Logger from '../core/Logger';

export const prisma = new PrismaClient()
export const IPrisma = Prisma;

(async function db() {
  try {
    Logger.info('Connecting to postgresql');
    await prisma.$connect()
    Logger.info('postgresql connection done');
  } catch (error) {
    Logger.error('postgresql connection error');
    Logger.error(error);
    Logger.error('Shutdown Application')
    await prisma.$disconnect()
    process.exit(1)
  }
})()
