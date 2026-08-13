import type { UsersEntity } from './User';
import Role from '../roles/Role';
import { generateTokenKey } from "../../../helpers/tokenKeyGenerator";
import UserRepo from "./user.repository";
import { BadRequestError } from '../../../core/ApiError';
import { createTokens } from '../../../utils/authUtils';
import KeystoreRepo from './keystore.repository';
import { Tokens } from 'app-request';
import { OAuth2Client } from "google-auth-library";
import axios from "axios";
import * as jwt from "jsonwebtoken";
import RoleRepo from "../roles/role.repository";
import {
  encodeOAuthState,
  isAllowlistedOAuthRedirectUri,
  parseOAuthState,
} from '../../../utils/oauthRedirect';

// Constants
const VALID_OAUTH_PROVIDERS = ["GOOGLE", "FACEBOOK", "APPLE"] as const;
const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
];
const FACEBOOK_SCOPES = ["email", "public_profile"];
const APPLE_SCOPE = "name email";
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Interfaces
export interface GoogleUserInfo {
  id: string;
  email: string;
  verified_email: boolean;
  name?: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
}

export interface FacebookUserInfo {
  id: string;
  email?: string;
  name?: string;
  first_name?: string;
  last_name?: string;
  picture?: { data?: { url?: string } };
}

export interface AppleUserInfo {
  sub: string;
  email?: string;
  email_verified?: boolean;
}

export interface OAuthLoginRequest {
  email: string;
  provider: "GOOGLE" | "FACEBOOK" | "APPLE";
  uid: string;
  first_name?: string;
  last_name?: string;
  profile_photo?: string;
}

type OAuthProvider = typeof VALID_OAUTH_PROVIDERS[number];
type ApplePayload = Record<string, unknown> & { sub?: string; email?: string; given_name?: string; family_name?: string };

export class AccessService {
  private googleClient: OAuth2Client | null = null;
  private facebookAppId: string;
  private facebookAppSecret: string;
  private appleClientId: string;
  private appleTeamId: string;
  private appleKeyId: string;
  private applePrivateKey: string;
  private appleRedirectUri: string;

  constructor() {
    this.initializeGoogleClient();
    this.initializeFacebookCredentials();
    this.initializeAppleCredentials();
  }

  // ==================== Token Generation ====================
  async generate(
    type: 'SIGNUP' | 'SIGNIN',
    user: UsersEntity,
    roleCode?: Role['code'],
  ): Promise<{ tokens: Tokens; user: UsersEntity }> {
    if (type === 'SIGNUP') {
      const { user: createdUser } = await UserRepo.create(user as UsersEntity, roleCode as any);
      user = createdUser as UsersEntity;
    }

    const [accessTokenKey, refreshTokenKey] = [generateTokenKey(), generateTokenKey()];
    const keystore = await KeystoreRepo.create(user.id, accessTokenKey, refreshTokenKey);
    const tokens = await createTokens(user, keystore.primaryKey, keystore.secondaryKey);

    return { tokens, user };
  }

  // ==================== Google OAuth ====================
  public getGoogleAuthUrl(affiliateCode?: string, redirectUri?: string, errorRedirectUri?: string): string {
    if (!this.googleClient || !process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      throw new BadRequestError("Google OAuth is not configured. Please set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI");
    }

    const normalizedRedirectUri = redirectUri?.trim();
    const normalizedErrorRedirectUri = errorRedirectUri?.trim();

    if (normalizedRedirectUri && !isAllowlistedOAuthRedirectUri(normalizedRedirectUri)) {
      throw new BadRequestError("Invalid redirect_uri. The provided redirect target is not allowed.");
    }

    if (normalizedErrorRedirectUri && !isAllowlistedOAuthRedirectUri(normalizedErrorRedirectUri)) {
      throw new BadRequestError("Invalid error_redirect_uri. The provided redirect target is not allowed.");
    }

    const state = encodeOAuthState({
      affiliateCode,
      redirectUri: normalizedRedirectUri,
      errorRedirectUri: normalizedErrorRedirectUri,
    });

    return this.googleClient.generateAuthUrl({
      access_type: "offline",
      scope: GOOGLE_SCOPES,
      prompt: "consent",
      state: state,
    });
  }

