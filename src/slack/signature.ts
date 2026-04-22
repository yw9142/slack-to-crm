import { createHmac, timingSafeEqual } from 'node:crypto';

const SLACK_SIGNATURE_VERSION = 'v0';
const DEFAULT_TIMESTAMP_TOLERANCE_SECONDS = 60 * 5;

export type SlackSignatureInput = {
  signingSecret: string;
  timestamp: string;
  rawBody: string;
};

export type SlackSignatureVerificationInput = SlackSignatureInput & {
  signature?: string;
  nowSeconds?: number;
  toleranceSeconds?: number;
};

export function createSlackSignature({
  signingSecret,
  timestamp,
  rawBody,
}: SlackSignatureInput): string {
  const baseString = `${SLACK_SIGNATURE_VERSION}:${timestamp}:${rawBody}`;
  const digest = createHmac('sha256', signingSecret)
    .update(baseString)
    .digest('hex');

  return `${SLACK_SIGNATURE_VERSION}=${digest}`;
}

export function verifySlackSignature({
  signingSecret,
  timestamp,
  rawBody,
  signature,
  nowSeconds = Math.floor(Date.now() / 1000),
  toleranceSeconds = DEFAULT_TIMESTAMP_TOLERANCE_SECONDS,
}: SlackSignatureVerificationInput): boolean {
  if (!signingSecret || !timestamp || !signature) {
    return false;
  }

  const timestampSeconds = Number(timestamp);

  if (
    !Number.isFinite(timestampSeconds) ||
    Math.abs(nowSeconds - timestampSeconds) > toleranceSeconds
  ) {
    return false;
  }

  const expectedSignature = createSlackSignature({
    signingSecret,
    timestamp,
    rawBody,
  });

  return timingSafeStringEqual(expectedSignature, signature);
}

function timingSafeStringEqual(expectedValue: string, receivedValue: string) {
  const expectedBuffer = Buffer.from(expectedValue, 'utf8');
  const receivedBuffer = Buffer.from(receivedValue, 'utf8');

  if (expectedBuffer.length !== receivedBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, receivedBuffer);
}
