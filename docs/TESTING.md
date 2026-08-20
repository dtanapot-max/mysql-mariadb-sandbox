# Testing

- `npm test` — unit, adversarial, automation, AI workflow, UI contract and final-gate regression tests.
- `npm run test:coverage` — Node built-in coverage for the main engine/control suites.
- `npm run benchmark` — deterministic regression benchmark; not a comparison with real MySQL.
- `npm run test:long` — long-run operation/state/evidence test.
- `npm run test:browser` — Playwright Chromium IndexedDB save -> real page reload -> new Core instance -> load verification.
- `npm run verify:final` — complete local verification when Playwright Chromium is installed.

Windows users can also use `RUN-TESTS.bat`, `RUN-BROWSER-VERIFY.bat` and `RUN-FINAL-VERIFY.bat`.
