import { randomBytes } from 'crypto';

export type AppBridgeSession = {
  user: unknown;
  tokens: { accessToken: string; refreshToken: string };
  isMember: boolean;
  requiresPlan: boolean;
  membership: unknown;
};

type Entry = {
  userId: string;
  expiresAt: number;
  pending?: Promise<AppBridgeSession>;
  result?: AppBridgeSession;
};

const TTL_MS = 10 * 60 * 1000;
const codes = new Map<string, Entry>();

function sweep(now = Date.now()) {
  for (const [code, entry] of codes) {
    if (entry.expiresAt <= now) codes.delete(code);
  }
}

/** One-time-ish code so the website can sign in the app user without a password. */
export function issueAppBridgeCode(userId: string) {
  sweep();
  const code = randomBytes(32).toString('hex');
  codes.set(code, { userId, expiresAt: Date.now() + TTL_MS });
  return { code, expiresInSec: Math.round(TTL_MS / 1000) };
}

/**
 * First call creates the web session. Repeats inside the TTL return the same
 * session so a page refresh does not mint a second login.
 */
export function resolveAppBridge(
  code: string,
  issue: (userId: string) => Promise<AppBridgeSession>,
): Promise<AppBridgeSession | null> {
  const entry = codes.get(code);
  if (!entry || entry.expiresAt <= Date.now()) {
    if (entry) codes.delete(code);
    return Promise.resolve(null);
  }
  if (entry.result) return Promise.resolve(entry.result);
  if (!entry.pending) {
    entry.pending = issue(entry.userId)
      .then(result => {
        entry.result = result;
        entry.pending = undefined;
        return result;
      })
      .catch(error => {
        entry.pending = undefined;
        throw error;
      });
  }
  return entry.pending;
}
