@echo off
setlocal
cd /d "%~dp0"
for /f %%P in ('powershell -NoProfile -Command "$l=[System.Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,0);$l.Start();$p=$l.LocalEndpoint.Port;$l.Stop();$p"') do set PORT=%%P
if not defined PORT set PORT=4173
where py >nul 2>nul
if not errorlevel 1 (
  start "AI Database Sandbox Server" /min py -m http.server %PORT% --bind 127.0.0.1
  goto :open
)
where python >nul 2>nul
if not errorlevel 1 (
  start "AI Database Sandbox Server" /min python -m http.server %PORT% --bind 127.0.0.1
  goto :open
)
where node >nul 2>nul
if not errorlevel 1 (
  start "AI Database Sandbox Server" /min node tools\static-server.js %PORT%
  goto :open
)
echo ERROR: Python or Node.js is required.
exit /b 1
:open
ping 127.0.0.1 -n 2 >nul
start "" http://127.0.0.1:%PORT%/
echo AI Database Sandbox: http://127.0.0.1:%PORT%/
echo Close the server window to stop.
endlocal