  public async handleGoogleCallback(code: string, affiliateCode?: string): Promise<{ user: UsersEntity; tokens: Tokens }> {
    return this.handleOAuthError(async () => {
      if (!this.googleClient || !process.env.GOOGLE_CLIENT_ID) {
        throw new BadRequestError("Google OAuth is not configured. Please set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI");
      }

      const { tokens } = await this.googleClient.getToken(code);
      this.googleClient.setCredentials(tokens);

      const ticket = await this.googleClient.verifyIdToken({
        idToken: tokens.id_token!,
        audience: process.env.GOOGLE_CLIENT_ID,
      });

      const payload = ticket.getPayload();
      if (!payload?.email) {
        throw new BadRequestError("Failed to retrieve user information from Google");
      }

      return this.processOAuthLogin({
        email: payload.email,
        provider: "GOOGLE",
        uid: payload.sub,
        first_name: payload.given_name,
        last_name: payload.family_name,
        profile_photo: payload.picture,
      }, affiliateCode);
    }, "Google authentication failed");
  }

  // ==================== Facebook OAuth ====================
  public getFacebookAuthUrl(
    affiliateCode?: string,
    redirectUri?: string,
    errorRedirectUri?: string
  ): string {
    if (!this.facebookAppId || !this.facebookAppSecret) {
      throw new BadRequestError("Facebook OAuth is not configured. Please set FACEBOOK_APP_ID, FACEBOOK_APP_SECRET, and FACEBOOK_REDIRECT_URI");
    }

    const normalizedRedirectUri = redirectUri?.trim();
    const normalizedErrorRedirectUri = errorRedirectUri?.trim();

    if (normalizedRedirectUri && !isAllowlistedOAuthRedirectUri(normalizedRedirectUri)) {
      throw new BadRequestError("Invalid redirect_uri. The provided redirect target is not allowed.");
    }

    if (normalizedErrorRedirectUri && !isAllowlistedOAuthRedirectUri(normalizedErrorRedirectUri)) {
      throw new BadRequestError("Invalid error_redirect_uri. The provided redirect target is not allowed.");
    }

    const callbackRedirectUri = this.requireEnv("FACEBOOK_REDIRECT_URI");
    const state = encodeOAuthState({
      affiliateCode,
      redirectUri: normalizedRedirectUri,
      errorRedirectUri: normalizedErrorRedirectUri,
    });
    const params = new URLSearchParams({
      client_id: this.facebookAppId,
      redirect_uri: callbackRedirectUri,
      scope: FACEBOOK_SCOPES.join(","),
      response_type: "code",
      state: state,
    });

    return `https://www.facebook.com/v18.0/dialog/oauth?${params.toString()}`;
  }

  public async handleFacebookCallback(code: string, affiliateCode?: string): Promise<{ user: UsersEntity; tokens: Tokens }> {
    return this.handleOAuthError(async () => {
      const redirectUri = this.requireEnv("FACEBOOK_REDIRECT_URI");
      const accessToken = await this.exchangeFacebookCode(code, redirectUri);
      const userInfo = await this.getFacebookUserInfo(accessToken);

      return this.processOAuthLogin({
        email: userInfo.email || `${userInfo.id}@facebook.com`,
        provider: "FACEBOOK",
        uid: userInfo.id,
        first_name: userInfo.first_name,
        last_name: userInfo.last_name,
        profile_photo: await this.getFacebookProfilePicture(userInfo.id, accessToken),
      }, affiliateCode);
    }, "Facebook authentication failed");
  }

