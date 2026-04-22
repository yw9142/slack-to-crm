import type { RoutePayload } from 'twenty-sdk/define';

import type { JsonObject } from 'src/slack/types';

export function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function getStringField(
  record: JsonObject,
  fieldName: string,
): string | undefined {
  const value = record[fieldName];

  return typeof value === 'string' ? value : undefined;
}

export function getJsonObjectField(
  record: JsonObject,
  fieldName: string,
): JsonObject | undefined {
  const value = record[fieldName];

  return isJsonObject(value) ? value : undefined;
}

export function getJsonObjectArrayField(
  record: JsonObject,
  fieldName: string,
): JsonObject[] {
  const value = record[fieldName];

  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isJsonObject);
}

export function parseJsonObject(value: unknown): JsonObject {
  if (isJsonObject(value)) {
    return value;
  }

  if (typeof value !== 'string' || value.trim() === '') {
    return {};
  }

  const parsed = JSON.parse(value) as unknown;

  return isJsonObject(parsed) ? parsed : {};
}

export function getHeaderValue(
  headers: Record<string, string | undefined>,
  headerName: string,
): string | undefined {
  const normalizedHeaderName = headerName.toLowerCase();

  return (
    headers[normalizedHeaderName] ??
    Object.entries(headers).find(
      ([candidateHeaderName]) =>
        candidateHeaderName.toLowerCase() === normalizedHeaderName,
    )?.[1]
  );
}

export function getRouteRawBody(event: RoutePayload<unknown>): string {
  if (event.isBase64Encoded && typeof event.body === 'string') {
    return Buffer.from(event.body, 'base64').toString('utf8');
  }

  if (typeof event.body === 'string') {
    return event.body;
  }

  if (event.body === null || event.body === undefined) {
    return '';
  }

  if (isJsonObject(event.body) && isFormUrlEncodedRoute(event)) {
    return new URLSearchParams(
      Object.entries(event.body).flatMap(([key, value]) =>
        typeof value === 'string' ? [[key, value]] : [],
      ),
    ).toString();
  }

  return JSON.stringify(event.body);
}

function isFormUrlEncodedRoute(event: RoutePayload<unknown>): boolean {
  return (
    getHeaderValue(event.headers, 'content-type')
      ?.toLowerCase()
      .includes('application/x-www-form-urlencoded') ?? false
  );
}

export function parseFormBody(body: unknown): URLSearchParams {
  if (typeof body === 'string') {
    return new URLSearchParams(body);
  }

  if (!isJsonObject(body)) {
    return new URLSearchParams();
  }

  const searchParams = new URLSearchParams();

  Object.entries(body).forEach(([key, value]) => {
    if (typeof value === 'string') {
      searchParams.set(key, value);
    }
  });

  return searchParams;
}

export function formBodyToJsonObject(searchParams: URLSearchParams): JsonObject {
  const payload: JsonObject = {};

  searchParams.forEach((value, key) => {
    payload[key] = value;
  });

  return payload;
}
