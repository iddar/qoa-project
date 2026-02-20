---
name: playwright-e2e
description: Build, configure, debug, and maintain end-to-end tests with Playwright Test for web apps. Use when Codex needs to set up Playwright, create or refactor E2E specs, configure projects/reporters/traces/webServer, stabilize flaky UI tests, or run cross-browser regression checks in local and CI environments.
---

# Playwright E2E

Use this skill to implement reliable browser E2E tests with Playwright Test.

## Workflow

1. Confirm scope and target
- Identify critical user journeys (auth, checkout, CRUD, permissions, navigation).
- Confirm target URL(s): local dev server or deployed environment.

2. Set up Playwright in Bun-first repos
- Install test package: `bun add -d @playwright/test`
- Install browsers: `bunx playwright install --with-deps`
- Create config if missing: `playwright.config.ts`

3. Configure stable defaults
- Use `baseURL` and `webServer` so tests can run from clean environments.
- Enable diagnostics for failures: `trace: 'on-first-retry'`, `screenshot: 'only-on-failure'`, `video: 'retain-on-failure'`.
- Configure retries only where needed (typically CI).

4. Write tests with resilient selectors
- Prefer `getByRole`, `getByLabel`, `getByTestId`.
- Avoid brittle CSS/XPath tied to styling or DOM depth.
- Use web-first assertions (`await expect(...)`) instead of manual sleeps.

5. Run, debug, and harden
- Fast check: `bunx playwright test`
- Interactive debug: `bunx playwright test --ui`
- Visible browser: `bunx playwright test --headed`
- Narrow failures to spec/test/project before changing assertions.

6. Report results clearly
- Summarize pass/fail and impacted flows.
- If flaky: document likely root cause and the concrete stabilization applied.

## Authoring Rules

- Keep one business behavior per test.
- Keep test names task-oriented ("user can reset password").
- Use fixtures/helpers for repeated setup.
- Do not use `waitForTimeout` unless there is no deterministic signal.
- Prefer `test.step()` for longer journeys to improve trace readability.

## Minimal Project Conventions

- Default test location: `./global/e2e/**/*.spec.ts`.
- Keep shared helpers in `./global/e2e/support/`.
- Store auth bootstrap under `./global/e2e/auth/` when session reuse is needed.

## References

- Read `references/playwright-e2e-guide.md` for:
- Bun-first command cheatsheet
- Baseline `playwright.config.ts`
- Example E2E spec and fixture patterns
- Flake diagnosis checklist
- CI execution patterns
