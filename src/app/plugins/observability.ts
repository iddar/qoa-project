import { Elysia } from 'elysia';

const TRACE_HEADER = 'x-trace-id';
const REQUEST_ID_HEADER = 'x-request-id';

type ErrorEnvelope = {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta?: {
    requestId: string;
    traceId: string;
  };
};

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const isErrorEnvelope = (value: unknown): value is ErrorEnvelope => {
  if (!isObject(value)) {
    return false;
  }

  const maybeError = value.error;
  if (!isObject(maybeError)) {
    return false;
  }

  return typeof maybeError.code === 'string' && typeof maybeError.message === 'string';
};

const toTraceId = (request: Request) => {
  const fromTraceHeader = request.headers.get(TRACE_HEADER);
  if (fromTraceHeader && fromTraceHeader.trim().length > 0) {
    return fromTraceHeader.trim();
  }

  const fromRequestId = request.headers.get(REQUEST_ID_HEADER);
  if (fromRequestId && fromRequestId.trim().length > 0) {
    return fromRequestId.trim();
  }

  return crypto.randomUUID();
};

const enrichWithTraceMeta = (value: ErrorEnvelope, traceId: string): ErrorEnvelope => {
  if (value.meta?.traceId && value.meta.requestId) {
    return value;
  }

  return {
    ...value,
    meta: {
      requestId: traceId,
      traceId,
    },
  };
};

const mapErrorCode = (code: string) => {
  if (code === 'VALIDATION' || code === 'PARSE') {
    return 400;
  }

  if (code === 'NOT_FOUND') {
    return 404;
  }

  return 500;
};

const mapErrorPayload = (code: string, error: Error): ErrorEnvelope => {
  if (code === 'VALIDATION') {
    return {
      error: {
        code: 'INVALID_ARGUMENT',
        message: 'Solicitud inválida',
        details: error.message,
      },
    };
  }

  if (code === 'PARSE') {
    return {
      error: {
        code: 'INVALID_JSON',
        message: 'Body JSON inválido',
      },
    };
  }

  if (code === 'NOT_FOUND') {
    return {
      error: {
        code: 'NOT_FOUND',
        message: 'Recurso no encontrado',
      },
    };
  }

  return {
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Error interno del servidor',
    },
  };
};

export const observabilityPlugin = new Elysia({ name: 'observability' })
  .onRequest(({ request, set, store }) => {
    const traceId = toTraceId(request);
    store.traceId = traceId;
    set.headers[TRACE_HEADER] = traceId;
  })
  .mapResponse(async ({ response, store, set }) => {
    const traceId = typeof store.traceId === 'string' ? store.traceId : crypto.randomUUID();
    set.headers[TRACE_HEADER] = traceId;

    if (response instanceof Response) {
      const responseHeaders = new Headers(response.headers);
      responseHeaders.set(TRACE_HEADER, traceId);

      if (!responseHeaders.get('content-type')?.includes('application/json')) {
        return new Response(response.body, {
          status: response.status,
          headers: responseHeaders,
        });
      }

      const rawBody = await response.text();
      if (!rawBody) {
        return new Response(rawBody, {
          status: response.status,
          headers: responseHeaders,
        });
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(rawBody);
      } catch {
        return new Response(rawBody, {
          status: response.status,
          headers: responseHeaders,
        });
      }

      if (isErrorEnvelope(parsed)) {
        return new Response(JSON.stringify(enrichWithTraceMeta(parsed, traceId)), {
          status: response.status,
          headers: responseHeaders,
        });
      }

      if (response.status === 422) {
        return new Response(
          JSON.stringify(enrichWithTraceMeta(mapErrorPayload('VALIDATION', new Error('VALIDATION')), traceId)),
          {
            status: response.status,
            headers: responseHeaders,
          },
        );
      }

      return new Response(rawBody, {
        status: response.status,
        headers: responseHeaders,
      });
    }

    if (!isErrorEnvelope(response)) {
      return;
    }

    return enrichWithTraceMeta(response, traceId);
  })
  .onError(({ code, error, path, request, set, store }) => {
    const traceId = typeof store.traceId === 'string' ? store.traceId : toTraceId(request);
    set.headers[TRACE_HEADER] = traceId;

    const statusCode = mapErrorCode(code);
    const payload = enrichWithTraceMeta(mapErrorPayload(code, error), traceId);

    console.error(`[trace:${traceId}] ${request.method} ${path} -> ${statusCode} (${code})`);

    return new Response(JSON.stringify(payload), {
      status: statusCode,
      headers: {
        'content-type': 'application/json',
        [TRACE_HEADER]: traceId,
      },
    });
  });
