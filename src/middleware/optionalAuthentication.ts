import asyncHandler from '../helpers/asyncHandler';
import UserRepo from '../Api/Components/access/user.repository';
import KeystoreRepo from '../Api/Components/access/keystore.repository';
import JWT from '../core/JWT';
import { getAccessToken, validateTokenData } from '../utils/authUtils';

/**
 * Optionally attach req.user when a valid Bearer token is present.
 * Invalid or missing tokens are ignored (public QR pass endpoints stay open).
 */
export default asyncHandler(async (req: any, _res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization || typeof authorization !== 'string' || !authorization.startsWith('Bearer ')) {
    return next();
  }

  try {
    const accessToken = getAccessToken(authorization);
    const payload = await JWT.validate(accessToken);
    validateTokenData(payload);

    const user = await UserRepo.findById(payload.sub);
    if (!user) return next();

    const keystore = await KeystoreRepo.findforKey(user.id, payload.prm);
    if (!keystore) return next();

    req.user = user;
  } catch {
    // Ignore invalid/expired tokens for optional auth
  }

  return next();
});
