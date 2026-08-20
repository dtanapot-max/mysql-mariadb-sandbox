# Repository checklist

- [x] Core baseline included unchanged
- [x] Virtual DB engine
- [x] AI Control API
- [x] Database Manager UI
- [x] Unit/adversarial/automation/final-gate tests
- [x] Golden scenarios
- [x] Long-run and benchmark runners
- [x] Current baseline evidence
- [x] Capability manifest / compatibility evidence
- [x] README / architecture / AI usage / testing docs
- [x] `.gitignore` / `.gitattributes`
- [x] GitHub Actions Node regression
- [x] GitHub Actions Playwright final verification
- [x] GitHub Pages deployment
- [x] Dependabot configuration
- [x] Bug report template
- [x] Safe non-force Windows publish helper
- [ ] GitHub Final Verification browser/IndexedDB PASS (must be produced after push)
- [ ] READY_FOR_FREEZE (only after all mandatory gates PASS)

## AI discoverability

- [x] `AGENTS.md` defines repository rules for coding agents.
- [x] `ai-manifest.json` provides a machine-readable project/control/evidence entrypoint.
- [x] `llms.txt` provides a compact LLM index for the published Pages site.
- [x] `.github/copilot-instructions.md` aligns GitHub Copilot with the same evidence/capability rules.
- [x] `docs/AI-USAGE.md` documents headless AI Control API workflows and expected-failure assertions.



## Merged Candidate RC2

- [x] 55/55 Node regression tests pass
- [x] Transaction journal subset verified against shipped `sandbox/virtual-db.js`
- [x] SAVEPOINT / rollback-to-savepoint verified
- [x] Identifier/prototype-pollution guards verified
- [x] No duplicate VirtualDBEngine implementation embedded in tests
- [x] No environment-specific absolute working-directory evidence paths
- [x] Best/worst lookup + transaction rollback benchmark evidence generated
- [x] 21,004-operation long-run gate passes
- [x] Evidence/capability consistency audit passes
- [ ] Real browser IndexedDB reload gate must still PASS before Freeze
