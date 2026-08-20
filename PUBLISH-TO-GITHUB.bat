@echo off
setlocal
cd /d "%~dp0"
call GITHUB-READY-CHECK.bat || exit /b 1
where git >nul 2>nul || (echo ERROR: git not found & exit /b 1)
if not exist .git git init || exit /b 1

git remote get-url origin >nul 2>nul
if errorlevel 1 (
  git remote add origin https://github.com/dtanapot-max/ai-database-sandbox.git || exit /b 1
) else (
  git remote set-url origin https://github.com/dtanapot-max/ai-database-sandbox.git || exit /b 1
)

git add -A || exit /b 1
git diff --cached --quiet
if errorlevel 1 (
  git commit -m "Initial AI Database Sandbox candidate" || exit /b 1
) else (
  echo No staged changes to commit.
)

git branch -M main || exit /b 1
git push -u origin main || (
  echo.
  echo Push failed. No force-push was attempted.
  echo Check GitHub authentication or remote changes, then retry.
  exit /b 1
)

echo.
echo SUCCESS: pushed to https://github.com/dtanapot-max/ai-database-sandbox
exit /b 0
