import MembershipRepo from './membership.repository';

export type PlanAccess = {
  isMember: boolean;
  requiresPlan: boolean;
  membership: Awaited<ReturnType<typeof MembershipRepo.findActiveByUserId>> | null;
};

/**
 * Membership is account-scoped (userId), not device/store-scoped.
 * Apple IAP, website Authorize.Net, and Android web checkout all unlock
 * the same active membership for login on web + every app platform.
 */
export async function getPlanAccess(user: {
  id: string;
  role?: { code?: string } | null;
}): Promise<PlanAccess> {
  if (user.role?.code === 'SUPER_ADMIN') {
    return { isMember: true, requiresPlan: false, membership: null };
  }

  const membership = await MembershipRepo.findActiveByUserId(user.id);
  const isMember = Boolean(membership);
  return {
    isMember,
    requiresPlan: !isMember,
    membership: membership || null,
  };
}
