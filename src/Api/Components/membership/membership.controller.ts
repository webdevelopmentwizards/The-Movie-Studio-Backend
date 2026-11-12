import { Response } from 'express';
import { MembershipPlan } from '@prisma/client';
import asyncHandler from '../../../helpers/async';
import { BadRequestError, AuthFailureError } from '../../../core/ApiError';
import { SuccessResponse } from '../../../core/ApiResponse';
import { getPlanAccess } from './membership.access';
import MembershipRepo from './membership.repository';
import { AUTHORIZENET, MEMBERSHIP, SMTP } from '../../../config/globals';
import { chargeOpaqueData } from '../../../services/authorizeNet';
import { verifyApplePurchasePayload } from '../../../services/appleIap';
import {
  isMailConfigured,
  sendPaymentStudioEmail,
  sendPaymentUserEmail,
} from '../../../services/mailService';
import Logger from '../../../core/Logger';

const PLAN_LABEL: Record<MembershipPlan, string> = {
  monthly: 'Monthly',
  yearly: 'Yearly',
};

const APPLE_PRODUCT_IDS: Record<MembershipPlan, string> = {
  monthly:
    process.env.APPLE_IAP_MONTHLY_PRODUCT_ID ||
    'com.themoviestudio.app.membership.monthly',
  yearly:
    process.env.APPLE_IAP_YEARLY_PRODUCT_ID ||
    'com.themoviestudio.app.membership.yearly',
};

function planIdFromAppleProductId(productId: string): MembershipPlan | null {
  if (productId === APPLE_PRODUCT_IDS.monthly) return MembershipPlan.monthly;
  if (productId === APPLE_PRODUCT_IDS.yearly) return MembershipPlan.yearly;
  return null;
}

function planAmount(planId: MembershipPlan): number {
  return planId === MembershipPlan.monthly ? MEMBERSHIP.monthlyAmount : MEMBERSHIP.yearlyAmount;
}

