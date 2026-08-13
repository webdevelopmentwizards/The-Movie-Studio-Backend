import { prisma, IPrisma, Users } from './../../../database';

export const DOCUMENT_NAME = IPrisma.ModelName.Users;
export const COLLECTION_NAME = 'users';

export type UsersEntity = Users;

export const UsersModel = prisma.users;
