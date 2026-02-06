declare module 'elysia' {
  export class Elysia {
    server?: {
      hostname?: string;
      port?: number;
    };
    constructor(options?: Record<string, unknown>);

    use(plugin: unknown): this;

    get<TContext>(
      path: string,
      handler: (context: TContext) => unknown | Promise<unknown>,
      options?: Record<string, unknown>,
    ): this;

    post<TContext>(
      path: string,
      handler: (context: TContext) => unknown | Promise<unknown>,
      options?: Record<string, unknown>,
    ): this;

    patch<TContext>(
      path: string,
      handler: (context: TContext) => unknown | Promise<unknown>,
      options?: Record<string, unknown>,
    ): this;

    derive<T>(factory: () => T): this;

    decorate<T>(name: string, value: T): this;

    macro<TContext, TResult>(factory: (context: TContext) => TResult): this;

    listen(port: number | string, callback?: () => void): this;
  }

  export const t: {
    Object: (schema: Record<string, unknown>) => unknown;
    Optional: (schema: unknown) => unknown;
    String: (options?: Record<string, unknown>) => unknown;
    Number: (options?: Record<string, unknown>) => unknown;
    Integer: (options?: Record<string, unknown>) => unknown;
    Boolean: (options?: Record<string, unknown>) => unknown;
    Array: (schema: unknown) => unknown;
    Union: (schemas: unknown[]) => unknown;
    Literal: (value: string) => unknown;
    Enum: (values: readonly string[]) => unknown;
  };
}

declare module '@elysiajs/cors' {
  export const cors: (options?: Record<string, unknown>) => unknown;
}

declare module '@elysiajs/jwt' {
  export const jwt: (options: { name?: string; secret: string }) => unknown;
}

declare module '@elysiajs/openapi' {
  export const openapi: (options?: Record<string, unknown>) => unknown;
}

declare module '@elysiajs/eden' {
  export const treaty: <TApp>(app: TApp) => any;
}

declare module 'logestic' {
  export const Logestic: {
    preset: (name: string) => unknown;
  };
}

declare module 'drizzle-orm' {
  export const and: (...conditions: unknown[]) => unknown;
  export const or: (...conditions: unknown[]) => unknown;
  export const eq: (left: unknown, right: unknown) => unknown;
  export const ne: (left: unknown, right: unknown) => unknown;
  export const lt: (left: unknown, right: unknown) => unknown;
  export const gt: (left: unknown, right: unknown) => unknown;
  export const isNull: (value: unknown) => unknown;
  export const desc: (value: unknown) => unknown;
  export const sql: <T = unknown>(strings: TemplateStringsArray, ...values: unknown[]) => T;
}

declare module 'drizzle-orm/bun-sql' {
  export const drizzle: (client: unknown) => unknown;
}

declare module 'drizzle-orm/pg-core' {
  type ColumnBuilder = {
    notNull: () => ColumnBuilder;
    default: (value: unknown) => ColumnBuilder;
    defaultNow: () => ColumnBuilder;
    primaryKey: () => ColumnBuilder;
    references: (fn: () => unknown, options?: Record<string, unknown>) => ColumnBuilder;
    array: () => ColumnBuilder;
  };

  export const index: (name: string) => { on: (...columns: unknown[]) => unknown };
  export const uniqueIndex: (name: string) => { on: (...columns: unknown[]) => { where: (condition: unknown) => unknown } };
  export const integer: (name: string) => ColumnBuilder;
  export const serial: (name: string) => ColumnBuilder;
  export const pgEnum: (name: string, values: readonly string[]) => (columnName: string) => ColumnBuilder;
  export const pgTable: <TColumns extends Record<string, unknown>>(
    name: string,
    columns: TColumns,
    extraConfig?: (table: TColumns) => unknown,
  ) => TColumns & { $inferSelect: Record<string, unknown> };
  export const text: (name: string) => ColumnBuilder;
  export const timestamp: (name: string, options?: Record<string, unknown>) => ColumnBuilder;
  export const uuid: (name: string) => ColumnBuilder;
  export const varchar: (name: string, options?: Record<string, unknown>) => ColumnBuilder;
  export const boolean: (name: string) => ColumnBuilder;
}

declare module 'drizzle-kit' {
  export const defineConfig: (config: Record<string, unknown>) => Record<string, unknown>;
}

declare module 'bun' {
  export class SQL {
    constructor(connectionString: string);
  }
}

declare module 'bun:test' {
  export const describe: (name: string, fn: () => void) => void;
  export const it: (name: string, fn: () => void | Promise<void>) => void;
  export const test: (name: string, fn: () => void | Promise<void>) => void;
  type ExpectMatchers = {
    toBe: (expected: unknown) => void;
    toBeTruthy: () => void;
    toContain: (expected: unknown) => void;
    toBeUndefined: () => void;
    toMatch: (expected: unknown) => void;
    toThrow: (expected?: unknown) => void;
  };

  export const expect: (value: unknown) => ExpectMatchers & { not: ExpectMatchers };
}

declare module 'node:crypto' {
  export const createHash: (algorithm: string) => { update: (data: string) => { digest: (encoding: string) => string } };
  export const randomBytes: (size: number) => { toString: (encoding: string) => string };
}
