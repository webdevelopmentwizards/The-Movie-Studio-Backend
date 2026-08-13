import { prisma } from '../../../database';

export type CreateAuditionInput = {
  firstName: string;
  lastName: string;
  email: string;
  videoUrl: string;
  photoUrl: string;
  userId?: string | null;
};

export default class AuditionRepo {
  public static async create(data: CreateAuditionInput) {
    return prisma.auditionSubmission.create({ data });
  }

  public static async findById(id: string) {
    return prisma.auditionSubmission.findUnique({ where: { id } });
  }

  public static async findMany(limit = 50) {
    return prisma.auditionSubmission.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}
