import { describe, expect, it } from 'bun:test';
import { Elysia } from 'elysia';
import { createApp } from '../app';
import {
  attachTraceToErrorResponses,
  normalizeUnhandledErrors,
  registerTraceContext,
} from '../app/plugins/observability';

type ErrorResponse = {
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

const app = createApp();

describe('Observability middleware', () => {
  it('propagates incoming trace id and enriches validation errors', async () => {
    const traceId = 'trace-validation-flow';
    const response = await app.handle(
      new Request('http://e.ly/v1/auth/login', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-trace-id': traceId,
        },
        body: JSON.stringify({
          email: 'invalid-email',
          password: '123',
        }),
      }),
    );

    const payload = (await response.json()) as ErrorResponse;

    expect(response.status).toBe(400);
    expect(payload.error.code).toBe('INVALID_ARGUMENT');
    expect(payload.meta?.traceId).toBe(traceId ?? undefined);
    expect(payload.meta?.requestId).toBe(traceId ?? undefined);
    expect(response.headers.get('x-trace-id')).toBe(traceId);
  });

  it('adds trace metadata to handled business errors', async () => {
    const response = await app.handle(
      new Request('http://e.ly/v1/auth/login', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          email: `missing_${crypto.randomUUID()}@qoa.test`,
          password: 'Password123!',
        }),
      }),
    );

    const payload = (await response.json()) as ErrorResponse;
    const traceId = response.headers.get('x-trace-id');

    expect(response.status).toBe(401);
    expect(payload.error.code).toBe('UNAUTHORIZED');
    expect(Boolean(traceId)).toBe(true);
  });

  it('normalizes unhandled errors with trace metadata', async () => {
    const failingApp = new Elysia()
      .onRequest(registerTraceContext)
      .mapResponse(attachTraceToErrorResponses)
      .onError(normalizeUnhandledErrors)
      .get('/boom', () => {
        throw new Error('boom');
      });

    const response = await failingApp.handle(new Request('http://e.ly/boom'));
    const payload = (await response.json()) as ErrorResponse;
    const traceId = response.headers.get('x-trace-id');

    expect(response.status).toBe(500);
    expect(payload.error.code).toBe('INTERNAL_ERROR');
    expect(payload.meta?.traceId).toBe(traceId ?? undefined);
    expect(payload.meta?.requestId).toBe(traceId ?? undefined);
    expect(Boolean(traceId)).toBe(true);
  });
});
