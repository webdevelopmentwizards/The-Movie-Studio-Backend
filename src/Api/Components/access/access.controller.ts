import { Response, NextFunction, Request } from "express";
import asyncHandler from "../../../helpers/async";
import UserRepo from './user.repository';
import { BadRequestError, InternalError } from '../../../core/ApiError';
import type { UsersEntity } from './User';
import { SuccessMsgResponse, SuccessResponse } from '../../../core/ApiResponse';
import { AccessService } from './access.service';
import { comparePassword } from "../../../utils/password";
import KeystoreRepo from './keystore.repository';
import { removePasswordFromUser } from '../../../utils/userUtils';
import { getPlanAccess } from '../membership/membership.access';
import {
  buildMobileOAuthErrorUrl,
  buildMobileOAuthSuccessUrl,
  isAllowlistedOAuthRedirectUri,
} from '../../../utils/oauthRedirect';
import {
  issueAppBridgeCode,
  resolveAppBridge,
} from './appBridge.store';
import TokenRepo from '../token/token.repository';
import { generateOTP, generateRandomString } from '../../../utils/authUtils';
import {
  isMailConfigured,
  sendForgotPasswordEmail,
} from '../../../services/mailService';
import Logger from '../../../core/Logger';

const FORGOT_PASSWORD_TTL_MS = 15 * 60 * 1000;
const FORGOT_PASSWORD_MSG =
  'If an account exists for that email, a reset code has been sent.';

export class AccessController {
  private service: AccessService = new AccessService();

  register = asyncHandler(
    async (req: any, res: Response, next: NextFunction): Promise<Response | void> => {
      const bodyData = req.body;
      const user = await UserRepo.findByEmail(bodyData.email);
      if (user) throw new BadRequestError('User already registered');

      const { tokens, user: createdUser } = await this.service.generate(
        'SIGNUP',
        {
          email: bodyData.email,
          password: bodyData.password,
          firstName: bodyData.firstName,
          lastName: bodyData.lastName?.trim() || null,
          phoneNumber: bodyData.contactNumber?.trim() || bodyData.phoneNumber?.trim() || null,
        } as unknown as UsersEntity,
        'USER',
      );

      const userWithoutPassword = removePasswordFromUser(createdUser);
      const planAccess = await getPlanAccess(createdUser as any);

      new SuccessResponse('Registration successful', {
        user: userWithoutPassword,
        tokens,
        isMember: planAccess.isMember,
        requiresPlan: planAccess.requiresPlan,
        membership: planAccess.membership,
      }).send(res);
    },
  );

  login = asyncHandler(
    async (req: any, res: Response, next: NextFunction): Promise<Response | void> => {
      const bodyData = req.body;
      const user = await UserRepo.findByEmail(bodyData.email);
      if (!user) throw new BadRequestError('Invalid credentials');

      if (!user.isActive) throw new BadRequestError('Your account has been deactivated');
      if (user.isDeleted) throw new BadRequestError('Your account has been deleted');

      const provider = (user as any).provider || 'EMAIL';

      if (provider === 'EMAIL') {
        if (!user.password) {
          throw new BadRequestError('Credentials not set');
        }
        comparePassword(req.body.password, user.password);
      } else if (user.password && req.body.password) {
        comparePassword(req.body.password, user.password);
      }

      const { tokens } = await this.service.generate('SIGNIN', user as UsersEntity);
      const userWithoutPassword = removePasswordFromUser(user);
      const planAccess = await getPlanAccess(user as any);

      new SuccessResponse('Login successful', {
        user: userWithoutPassword,
        tokens,
        isMember: planAccess.isMember,
        requiresPlan: planAccess.requiresPlan,
        membership: planAccess.membership,
      }).send(res);
    },
  );

  logout = asyncHandler(
    async (req: any, res: Response, next: NextFunction): Promise<Response | void> => {
      if (req.user?.id && req.keystore?.primaryKey) {
        await KeystoreRepo.removeCurrent(req.user.id, req.keystore.primaryKey);
      } else if (req.user?.id) {
        await KeystoreRepo.remove(req.user.id);
      }
      new SuccessMsgResponse('Logout successful').send(res);
    },
  );