function formatAmount(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

function computeEndsAt(planId: MembershipPlan, from: Date = new Date()): Date {
  const ends = new Date(from);
  if (planId === MembershipPlan.monthly) {
    ends.setMonth(ends.getMonth() + 1);
  } else {
    ends.setFullYear(ends.getFullYear() + 1);
  }
  return ends;
}

function parsePlanId(raw: unknown): MembershipPlan {
  const planId = String(raw || '').trim();
  if (planId !== 'monthly' && planId !== 'yearly') {
    throw new BadRequestError('Invalid membership plan.');
  }
  return planId as MembershipPlan;
}

export class MembershipController {
  config = asyncHandler(async (_req: any, res: Response) => {
    return new SuccessResponse('Payment config', {
      env: AUTHORIZENET.env,
      apiLoginId: AUTHORIZENET.apiLoginId,
      clientKey: AUTHORIZENET.clientKey,
      acceptJsUrl:
        String(AUTHORIZENET.env).toLowerCase() === 'production'
          ? 'https://js.authorize.net/v1/Accept.js'
          : 'https://jstest.authorize.net/v1/Accept.js',
      plans: {
        monthly: { id: 'monthly', label: PLAN_LABEL.monthly, amount: MEMBERSHIP.monthlyAmount },
        yearly: { id: 'yearly', label: PLAN_LABEL.yearly, amount: MEMBERSHIP.yearlyAmount },
      },
    }).send(res);
  });

  me = asyncHandler(async (req: any, res: Response) => {
    if (!req.user?.id) throw new AuthFailureError('Authentication required');

    const membership = await MembershipRepo.findLatestByUserId(req.user.id);
    const planAccess = await getPlanAccess(req.user);
    return new SuccessResponse('Membership retrieved', {
      membership: membership || null,
      isMember: planAccess.isMember,
      requiresPlan: planAccess.requiresPlan,
    }).send(res);
  });

  pay = asyncHandler(async (req: any, res: Response) => {
    if (!req.user?.id) throw new AuthFailureError('Authentication required');

    const planId = parsePlanId(req.body?.planId);
    const opaqueData = req.body?.opaqueData || {};
    const dataDescriptor = String(opaqueData.dataDescriptor || '').trim();
    const dataValue = String(opaqueData.dataValue || '').trim();

    if (!dataDescriptor || !dataValue) {
      throw new BadRequestError('Payment token is required. Tokenize the card with Accept.js first.');
    }

    const amount = planAmount(planId);
    const user = req.user;
    const email = String(user.email || '').trim();
    const firstName = user.firstName || '';
    const lastName = user.lastName || '';
    const name = [firstName, lastName].filter(Boolean).join(' ') || email;
    const planLabel = PLAN_LABEL[planId];

    const charge = await chargeOpaqueData({
      amount,
      opaqueData: { dataDescriptor, dataValue },
      email,
      firstName,
      lastName,
      invoiceNumber: `MEM-${planId}-${Date.now()}`.slice(0, 20),
      description: `${planLabel} membership — The Movie Studio`,
    });

    const startsAt = new Date();
    const membership = await MembershipRepo.activate({
      userId: user.id,
      planId,
      startsAt,
      endsAt: computeEndsAt(planId, startsAt),
      transactionId: charge.transactionId,
    });

    if (isMailConfigured()) {
      const amountLabel = formatAmount(amount);
      try {
        await sendPaymentStudioEmail({
          name,
          email,
          planLabel,
          amount: amountLabel,
          transactionId: charge.transactionId,
        });
        if (SMTP.sendAutoReply) {
          await sendPaymentUserEmail({
            to: email,
            firstName: firstName || 'there',
            planLabel,
            amount: amountLabel,
            transactionId: charge.transactionId,
          });
        }
      } catch (error) {
        Logger.error(`Payment email failed: ${error instanceof Error ? error.message : error}`);
      }
    }

    return new SuccessResponse('Payment successful', {
      membership,
      isMember: true,
      requiresPlan: false,
      payment: {
        transactionId: charge.transactionId,
        authCode: charge.authCode,
        accountNumber: charge.accountNumber,
        accountType: charge.accountType,
        amount,
        planId,
        planLabel,
      },
    }).send(res);
  });

  /**
   * iOS App Store IAP only. Android continues to use /membership/pay (Authorize.Net)
   * or the website checkout flow.
   */
  apple = asyncHandler(async (req: any, res: Response) => {
    if (!req.user?.id) throw new AuthFailureError('Authentication required');

    const planId = parsePlanId(req.body?.planId);
    const productId = String(req.body?.productId || '').trim();
    const transactionId = String(req.body?.transactionId || '').trim();
    const originalTransactionId = String(
      req.body?.originalTransactionId || transactionId,
    ).trim();
    const purchaseToken = String(req.body?.purchaseToken || '').trim();

    if (!productId || !transactionId) {
      throw new BadRequestError('Apple product and transaction id are required.');
    }

    const expectedProductId = APPLE_PRODUCT_IDS[planId];
    if (productId !== expectedProductId) {
      throw new BadRequestError('Apple product does not match the selected plan.');
    }

    const mapped = planIdFromAppleProductId(productId);
    if (!mapped || mapped !== planId) {
      throw new BadRequestError('Invalid Apple membership product.');
    }

    const verified = await verifyApplePurchasePayload({
      productId,
      transactionId,
      originalTransactionId,
      purchaseToken,
    });

    const existingByTx = await MembershipRepo.findByTransactionId(
      verified.transactionId,
    );
    if (existingByTx && existingByTx.userId !== req.user.id) {
      throw new BadRequestError(
        'This Apple purchase is already linked to another account.',
      );
    }

    const startsAt = verified.purchaseDate
      ? new Date(verified.purchaseDate)
      : new Date();
    const endsAt = verified.expiresDate
      ? new Date(verified.expiresDate)
      : computeEndsAt(planId, startsAt);

    const membership = await MembershipRepo.activate({
      userId: req.user.id,
      planId,
      startsAt,
      endsAt,
      transactionId: verified.transactionId,
      subscriptionId: verified.originalTransactionId,
    });

    const user = req.user;
    const email = String(user.email || '').trim();
    const firstName = user.firstName || '';
    const lastName = user.lastName || '';
    const name = [firstName, lastName].filter(Boolean).join(' ') || email;
    const planLabel = PLAN_LABEL[planId];
    const amount = planAmount(planId);

    if (isMailConfigured()) {
      const amountLabel = formatAmount(amount);
      try {
        await sendPaymentStudioEmail({
          name,
          email,
          planLabel: `${planLabel} (App Store)`,
          amount: amountLabel,
          transactionId: verified.transactionId,
        });
        if (SMTP.sendAutoReply) {
          await sendPaymentUserEmail({
            to: email,
            firstName: firstName || 'there',
            planLabel: `${planLabel} (App Store)`,
            amount: amountLabel,
            transactionId: verified.transactionId,
          });
        }
      } catch (error) {
        Logger.error(
          `Apple payment email failed: ${
            error instanceof Error ? error.message : error
          }`,
        );
      }
    }

    return new SuccessResponse('Apple membership activated', {
      membership,
      isMember: true,
      requiresPlan: false,
      payment: {
        provider: 'apple',
        transactionId: verified.transactionId,
        originalTransactionId: verified.originalTransactionId,
        productId: verified.productId,
        amount,
        planId,
        planLabel,
        environment: verified.environment || null,
      },
    }).send(res);
  });
}
