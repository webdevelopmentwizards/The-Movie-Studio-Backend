import axios from 'axios';
import { BadRequestError } from '../core/ApiError';
import Logger from '../core/Logger';

export type AppleTransactionClaims = {
  transactionId: string;
  originalTransactionId: string;
  productId: string;
  bundleId?: string;
  expiresDate?: number;
  purchaseDate?: number;
  type?: string;
  environment?: string;
};

const EXPECTED_BUNDLE_ID = 'com.themoviestudio.app';

function decodeJwsPayload(jws: string): Record<string, unknown> {
  const parts = jws.split('.');
  if (parts.length < 2) {
    throw new BadRequestError('Invalid Apple purchase token.');
  }
  const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
  const padded = payload + '='.repeat((4 - (payload.length % 4)) % 4);
  try {
    const json = Buffer.from(padded, 'base64').toString('utf8');
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    throw new BadRequestError('Unable to decode Apple purchase token.');
  }
}

/**
 * Prefer StoreKit 2 JWS (`purchaseToken`). Falls back to legacy verifyReceipt
 * when `APPLE_IAP_SHARED_SECRET` is set and only a raw receipt is provided.
 */
export async function verifyApplePurchasePayload(input: {
  productId: string;
  transactionId: string;
  originalTransactionId?: string;
  purchaseToken?: string;
}): Promise<AppleTransactionClaims> {
  const token = String(input.purchaseToken || '').trim();

  if (token.includes('.')) {
    const claims = decodeJwsPayload(token);
    const productId = String(claims.productId || '');
    const transactionId = String(claims.transactionId || '');
    const originalTransactionId = String(
      claims.originalTransactionId || transactionId,
    );
    const bundleId = claims.bundleId ? String(claims.bundleId) : undefined;

    if (!productId || !transactionId) {
      throw new BadRequestError('Apple purchase token is incomplete.');
    }
    if (productId !== input.productId) {
      throw new BadRequestError('Apple product does not match the purchase.');
    }
    if (
      input.transactionId &&
      transactionId !== String(input.transactionId).trim()
    ) {
      throw new BadRequestError('Apple transaction id mismatch.');
    }
    if (bundleId && bundleId !== EXPECTED_BUNDLE_ID) {
      throw new BadRequestError('Apple purchase is for a different app.');
    }

    return {
      transactionId,
      originalTransactionId,
      productId,
      bundleId,
      expiresDate:
        typeof claims.expiresDate === 'number'
          ? claims.expiresDate
          : claims.expiresDate
            ? Number(claims.expiresDate)
            : undefined,
      purchaseDate:
        typeof claims.purchaseDate === 'number'
          ? claims.purchaseDate
          : claims.purchaseDate
            ? Number(claims.purchaseDate)
            : undefined,
      type: claims.type ? String(claims.type) : undefined,
      environment: claims.environment
        ? String(claims.environment)
        : undefined,
    };
  }

  const sharedSecret = String(process.env.APPLE_IAP_SHARED_SECRET || '').trim();
  if (!sharedSecret || !token) {
    // Still accept explicit ids from a trusted logged-in client when JWS is
    // unavailable (e.g. restore edge cases). Prefer configuring shared secret.
    Logger.warn(
      'Apple IAP JWS missing and APPLE_IAP_SHARED_SECRET unset; using client transaction ids.',
    );
    return {
      transactionId: String(input.transactionId).trim(),
      originalTransactionId: String(
        input.originalTransactionId || input.transactionId,
      ).trim(),
      productId: String(input.productId).trim(),
    };
  }

  const body = {
    'receipt-data': token,
    password: sharedSecret,
    'exclude-old-transactions': true,
  };

  const endpoints = [
    'https://buy.itunes.apple.com/verifyReceipt',
    'https://sandbox.itunes.apple.com/verifyReceipt',
  ];

  let lastStatus: number | null = null;
  for (const url of endpoints) {
    const { data } = await axios.post(url, body, { timeout: 20000 });
    lastStatus = Number(data?.status);
    // 21007 = sandbox receipt sent to production
    if (lastStatus === 21007) continue;
    if (lastStatus !== 0) {
      throw new BadRequestError(
        `Apple receipt verification failed (status ${lastStatus}).`,
      );
    }

    const latest =
      (Array.isArray(data?.latest_receipt_info) &&
        data.latest_receipt_info[0]) ||
      (Array.isArray(data?.receipt?.in_app) && data.receipt.in_app[0]);

    if (!latest) {
      throw new BadRequestError('Apple receipt has no subscription info.');
    }

    const productId = String(latest.product_id || '');
    const transactionId = String(latest.transaction_id || '');
    if (productId !== input.productId) {
      throw new BadRequestError('Apple product does not match the receipt.');
    }

    return {
      transactionId,
      originalTransactionId: String(
        latest.original_transaction_id || transactionId,
      ),
      productId,
      expiresDate: latest.expires_date_ms
        ? Number(latest.expires_date_ms)
        : undefined,
      purchaseDate: latest.purchase_date_ms
        ? Number(latest.purchase_date_ms)
        : undefined,
      environment: data?.environment,
    };
  }

  throw new BadRequestError(
    `Apple receipt verification failed (status ${lastStatus}).`,
  );
}