  /**
   * App-only handoff. Web login/signup/pay do not use this.
   * The app opens the website with the code; the site trades it for its own session.
   */
  createAppBridge = asyncHandler(
    async (req: any, res: Response): Promise<Response | void> => {
      const issued = issueAppBridgeCode(req.user.id);
      new SuccessResponse('Payment link ready', issued).send(res);
    },
  );

  consumeAppBridge = asyncHandler(
    async (req: any, res: Response): Promise<Response | void> => {
      const code = String(req.body?.code || '').trim();
      if (!code) throw new BadRequestError('Payment link is missing.');

      const result = await resolveAppBridge(code, async userId => {
        const user = await UserRepo.findById(userId);
        if (!user) throw new BadRequestError('Account not found.');
        if (!user.isActive) {
          throw new BadRequestError('Your account has been deactivated');
        }
        if (user.isDeleted) {
          throw new BadRequestError('Your account has been deleted');
        }

        const { tokens } = await this.service.generate(
          'SIGNIN',
          user as UsersEntity,
        );
        const planAccess = await getPlanAccess(user as any);
        return {
          user: removePasswordFromUser(user),
          tokens,
          isMember: planAccess.isMember,
          requiresPlan: planAccess.requiresPlan,
          membership: planAccess.membership,
        };
      });

      if (!result) {
        throw new BadRequestError(
          'This payment link has expired. Go back to the app and try again.',
        );
      }

      new SuccessResponse('Signed in for payment', result).send(res);
    },
  );

  me = asyncHandler(
    async (req: any, res: Response, next: NextFunction): Promise<Response | void> => {
      const user = await UserRepo.findById(req.user.id);
      if (!user) throw new BadRequestError('User not found');
      const userWithoutPassword = removePasswordFromUser(user);
      const planAccess = await getPlanAccess(user as any);
      new SuccessResponse('Authenticated user', {
        user: userWithoutPassword,
        isMember: planAccess.isMember,
        requiresPlan: planAccess.requiresPlan,
        membership: planAccess.membership,
      }).send(res);
    },
  );

  forgotPassword = asyncHandler(
    async (req: any, res: Response): Promise<Response | void> => {
      const email = String(req.body?.email || '').trim();
      if (!email) throw new BadRequestError('Email is required');

      if (!isMailConfigured()) {
        throw new InternalError('Email is not configured. Please try again later.');
      }

      const user = await UserRepo.findByEmail(email);
      if (user && user.isActive && !user.isDeleted) {
        const otp = String(generateOTP());
        await TokenRepo.delete({
          where: { userId: user.id, type: 'FORGOT_PASSWORD' },
        });
        await TokenRepo.create({
          type: 'FORGOT_PASSWORD',
          token: generateRandomString(32),
          shortCode: otp,
          expireAt: new Date(Date.now() + FORGOT_PASSWORD_TTL_MS),
          userId: user.id,
        });

        const name =
          user.firstName?.trim() ||
          email.split('@')[0] ||
          'there';

        try {
          await sendForgotPasswordEmail({ to: user.email, name, otp });
        } catch (error) {
          Logger.error(
            `Forgot password email failed: ${error instanceof Error ? error.message : error}`,
          );
          throw new InternalError(
            'Unable to send reset code right now. Please try again shortly.',
          );
        }
      }

      new SuccessMsgResponse(FORGOT_PASSWORD_MSG).send(res);
    },
  );

