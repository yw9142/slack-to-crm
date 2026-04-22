export type RouteResponse = {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
};

export function jsonRouteResponse(
  statusCode: number,
  body: Record<string, unknown>,
): RouteResponse {
  return {
    statusCode,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  };
}

export function textRouteResponse(statusCode: number, body: string): RouteResponse {
  return {
    statusCode,
    headers: { 'content-type': 'text/plain' },
    body,
  };
}

export function slackAcknowledgementResponse(text: string): RouteResponse {
  return jsonRouteResponse(200, {
    response_type: 'ephemeral',
    text,
  });
}
