import { prisma, IPrisma } from '../../../database';
import type { UsersEntity } from './User';

export const DOCUMENT_NAME = IPrisma.ModelName.Keystore;
export const COLLECTION_NAME = 'keystores';

export default interface Keystore {
  id: UsersEntity["id"],
  client: UsersEntity;
  clientId: UsersEntity["id"];
  primaryKey: string;
  secondaryKey: string;
  status?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export const KeystoreModel = prisma.keystore;