  resetPassword = asyncHandler(
    async (req: any, res: Response): Promise<Response | void> => {
      const email = String(req.body?.email || '').trim();
      const otp = String(req.body?.otp || '').trim();
      const password = String(req.body?.password || '');

      if (!email || !otp || !password) {
        throw new BadRequestError('Email, code, and new password are required');
      }

      const user = await UserRepo.findByEmail(email);
      if (!user || !user.isActive || user.isDeleted) {
        throw new BadRequestError('Invalid or expired reset code');
      }

      const token = await TokenRepo.findOne({
        where: {
          userId: user.id,
          type: 'FORGOT_PASSWORD',
          shortCode: otp,
          expireAt: { gte: new Date() },
        },
      });
      if (!token) throw new BadRequestError('Invalid or expired reset code');

      await UserRepo.updatePassword(user.id, { password });
      await TokenRepo.delete({
        where: { userId: user.id, type: 'FORGOT_PASSWORD' },
      });

      new SuccessMsgResponse('Password updated. You can sign in now.').send(res);
    },
  );

  googleAuth = asyncHandler(
    async (req: Request, res: Response, next: NextFunction): Promise<Response | void> => {
      const redirectUri = req.query.redirect_uri as string | undefined;
      const errorRedirectUri = req.query.error_redirect_uri as string | undefined;
      const normalizedRedirectUri = redirectUri?.trim();
      const normalizedErrorRedirectUri = errorRedirectUri?.trim();

      if (normalizedRedirectUri && !isAllowlistedOAuthRedirectUri(normalizedRedirectUri)) {
        throw new BadRequestError('Invalid redirect_uri. The provided redirect target is not allowed.');
      }

      if (normalizedErrorRedirectUri && !isAllowlistedOAuthRedirectUri(normalizedErrorRedirectUri)) {
        throw new BadRequestError('Invalid error_redirect_uri. The provided redirect target is not allowed.');
      }

      try {
        const authUrl = this.service.getGoogleAuthUrl(
          undefined,
          normalizedRedirectUri,
          normalizedErrorRedirectUri
        );
        res.redirect(authUrl);
      } catch (error: any) {
        const message = error.message || 'Authentication failed';

        if (normalizedRedirectUri && isAllowlistedOAuthRedirectUri(normalizedRedirectUri)) {
          return res.redirect(
            buildMobileOAuthErrorUrl(normalizedRedirectUri, message, normalizedErrorRedirectUri)
          );
        }

        throw new BadRequestError(message);
      }
    },
  );

  googleCallback = asyncHandler(
    async (req: Request, res: Response, next: NextFunction): Promise<Response | void> => {
      const state = req.query.state as string | undefined;
      const oauthState = this.service.extractOAuthState(state);
      const mobileRedirectUri = oauthState.redirectUri;
      const mobileErrorRedirectUri = oauthState.errorRedirectUri;

      const redirectOAuthError = (message: string): void => {
        if (mobileRedirectUri && isAllowlistedOAuthRedirectUri(mobileRedirectUri)) {
          res.redirect(
            buildMobileOAuthErrorUrl(mobileRedirectUri, message, mobileErrorRedirectUri)
          );
          return;
        }

        throw new BadRequestError(message);
      };

      try {
        const googleError = req.query.error as string | undefined;
        if (googleError) {
          const googleErrorDescription = req.query.error_description as string | undefined;
          const message = googleErrorDescription || googleError || 'Google authentication was cancelled';
          redirectOAuthError(message);
          return;
        }

        const code = req.query.code as string;
        if (!code) {
          redirectOAuthError('Authorization code is missing.');
          return;
        }

        const result = await this.service.handleGoogleCallback(code);
        const userWithoutPassword = removePasswordFromUser(result.user);
        const planAccess = await getPlanAccess(result.user as any);

        if (mobileRedirectUri && isAllowlistedOAuthRedirectUri(mobileRedirectUri)) {
          const successUrl = buildMobileOAuthSuccessUrl(
            mobileRedirectUri,
            result.tokens,
            {
              ...(userWithoutPassword as Record<string, unknown>),
              isMember: planAccess.isMember,
              requiresPlan: planAccess.requiresPlan,
            }
          );
          return res.redirect(successUrl);
        }

        new SuccessResponse('Login successful', {
          user: userWithoutPassword,
          tokens: result.tokens,
          isMember: planAccess.isMember,
          requiresPlan: planAccess.requiresPlan,
          membership: planAccess.membership,
        }).send(res);
      } catch (error: any) {
        if (error instanceof BadRequestError) throw error;
        redirectOAuthError(error.message || 'Google authentication failed');
      }
    },
  );

