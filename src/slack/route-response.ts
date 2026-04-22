export type RouteResponse = Record<string, unknown> | string;

export function jsonRouteResponse(
  _statusCode: number,
  body: Record<string, unknown>,
): RouteResponse {
  return body;
}

export function textRouteResponse(_statusCode: number, body: string): RouteResponse {
  return body;
}

export function slackAcknowledgementResponse(text: string): RouteResponse {
  return {
    response_type: 'ephemeral',
    text,
  };
}
