import type { Tokens } from 'app-request';

const MOBILE_OAUTH_REDIRECT_PATTERNS = [
  /^themoviestudio:\/\/auth\/success(\?.*)?$/i,
  /^themoviestudio:\/\/auth\/error(\?.*)?$/i,
  /^movie-studio:\/\/auth\/success(\?.*)?$/i,
  /^movie-studio:\/\/auth\/error(\?.*)?$/i,
  /^exp:\/\/[\w.\-]+(:\d+)?\/--\/auth\/success(\?.*)?$/i,
  /^exp:\/\/[\w.\-]+(:\d+)?\/--\/auth\/error(\?.*)?$/i,
];

const WEB_OAUTH_REDIRECT_PATTERNS = [
  /^https?:\/\/.+/i,
];

/**
 * Validate OAuth post-login redirect targets (mobile deep links + allowed web URLs).
 */
export function isAllowlistedOAuthRedirectUri(redirectUri: string): boolean {
  const trimmed = redirectUri.trim();
  if (!trimmed) return false;

  return [...MOBILE_OAUTH_REDIRECT_PATTERNS, ...WEB_OAUTH_REDIRECT_PATTERNS].some(
    (pattern) => pattern.test(trimmed)
  );
}

/**
 * Build mobile success redirect URL with tokens in query string.
 */
export function buildMobileOAuthSuccessUrl(
  redirectUri: string,
  tokens: Tokens,
  user?: Record<string, unknown>
): string {
  const base = redirectUri.split('?')[0];
  const params = new URLSearchParams();
  params.set('accessToken', tokens.accessToken);
  params.set('refreshToken', tokens.refreshToken);

  if (user) {
    params.set('user', JSON.stringify(user));
  }

  return `${base}?${params.toString()}`;
}

/**
 * Derive mobile error deep link from success redirect_uri or explicit error_redirect_uri.
 */
export function buildMobileOAuthErrorUrl(
  redirectUri: string,
  message: string,
  errorRedirectUri?: string
): string {
  const explicitErrorUri = errorRedirectUri?.trim();
  let target: string;

  if (explicitErrorUri && isAllowlistedOAuthRedirectUri(explicitErrorUri)) {
    target = explicitErrorUri.split('?')[0];
  } else {
    const withoutQuery = redirectUri.trim().split('?')[0];
    const errorBase = withoutQuery.replace(/\/auth\/success$/i, '/auth/error');
    target = errorBase !== withoutQuery ? errorBase : 'themoviestudio://auth/error';
  }

  const params = new URLSearchParams();
  params.set('error', message);
  params.set('message', message);

  return `${target}?${params.toString()}`;
}

export interface OAuthStatePayload {
  affiliateCode?: string;
  redirectUri?: string;
  errorRedirectUri?: string;
}

/**
 * Encode OAuth state (optional mobile redirect targets).
 */
export function encodeOAuthState(options?: {
  affiliateCode?: string;
  redirectUri?: string;
  errorRedirectUri?: string;
}): string {
  const nonce = Math.random().toString(36).substring(7);
  const affiliateCode = options?.affiliateCode?.trim();
  const redirectUri = options?.redirectUri?.trim();
  const errorRedirectUri = options?.errorRedirectUri?.trim();

  if (!affiliateCode && !redirectUri && !errorRedirectUri) {
    return nonce;
  }

  if (affiliateCode && !redirectUri && !errorRedirectUri) {
    return Buffer.from(`${affiliateCode}|${nonce}`).toString('base64');
  }

  return Buffer.from(
    JSON.stringify({
      a: affiliateCode || undefined,
      r: redirectUri || undefined,
      e: errorRedirectUri || undefined,
      n: nonce,
    })
  ).toString('base64');
}

/**
 * Parse OAuth state from provider callback.
 */
export function parseOAuthState(state?: string): OAuthStatePayload {
  if (!state?.trim()) {
    return {};
  }

  try {
    const decoded = Buffer.from(state, 'base64').toString('utf-8');

    if (decoded.startsWith('{')) {
      const parsed = JSON.parse(decoded) as {
        a?: string;
        r?: string;
        e?: string;
        affiliateCode?: string;
        redirectUri?: string;
        errorRedirectUri?: string;
      };

      return {
        affiliateCode: parsed.a || parsed.affiliateCode || undefined,
        redirectUri: parsed.r || parsed.redirectUri || undefined,
        errorRedirectUri: parsed.e || parsed.errorRedirectUri || undefined,
      };
    }

    const parts = decoded.split('|');
    if (parts.length === 2 && parts[0].trim()) {
      return { affiliateCode: parts[0].trim() };
    }
  } catch {
    // Legacy random-only state
  }

  return {};
}
