@echo off
setlocal
cd /d "%~dp0"
echo AI Database Sandbox - Real Browser / IndexedDB Verification
node tests\browser-verify.js
set CODE=%ERRORLEVEL%
if "%CODE%"=="0" (
  echo BROWSER INDEXEDDB PASS
  exit /b 0
)
echo BROWSER INDEXEDDB GATE DID NOT PASS - see evidence\browser-test-status.json
exit /b %CODE%
