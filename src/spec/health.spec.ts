import { describe, expect, it } from "bun:test";
import { createApp } from "../app";

describe("Health module", () => {
  const app = createApp();

  it("returns ok status and uptime metadata", async () => {
    const response = await app.handle(new Request("http://localhost/health"));

    expect(response.status).toBe(200);

    const payload = (await response.json()) as {
      status: string;
      uptime: number;
      timestamp: string;
    };

    expect(payload.status).toBe("ok");
    expect(typeof payload.uptime).toBe("number");
    expect(() => new Date(payload.timestamp)).not.toThrow();
  });
});
