import { prisma } from '../../../database';

export type CreateContactInput = {
  name: string;
  email: string;
  subject: string;
  subjectLabel: string;
  message: string;
  ipAddress?: string | null;
};

export default class ContactRepo {
  public static async create(data: CreateContactInput) {
    return prisma.contactSubmission.create({ data });
  }
}
