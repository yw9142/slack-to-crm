import { timingSafeEqual } from 'node:crypto';
import type { IncomingHttpHeaders } from 'node:http';

const normalizeHeader = (
  headers: IncomingHttpHeaders,
  name: string,
): string | undefined => {
  const value = headers[name.toLowerCase()];

  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
};

const timingSafeStringEqual = (left: string, right: string): boolean => {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
};

export const isAuthorizedRequest = (
  headers: IncomingHttpHeaders,
  sharedSecret: string,
): boolean => {
  const authorization = normalizeHeader(headers, 'authorization');
  const headerSecret = normalizeHeader(headers, 'x-slack-agent-secret');
  const sharedSecretHeader = normalizeHeader(
    headers,
    'x-slack-agent-shared-secret',
  );
  const bearerToken = authorization?.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length)
    : undefined;
  const providedSecret = bearerToken ?? headerSecret ?? sharedSecretHeader;

  if (providedSecret === undefined) {
    return false;
  }

  return timingSafeStringEqual(providedSecret, sharedSecret);
};
