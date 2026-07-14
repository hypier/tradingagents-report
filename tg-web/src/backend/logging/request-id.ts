import type { MiddlewareHandler } from 'hono';

export type RequestIdEnvironment = {
  Variables: {
    requestId: string;
  };
};

function isValidRequestId(value: string | undefined): value is string {
  return value !== undefined && value.length > 0 && value.length <= 128;
}

export function createRequestIdMiddleware(): MiddlewareHandler<RequestIdEnvironment> {
  return async (context, next) => {
    const inboundRequestId = context.req.header('x-request-id');
    const requestId = isValidRequestId(inboundRequestId)
      ? inboundRequestId
      : crypto.randomUUID();

    context.set('requestId', requestId);
    await next();
    context.header('x-request-id', requestId);
  };
}
