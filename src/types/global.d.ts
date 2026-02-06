declare global {
  const process: {
    env: Record<string, string | undefined>;
    uptime: () => number;
  };

  const Bun: {
    password: {
      hash: (value: string) => Promise<string>;
      verify: (value: string, hash: string) => Promise<boolean>;
    };
  };
}

export {};
