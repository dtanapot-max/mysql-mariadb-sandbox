@echo off
setlocal
cd /d "%~dp0"
echo [1/7] Regression tests
node --test tests\*.test.js || goto :fail
echo [2/7] Coverage
node --experimental-test-coverage --test tests\unit.test.js tests\adversarial.test.js tests\automation.test.js tests\ai-sandbox.test.js tests\final-gates.test.js > evidence\coverage-windows.txt 2>&1 || goto :fail
echo [3/7] Benchmark
node tests\benchmark.js || goto :fail
echo [4/7] Long-run 21k operations
node --expose-gc tests\long-run.js || goto :fail
echo [5/7] Generate evidence
node tests\generate-evidence.js || goto :fail
echo [6/7] Real Chrome/Edge IndexedDB reload verification
node tests\browser-verify.js
if errorlevel 1 goto :browser_blocked
echo [7/7] Evidence audit + final status
node tests\evidence-audit.js || goto :fail
node tests\final-status.js || goto :fail
echo FINAL VERIFY PASS
exit /b 0
:browser_blocked
echo Browser/IndexedDB gate did not PASS. Keeping NOT_READY_FOR_FREEZE.
node tests\evidence-audit.js
node tests\final-status.js
exit /b 2
:fail
echo FINAL VERIFY FAIL
node tests\final-status.js
exit /b 1
