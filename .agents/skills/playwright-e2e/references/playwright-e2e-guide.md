# Playwright E2E Guide

## Quick Commands (Bun-first)

- Install Playwright Test: `bun add -d @playwright/test`
- Install browser binaries: `bunx playwright install --with-deps`
- Run full suite: `bunx playwright test`
- Run one file: `bunx playwright test tests/e2e/auth/login.spec.ts`
- Run by title: `bunx playwright test -g "user can sign in"`
- UI mode: `bunx playwright test --ui`
- Headed mode: `bunx playwright test --headed`
- Show HTML report: `bunx playwright show-report`

## Baseline Config

```ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['html', { open: 'never' }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: {
    command: 'bun run dev',
    url: 'http://127.0.0.1:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
```

## Example Spec

```ts
import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test('user can sign in', async ({ page }) => {
    await page.goto('/login');

    await page.getByLabel('Email').fill('qa@example.com');
    await page.getByLabel('Password').fill('super-secret');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page).toHaveURL(/dashboard/);
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  });
});
```

## Selector Priority

1. `getByRole` (most user-centric and accessible)
2. `getByLabel` and `getByPlaceholder`
3. `getByTestId` for dynamic widgets
4. CSS selectors only as last resort

## Flake Triage Checklist

1. Check if locator is ambiguous.
2. Replace manual timeout with a deterministic assertion.
3. Wait on URL/network/UI state instead of elapsed time.
4. Keep isolation: no cross-test data dependencies.
5. Re-run failed test with trace and headed mode.

## CI Guidance

- Keep `forbidOnly: true` in CI.
- Use retries in CI only.
- Upload HTML report and traces as artifacts.
- Keep worker count conservative in shared runners.
