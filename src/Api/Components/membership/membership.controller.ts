import { Response } from 'express';
import { MembershipPlan } from '@prisma/client';
import asyncHandler from '../../../helpers/async';
import { BadRequestError, AuthFailureError } from '../../../core/ApiError';
import { SuccessResponse } from '../../../core/ApiResponse';
import MembershipRepo from './membership.repository';

function computeEndsAt(planId: MembershipPlan, from: Date = new Date()): Date {
  const ends = new Date(from);
  if (planId === MembershipPlan.monthly) {
    ends.setMonth(ends.getMonth() + 1);
  } else {
    ends.setFullYear(ends.getFullYear() + 1);
  }
  return ends;
}

export class MembershipController {
  me = asyncHandler(async (req: any, res: Response) => {
    if (!req.user?.id) throw new AuthFailureError('Authentication required');

    const membership = await MembershipRepo.findLatestByUserId(req.user.id);
    return new SuccessResponse('Membership retrieved', {
      membership: membership || null,
      isMember: Boolean(membership && membership.status === 'ACTIVE'),
    }).send(res);
  });

  activate = asyncHandler(async (req: any, res: Response) => {
    if (!req.user?.id) throw new AuthFailureError('Authentication required');

    const planIdRaw = String(req.body.planId || '').trim();
    if (planIdRaw !== 'monthly' && planIdRaw !== 'yearly') {
      throw new BadRequestError('Invalid membership plan.');
    }

    const planId = planIdRaw as MembershipPlan;
    const startsAt = new Date();
    const endsAt = computeEndsAt(planId, startsAt);

    const membership = await MembershipRepo.activate({
      userId: req.user.id,
      planId,
      startsAt,
      endsAt,
      transactionId: req.body.transactionId ? String(req.body.transactionId) : null,
      subscriptionId: req.body.subscriptionId ? String(req.body.subscriptionId) : null,
    });

    return new SuccessResponse('Membership activated', { membership }).send(res);
  });
}
