@echo off
setlocal
cd /d "%~dp0"
echo [1/5] Unit + adversarial + automation + AI + UI + final gates
node --test tests\*.test.js || goto :fail
echo [2/5] Coverage
node --experimental-test-coverage --test tests\unit.test.js tests\adversarial.test.js tests\automation.test.js tests\ai-sandbox.test.js tests\final-gates.test.js || goto :fail
echo [3/5] Benchmark
node tests\benchmark.js || goto :fail
echo [4/5] Long-run
node --expose-gc tests\long-run.js || goto :fail
echo [5/5] Evidence
node tests\generate-evidence.js || goto :fail
echo PASS - Browser gate is separate: RUN-BROWSER-VERIFY.bat or RUN-FINAL-VERIFY.bat
exit /b 0
:fail
echo FAIL
exit /b 1
