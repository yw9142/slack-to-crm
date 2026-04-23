import type { RoutePayload } from 'twenty-sdk/define';

import {
  getHeaderValue,
  getRouteRawBody,
  getStringField,
  isJsonObject,
  parseJsonObject,
} from 'src/slack/payload';
import { verifySlackSignature } from 'src/slack/signature';

export const SLACK_FORWARDED_REQUEST_HEADERS = [
  'content-type',
  'x-slack-signature',
  'x-slack-request-timestamp',
  'x-slack-retry-num',
  'x-slack-retry-reason',
];

export type SlackRouteSignatureResult =
  | { ok: true }
  | { ok: false; statusCode: number; message: string };

export function isSlackRetryRequest(event: RoutePayload<unknown>): boolean {
  return getHeaderValue(event.headers, 'x-slack-retry-num') !== undefined;
}

export function verifySlackRouteSignature(
  event: RoutePayload<unknown>,
): SlackRouteSignatureResult {
  const signingSecret = process.env.SLACK_SIGNING_SECRET;

  if (!signingSecret) {
    return {
      ok: false,
      statusCode: 500,
      message: 'SLACK_SIGNING_SECRET is not configured',
    };
  }

  const signature = getHeaderValue(event.headers, 'x-slack-signature');
  const timestamp = getHeaderValue(event.headers, 'x-slack-request-timestamp');

  const isVerified = verifySlackSignature({
    signingSecret,
    signature,
    timestamp: timestamp ?? '',
    rawBody: getRouteRawBody(event),
  });

  if (isVerified || verifySlackLegacyToken(event.body)) {
    return { ok: true };
  }

  return { ok: false, statusCode: 401, message: 'Invalid Slack signature' };
}

function verifySlackLegacyToken(body: unknown): boolean {
  const verificationToken = process.env.SLACK_VERIFICATION_TOKEN;

  return Boolean(
    verificationToken && getSlackLegacyToken(body) === verificationToken,
  );
}

function getSlackLegacyToken(body: unknown): string | undefined {
  if (isJsonObject(body)) {
    const token = getStringField(body, 'token');

    if (token) {
      return token;
    }

    const payload = getStringField(body, 'payload');

    if (payload) {
      return getStringField(parseJsonObject(payload), 'token');
    }
  }

  if (typeof body !== 'string') {
    return undefined;
  }

  const searchParams = new URLSearchParams(body);
  const token = searchParams.get('token');

  if (token) {
    return token;
  }

  const payload = searchParams.get('payload');

  if (!payload) {
    return undefined;
  }

  return getStringField(parseJsonObject(payload), 'token');
}
