export const TRACE_HEADER = 'x-trace-id';
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

type HookContext = {
  request: Request;
  set: {
    headers: Record<string, string>;
  };
  store: Record<string, unknown>;
};

type MapResponseContext = HookContext & {
  response: unknown;
};

type ErrorContext = HookContext & {
  code: string;
  error: Error;
  path: string;
};

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const isErrorEnvelope = (value: unknown): value is ErrorEnvelope => {
  if (!isObject(value)) {
    return false;
  }

  const maybeError = value.error;
  return isObject(maybeError) && typeof maybeError.code === 'string' && typeof maybeError.message === 'string';
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

const enrichWithTraceMeta = (value: ErrorEnvelope, traceId: string): ErrorEnvelope => ({
  ...value,
  meta: {
    requestId: traceId,
    traceId,
  },
});

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

export const registerTraceContext = ({ request, set, store }: HookContext) => {
  const traceId = toTraceId(request);
  store.traceId = traceId;
  set.headers[TRACE_HEADER] = traceId;
};

export const attachTraceToErrorResponses = (context: MapResponseContext) => {
  const traceId = typeof context.store.traceId === 'string' ? context.store.traceId : toTraceId(context.request);
  context.set.headers[TRACE_HEADER] = traceId;

  if (isErrorEnvelope(context.response)) {
    return enrichWithTraceMeta(context.response, traceId);
  }
};

export const normalizeUnhandledErrors = ({ code, error, path, request, set, store }: ErrorContext) => {
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
};
