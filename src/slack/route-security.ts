import type { RoutePayload } from 'twenty-sdk/define';

import { getHeaderValue, getRouteRawBody } from 'src/slack/payload';
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

  if (!isVerified) {
    return { ok: false, statusCode: 401, message: 'Invalid Slack signature' };
  }

  return { ok: true };
}
