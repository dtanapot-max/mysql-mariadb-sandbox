# Contributing

Keep the project evidence-driven.

1. Do not modify `core/core-1.2.0-r8-p1.js` unless the change is explicitly a Core baseline update.
2. Add or update tests for every behavioral change.
3. Unsupported MySQL/MariaDB syntax must remain explicit (`NOT_SUPPORTED`) rather than being guessed.
4. Run `npm test` before submitting a change.
5. For persistence/browser changes, run `npm run test:browser`.
6. Do not update Golden Scenario expected results only to make a failing test pass; first explain the behavioral change.
7. Keep generated evidence free of secrets and personal/production data.
