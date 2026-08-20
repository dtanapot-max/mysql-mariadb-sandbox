@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul || (echo ERROR: Node.js not found & exit /b 1)
echo [1/3] Regression
node --test tests\*.test.js || exit /b 1
echo [2/3] Evidence audit
node tests\evidence-audit.js || exit /b 1
echo [3/3] Pages build
node tools\build-pages.js || exit /b 1
echo GITHUB READY CHECK PASS
echo NOTE: Browser IndexedDB is intentionally verified by GitHub Final Verification or RUN-BROWSER-VERIFY.bat.
exit /b 0