  // ==================== Apple OAuth ====================
  public getAppleAuthUrl(
    affiliateCode?: string,
    redirectUri?: string,
    errorRedirectUri?: string
  ): string {
    if (!this.appleClientId || !this.appleRedirectUri) {
      throw new BadRequestError("Apple OAuth is not configured. Please set APPLE_CLIENT_ID and APPLE_REDIRECT_URI");
    }

    const normalizedRedirectUri = redirectUri?.trim();
    const normalizedErrorRedirectUri = errorRedirectUri?.trim();

    if (normalizedRedirectUri && !isAllowlistedOAuthRedirectUri(normalizedRedirectUri)) {
      throw new BadRequestError("Invalid redirect_uri. The provided redirect target is not allowed.");
    }

    if (normalizedErrorRedirectUri && !isAllowlistedOAuthRedirectUri(normalizedErrorRedirectUri)) {
      throw new BadRequestError("Invalid error_redirect_uri. The provided redirect target is not allowed.");
    }

    const state = encodeOAuthState({
      affiliateCode,
      redirectUri: normalizedRedirectUri,
      errorRedirectUri: normalizedErrorRedirectUri,
    });
    const params = new URLSearchParams({
      response_type: "code",
      response_mode: "form_post",
      client_id: this.appleClientId,
      redirect_uri: this.appleRedirectUri,
      scope: APPLE_SCOPE,
      state: state,
    });

    return `https://appleid.apple.com/auth/authorize?${params.toString()}`;
  }

  public async handleAppleCallback(code: string, affiliateCode?: string): Promise<{ user: UsersEntity; tokens: Tokens }> {
    return this.handleOAuthError(async () => {
      if (!this.appleClientId || !this.appleTeamId || !this.appleKeyId || !this.applePrivateKey) {
        throw new BadRequestError("Apple OAuth is not configured. Please set APPLE_CLIENT_ID, APPLE_TEAM_ID, APPLE_KEY_ID, and APPLE_PRIVATE_KEY");
      }

      const clientSecret = this.generateAppleClientSecret();
      const idToken = await this.exchangeAppleCode(code, clientSecret);
      const payload = await this.verifyAppleIdToken(idToken);

      return this.processOAuthLogin({
        email: (payload.email as string) || `${payload.sub}@apple.com`,
        provider: "APPLE",
        uid: payload.sub as string,
        first_name: payload.given_name as string,
        last_name: payload.family_name as string,
      }, affiliateCode);
    }, "Apple authentication failed");
  }

  // ==================== OAuth Processing ====================
  private async processOAuthLogin(data: OAuthLoginRequest, affiliateCode?: string): Promise<{ user: UsersEntity; tokens: Tokens }> {
    this.validateOAuthRequest(data);
    const normalized = this.normalizeOAuthData(data);
    
    // Check if user already exists to determine if this is a SIGNUP or SIGNIN
    const existingUser = await this.findOAuthUser(normalized);
    if (existingUser) {
      this.assertCanUseSocialLogin(existingUser, normalized.provider);
    }
    const isNewUser = !existingUser;
    
    let user: UsersEntity;
    
    if (existingUser) {
      // Existing user - just update and sign in
      user = await this.updateOAuthUser(existingUser, normalized);
    } else {
      // New user - create it
      user = await this.createOAuthUser(normalized);
    }
    
    const userWithRole = await this.ensureUserHasRole(user);
    
    // Always use SIGNIN type since user is already created/updated
    const { tokens, user: finalUser } = await this.generate('SIGNIN', userWithRole);
    return { user: finalUser, tokens };
  }

  private assertCanUseSocialLogin(user: UsersEntity, requestedProvider: OAuthProvider): void {
    const hasSocialLink = Boolean(user.oauthUid) && user.provider !== "EMAIL";

    if (!hasSocialLink && user.provider === "EMAIL") {
      throw new BadRequestError(
        "An account with this email already exists with password login. Please login with email/password first and then link your social account."
      );
    }

    if (hasSocialLink && user.provider !== requestedProvider) {
      throw new BadRequestError(
        `This email is already linked with ${String(user.provider).toLowerCase()} login. Please continue with that provider.`
      );
    }
  }

