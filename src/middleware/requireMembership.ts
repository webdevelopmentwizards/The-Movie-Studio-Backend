import { ForbiddenError, AuthFailureError } from '../core/ApiError';
import asyncHandler from '../helpers/async';
import { getPlanAccess } from '../Api/Components/membership/membership.access';

const requireMembership = asyncHandler(async (req: any, _res, next) => {
  if (!req.user?.id) throw new AuthFailureError('Authentication required');

  const access = await getPlanAccess(req.user);
  if (access.requiresPlan) {
    throw new ForbiddenError('Membership required. Please choose a plan to continue.');
  }

  req.membership = access.membership;
  req.isMember = access.isMember;
  return next();
});

export default requireMembership;