  facebookAuth = asyncHandler(
    async (req: Request, res: Response, next: NextFunction): Promise<Response | void> => {
      const redirectUri = req.query.redirect_uri as string | undefined;
      const errorRedirectUri = req.query.error_redirect_uri as string | undefined;
      const normalizedRedirectUri = redirectUri?.trim();
      const normalizedErrorRedirectUri = errorRedirectUri?.trim();

      if (normalizedRedirectUri && !isAllowlistedOAuthRedirectUri(normalizedRedirectUri)) {
        throw new BadRequestError('Invalid redirect_uri. The provided redirect target is not allowed.');
      }

      if (normalizedErrorRedirectUri && !isAllowlistedOAuthRedirectUri(normalizedErrorRedirectUri)) {
        throw new BadRequestError('Invalid error_redirect_uri. The provided redirect target is not allowed.');
      }

      try {
        const authUrl = this.service.getFacebookAuthUrl(
          undefined,
          normalizedRedirectUri,
          normalizedErrorRedirectUri
        );
        res.redirect(authUrl);
      } catch (error: any) {
        const message = error.message || 'Authentication failed';

        if (normalizedRedirectUri && isAllowlistedOAuthRedirectUri(normalizedRedirectUri)) {
          return res.redirect(
            buildMobileOAuthErrorUrl(normalizedRedirectUri, message, normalizedErrorRedirectUri)
          );
        }

        throw new BadRequestError(message);
      }
    },
  );

  facebookCallback = asyncHandler(
    async (req: Request, res: Response, next: NextFunction): Promise<Response | void> => {
      const state = req.query.state as string | undefined;
      const oauthState = this.service.extractOAuthState(state);
      const mobileRedirectUri = oauthState.redirectUri;
      const mobileErrorRedirectUri = oauthState.errorRedirectUri;

      const redirectOAuthError = (message: string): void => {
        if (mobileRedirectUri && isAllowlistedOAuthRedirectUri(mobileRedirectUri)) {
          res.redirect(
            buildMobileOAuthErrorUrl(mobileRedirectUri, message, mobileErrorRedirectUri)
          );
          return;
        }

        throw new BadRequestError(message);
      };

      try {
        const facebookError = req.query.error as string | undefined;
        if (facebookError) {
          const facebookErrorDescription = req.query.error_description as string | undefined;
          const message =
            facebookErrorDescription || facebookError || 'Facebook authentication was cancelled';
          redirectOAuthError(message);
          return;
        }

        const code = req.query.code as string;
        if (!code) {
          redirectOAuthError('Authorization code is missing.');
          return;
        }

        const result = await this.service.handleFacebookCallback(code);
        const userWithoutPassword = removePasswordFromUser(result.user);
        const planAccess = await getPlanAccess(result.user as any);

        if (mobileRedirectUri && isAllowlistedOAuthRedirectUri(mobileRedirectUri)) {
          const successUrl = buildMobileOAuthSuccessUrl(
            mobileRedirectUri,
            result.tokens,
            {
              ...(userWithoutPassword as Record<string, unknown>),
              isMember: planAccess.isMember,
              requiresPlan: planAccess.requiresPlan,
            }
          );
          return res.redirect(successUrl);
        }

        new SuccessResponse('Login successful', {
          user: userWithoutPassword,
          tokens: result.tokens,
          isMember: planAccess.isMember,
          requiresPlan: planAccess.requiresPlan,
          membership: planAccess.membership,
        }).send(res);
      } catch (error: any) {
        if (error instanceof BadRequestError) throw error;
        redirectOAuthError(error.message || 'Facebook authentication failed');
      }
    },
  );
}