  private validateOAuthRequest(data: OAuthLoginRequest): void {
    const errors: string[] = [];

    if (!data.email?.trim()) errors.push("Email is required");
    else if (!EMAIL_REGEX.test(data.email.trim())) errors.push("Invalid email format");

    if (!data.provider?.trim()) errors.push("OAuth provider is required");
    else if (!VALID_OAUTH_PROVIDERS.includes(data.provider.toUpperCase() as OAuthProvider)) {
      errors.push(`Invalid provider. Supported: ${VALID_OAUTH_PROVIDERS.join(", ")}`);
    }

    if (!data.uid?.trim()) errors.push("OAuth user ID is required");

    if (errors.length) throw new BadRequestError(errors.join(". "));
  }

  private normalizeOAuthData(data: OAuthLoginRequest): OAuthLoginRequest {
    return {
      email: data.email.toLowerCase().trim(),
      provider: data.provider.toUpperCase() as OAuthProvider,
      uid: data.uid.trim(),
      first_name: data.first_name?.trim(),
      last_name: data.last_name?.trim(),
      profile_photo: data.profile_photo?.trim(),
    };
  }

  private async findOrCreateOAuthUser(data: OAuthLoginRequest): Promise<UsersEntity> {
    const existing = await this.findOAuthUser(data);
    return existing ? this.updateOAuthUser(existing, data) : this.createOAuthUser(data);
  }

  private async findOAuthUser(data: OAuthLoginRequest): Promise<UsersEntity | null> {
    try {
      return (await UserRepo.findOne({
        where: {
          OR: [
            { email: data.email, isDeleted: false },
            { provider: data.provider as any, oauthUid: data.uid, isDeleted: false },
          ],
        },
      })) as UsersEntity | null;
    } catch (error) {
      console.error("Error finding OAuth user:", error);
      throw new BadRequestError("Failed to search for user account");
    }
  }

  private async createOAuthUser(data: OAuthLoginRequest): Promise<UsersEntity> {
    const role = await this.getUserRole();
    const userData: UsersEntity = {
      email: data.email,
      password: "",
      firstName: data.first_name || null,
      lastName: data.last_name || null,
      profileImage: data.profile_photo || null,
      provider: data.provider as any,
      oauthUid: data.uid,
      isEmailVerified: true,
      roleId: role.id,
    } as any;

    try {
      const { user: created } = await UserRepo.create(userData, "USER");
      if (!created?.id || !(created as any).role) throw new BadRequestError("Failed to create user");
      return created as UsersEntity;
    } catch (error: any) {
      this.handleDatabaseError(error, "create");
      throw error;
    }
  }

  private async updateOAuthUser(user: UsersEntity, data: OAuthLoginRequest): Promise<UsersEntity> {
    const updateData = this.buildUpdateData(user, data);
    if (!Object.keys(updateData).length) return user;

    try {
      const updated = await UserRepo.update(user.id, updateData);
      if (!updated) throw new BadRequestError("Failed to update user");
      return updated as UsersEntity;
    } catch (error: any) {
      this.handleDatabaseError(error, "update");
      throw error;
    }
  }

  private buildUpdateData(user: UsersEntity, data: OAuthLoginRequest): any {
    const update: any = {};
    if (user.provider !== data.provider) update.provider = data.provider;
    if (user.oauthUid !== data.uid) update.oauthUid = data.uid;
    if (!user.profileImage && data.profile_photo) update.profileImage = data.profile_photo;
    if (!user.firstName && data.first_name) update.firstName = data.first_name;
    if (!user.lastName && data.last_name) update.lastName = data.last_name;
    if (!user.isEmailVerified) update.isEmailVerified = true;
    return update;
  }

  private async getUserRole(): Promise<Role> {
    const role = await RoleRepo.findByCode("USER");
    if (!role) throw new BadRequestError("USER role not found");
    return role;
  }

