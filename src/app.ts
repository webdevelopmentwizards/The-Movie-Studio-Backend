import { config } from 'dotenv'
config();
import { port, environment } from './config/globals'
import { Server } from './Api/server'
import Logger from './core/Logger';
import { prisma } from "./database"

(async function main(): Promise<void> {
  try {
    await prisma.$connect()

    process.on('uncaughtException', (e) => {
      Logger.error(e);
    });

    const app = new Server().app
    const server = app.listen(port)

    server.on('listening', () => {
      Logger.info(`node server is listening on port ${port} in ${environment} mode`)
    })
  } catch (err: any) {
    console.log(err);
    Logger.error(err.stack);
  }
})();
