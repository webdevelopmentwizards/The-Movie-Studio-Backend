import { prisma, AuditionStatus } from '../../../database';

export type CreateAuditionInput = {
  firstName: string;
  lastName: string;
  email: string;
  videoUrl?: string | null;
  photoUrl?: string | null;
  status?: AuditionStatus;
  userId?: string | null;
};

export type UpdateAuditionInput = {
  videoUrl?: string | null;
  photoUrl?: string | null;
  status?: AuditionStatus;
  emailSent?: boolean;
  errorMessage?: string | null;
};

export default class AuditionRepo {
  public static async create(data: CreateAuditionInput) {
    return prisma.auditionSubmission.create({
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        videoUrl: data.videoUrl ?? null,
        photoUrl: data.photoUrl ?? null,
        status: data.status ?? AuditionStatus.PROCESSING,
        userId: data.userId ?? null,
      },
    });
  }

  public static async update(id: string, data: UpdateAuditionInput) {
    return prisma.auditionSubmission.update({
      where: { id },
      data,
    });
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
