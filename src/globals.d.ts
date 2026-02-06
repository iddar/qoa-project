// Global type declarations

// Node.js process global
declare const process: {
  env: Record<string, string | undefined>;
  [key: string]: any;
};

// Bun runtime globals
declare const Bun: any;

// Node.js crypto global (used by Bun)
declare const crypto: Crypto;

// Standard Web API types
interface Crypto {
  randomUUID(): string;
}
