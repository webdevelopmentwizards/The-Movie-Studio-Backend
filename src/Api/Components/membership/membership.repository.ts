import { prisma } from '../../../database';
import { MembershipPlan, MembershipStatus } from '@prisma/client';

export type UpsertMembershipInput = {
  userId: string;
  planId: MembershipPlan;
  status?: MembershipStatus;
  startsAt?: Date;
  endsAt?: Date | null;
  transactionId?: string | null;
  subscriptionId?: string | null;
};

export default class MembershipRepo {
  public static async findActiveByUserId(userId: string) {
    return prisma.membership.findFirst({
      where: {
        userId,
        status: MembershipStatus.ACTIVE,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  public static async findLatestByUserId(userId: string) {
    return prisma.membership.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  public static async activate(data: UpsertMembershipInput) {
    const existing = await this.findActiveByUserId(data.userId);

    if (existing) {
      return prisma.membership.update({
        where: { id: existing.id },
        data: {
          planId: data.planId,
          status: data.status || MembershipStatus.ACTIVE,
          startsAt: data.startsAt || new Date(),
          endsAt: data.endsAt ?? null,
          transactionId: data.transactionId ?? existing.transactionId,
          subscriptionId: data.subscriptionId ?? existing.subscriptionId,
        },
      });
    }

    return prisma.membership.create({
      data: {
        userId: data.userId,
        planId: data.planId,
        status: data.status || MembershipStatus.ACTIVE,
        startsAt: data.startsAt || new Date(),
        endsAt: data.endsAt ?? null,
        transactionId: data.transactionId ?? null,
        subscriptionId: data.subscriptionId ?? null,
      },
    });
  }
}
