import MembershipRepo from './membership.repository';

export type PlanAccess = {
  isMember: boolean;
  requiresPlan: boolean;
  membership: Awaited<ReturnType<typeof MembershipRepo.findActiveByUserId>> | null;
};

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
