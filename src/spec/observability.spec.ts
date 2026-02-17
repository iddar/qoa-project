import { describe, expect, it } from 'bun:test';
import { createApp } from '../app';

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

type ValidationErrorResponse = {
  type: string;
  message: string;
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

    const payload = (await response.json()) as ValidationErrorResponse;

    expect(response.status).toBe(422);
    expect(payload.type).toBe('validation');
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
});