  private async ensureUserHasRole(user: UsersEntity): Promise<UsersEntity> {
    if ((user as any).role) return user;
    const userWithRole = await UserRepo.findById(user.id);
    if (!userWithRole || !(userWithRole as any).role) {
      throw new BadRequestError("Failed to retrieve user role");
    }
    return userWithRole as UsersEntity;
  }

  // ==================== Helper Methods ====================
  private initializeGoogleClient(): void {
    const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
    const redirectUri = process.env.GOOGLE_REDIRECT_URI?.trim();

    this.googleClient = (clientId && clientSecret && redirectUri)
      ? new OAuth2Client(clientId, clientSecret, redirectUri)
      : null;
  }

  private initializeFacebookCredentials(): void {
    this.facebookAppId = process.env.FACEBOOK_APP_ID?.trim() || "";
    this.facebookAppSecret = process.env.FACEBOOK_APP_SECRET?.trim() || "";
  }

  /**
   * Normalize and validate Apple private key from environment variable
   */
  private normalizeApplePrivateKey(rawKey: string): string {
    if (!rawKey || rawKey.trim().length === 0) {
      return "";
    }

    let key = rawKey.trim();

    key = key.replace(/^['"]|['"]$/g, '');
    key = key.replace(/\\n/g, "\n");
    key = key.replace(/\\r\\n/g, "\n");
    key = key.replace(/\\r/g, "\n");
    key = key.replace(/\r\n/g, "\n");
    key = key.replace(/\r/g, "\n");

    if (key.includes("-----BEGIN") && !key.includes("\n")) {
      key = key.replace(/-----BEGIN PRIVATE KEY-----/, "-----BEGIN PRIVATE KEY-----\n");
      key = key.replace(/-----BEGIN EC PRIVATE KEY-----/, "-----BEGIN EC PRIVATE KEY-----\n");
      key = key.replace(/-----END PRIVATE KEY-----/, "\n-----END PRIVATE KEY-----");
      key = key.replace(/-----END EC PRIVATE KEY-----/, "\n-----END EC PRIVATE KEY-----");
    }

    key = key.replace(/\n{3,}/g, "\n\n");

    return key.trim();
  }

  private initializeAppleCredentials(): void {
    this.appleClientId = process.env.APPLE_CLIENT_ID?.trim() || "";
    this.appleTeamId = process.env.APPLE_TEAM_ID?.trim() || "";
    this.appleKeyId = process.env.APPLE_KEY_ID?.trim() || "";
    this.appleRedirectUri = process.env.APPLE_REDIRECT_URI?.trim() || "";
    this.applePrivateKey = this.normalizeApplePrivateKey(process.env.APPLE_PRIVATE_KEY || "");
  }

  private requireEnv(envKey: string): string {
    const value = process.env[envKey]?.trim();
    if (!value) {
      throw new BadRequestError(`${envKey} is not configured`);
    }
    return value;
  }

  private generateState(): string {
    return Math.random().toString(36).substring(7);
  }

  /**
   * Encode affiliate code into state parameter
   * Format: base64(affiliateCode|randomState)
   */
  private encodeStateWithAffiliateCode(affiliateCode?: string): string {
    const randomState = this.generateState();
    if (!affiliateCode || !affiliateCode.trim()) {
      return randomState;
    }
    // Encode as: affiliateCode|randomState (base64 encoded)
    const encoded = Buffer.from(`${affiliateCode.trim()}|${randomState}`).toString('base64');
    return encoded;
  }

  /**
   * Extract affiliate code from state parameter
   */
  public extractAffiliateCodeFromState(state: string): string | undefined {
    return parseOAuthState(state).affiliateCode;
  }

  public extractOAuthState(state?: string) {
    return parseOAuthState(state);
  }


  private async handleOAuthError<T>(
    fn: () => Promise<T>,
    errorMessage: string
  ): Promise<T> {
    try {
      return await fn();
    } catch (error: any) {
      console.error(`${errorMessage}:`, error);
      if (error instanceof BadRequestError) throw error;
      throw new BadRequestError(`${errorMessage}. Please try again`);
    }
  }

  private async exchangeFacebookCode(code: string, redirectUri: string): Promise<string> {
    const response = await axios.get("https://graph.facebook.com/v18.0/oauth/access_token", {
      params: { client_id: this.facebookAppId, client_secret: this.facebookAppSecret, redirect_uri: redirectUri, code },
    });
    return response.data.access_token;
  }

  private async getFacebookUserInfo(accessToken: string): Promise<FacebookUserInfo> {
    const response = await axios.get("https://graph.facebook.com/v18.0/me", {
      params: { access_token: accessToken, fields: "id,name,email,first_name,last_name,picture" },
    });

    const userInfo: FacebookUserInfo = response.data;

    if (!userInfo.email?.trim()) {
      try {
        const emailRes = await axios.get("https://graph.facebook.com/v18.0/me", {
          params: { access_token: accessToken, fields: "email" },
        });
        if (emailRes.data.email) userInfo.email = emailRes.data.email;
      } catch {
        // Email not available, will use fallback
      }
    }

    if (!userInfo.id) throw new BadRequestError("Failed to retrieve user information from Facebook");
    return userInfo;
  }

  private async getFacebookProfilePicture(userId: string, accessToken: string): Promise<string | undefined> {
    try {
      const response = await axios.get(`https://graph.facebook.com/v18.0/${userId}/picture`, {
        params: { access_token: accessToken, type: "large", redirect: false },
      });
      return response.data?.data?.url;
    } catch {
      return undefined;
    }
  }

  private async exchangeAppleCode(code: string, clientSecret: string): Promise<string> {
    const response = await axios.post(
      "https://appleid.apple.com/auth/token",
      new URLSearchParams({
        client_id: this.appleClientId,
        client_secret: clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: this.appleRedirectUri,
      }).toString(),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );

    if (!response.data?.id_token) {
      throw new BadRequestError("Apple authentication failed. No identity token returned");
    }

    return response.data.id_token;
  }

  private generateAppleClientSecret(): string {
    if (!this.applePrivateKey?.trim()) {
      throw new BadRequestError("Apple private key is not configured");
    }
    if (!this.appleTeamId || !this.appleKeyId || !this.appleClientId) {
      throw new BadRequestError("Apple OAuth credentials incomplete");
    }

    // Key is already normalized in initializeAppleCredentials, but ensure it's properly formatted
    let privateKey = this.applePrivateKey.trim();
    
    // Ensure proper PEM format with newlines
    if (!privateKey.includes("\n")) {
      // Key has no newlines, add them
      privateKey = privateKey
        .replace(/-----BEGIN PRIVATE KEY-----/, "-----BEGIN PRIVATE KEY-----\n")
        .replace(/-----BEGIN EC PRIVATE KEY-----/, "-----BEGIN EC PRIVATE KEY-----\n")
        .replace(/-----END PRIVATE KEY-----/, "\n-----END PRIVATE KEY-----")
        .replace(/-----END EC PRIVATE KEY-----/, "\n-----END EC PRIVATE KEY-----");
    } else {
      // Ensure proper newline after BEGIN
      if (privateKey.includes("-----BEGIN PRIVATE KEY-----") && !privateKey.includes("-----BEGIN PRIVATE KEY-----\n")) {
        privateKey = privateKey.replace(/-----BEGIN PRIVATE KEY-----/, "-----BEGIN PRIVATE KEY-----\n");
      }
      if (privateKey.includes("-----BEGIN EC PRIVATE KEY-----") && !privateKey.includes("-----BEGIN EC PRIVATE KEY-----\n")) {
        privateKey = privateKey.replace(/-----BEGIN EC PRIVATE KEY-----/, "-----BEGIN EC PRIVATE KEY-----\n");
      }
      // Ensure proper newline before END
      if (privateKey.includes("-----END PRIVATE KEY-----") && !privateKey.includes("\n-----END PRIVATE KEY-----")) {
        privateKey = privateKey.replace(/-----END PRIVATE KEY-----/, "\n-----END PRIVATE KEY-----");
      }
      if (privateKey.includes("-----END EC PRIVATE KEY-----") && !privateKey.includes("\n-----END EC PRIVATE KEY-----")) {
        privateKey = privateKey.replace(/-----END EC PRIVATE KEY-----/, "\n-----END EC PRIVATE KEY-----");
      }
    }
    
    // Clean up multiple consecutive newlines
    privateKey = privateKey.replace(/\n{3,}/g, "\n\n").trim();

    // Basic validation - check if key has minimum required content
    const keyContent = privateKey
      .replace(/-----BEGIN.*?-----/g, "")
      .replace(/-----END.*?-----/g, "")
      .replace(/\s/g, "");
    
    if (keyContent.length < 100) {
      throw new BadRequestError(
        "Apple private key is incomplete. " +
        "Please ensure the complete key from Apple Developer Portal is set in APPLE_PRIVATE_KEY."
      );
    }

    
    // Try to generate JWT - jwt.sign will validate the key format
    try {
      return jwt.sign(
        {
          iss: this.appleTeamId,
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 300,
          aud: "https://appleid.apple.com",
          sub: this.appleClientId,
        },
        privateKey,
        { algorithm: "ES256", keyid: this.appleKeyId }
      );
    } catch (error: any) {
      const errorMessage = error?.message || String(error);
      const errorCode = error?.code || 'UNKNOWN';
      
      // Provide helpful error message
      if (errorCode === "ERR_OSSL_UNSUPPORTED" || 
          errorMessage.includes("DECODER") || 
          errorMessage.includes("PEM") || 
          errorMessage.includes("asymmetric") ||
          errorMessage.includes("key")) {
        throw new BadRequestError(
          "Apple private key format is invalid. " +
          "Ensure the key is a valid EC private key in PEM format. " +
          "Please verify the complete key from Apple Developer Portal. " +
          "The key should start with '-----BEGIN PRIVATE KEY-----' and end with '-----END PRIVATE KEY-----'."
        );
      }
      
      throw new BadRequestError(`Failed to generate Apple client secret: ${errorMessage}`);
    }
  }

  private async verifyAppleIdToken(idToken: string): Promise<ApplePayload> {
    try {
      const { createRemoteJWKSet, jwtVerify } = await import("jose");
      const appleJWKS = createRemoteJWKSet(new URL("https://appleid.apple.com/auth/keys"));
      const { payload } = await jwtVerify(idToken, appleJWKS, {
        issuer: "https://appleid.apple.com",
        audience: this.appleClientId,
      });

      if (!payload?.sub) throw new Error("Missing subject in Apple identity token");
      return payload;
    } catch (error) {
      console.error("Failed to verify Apple ID token:", error);
      throw new BadRequestError("Apple authentication failed. Invalid identity token");
    }
  }

  private handleDatabaseError(error: any, operation: "create" | "update"): void {
    const isDuplicate = error.code === "23505" || /duplicate|unique/i.test(error.message || "");
    const isNotNull = error.code === "23502" || /not null/i.test(error.message || "");
    const isForeignKey = error.code === "23503" || /foreign key/i.test(error.message || "");

    console.error(`Error ${operation}ing OAuth user:`, { message: error.message, code: error.code, operation });

    if (isDuplicate) {
      throw new BadRequestError(
        operation === "create"
          ? "An account with this email already exists. Please use a different email or login with your existing account"
          : "Failed to update user information due to duplicate data"
      );
    }

    if (isNotNull) {
      throw new BadRequestError(
        operation === "create"
          ? "Missing required user information. Please provide all required fields"
          : "Failed to update user. Missing required information"
      );
    }

    if (isForeignKey) {
      throw new BadRequestError("Invalid user data. Please check your information and try again");
    }

    throw new BadRequestError(`Failed to ${operation} user account. Please try again`);
  }
}
