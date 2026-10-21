@echo off
REM Weltrade analysis saver: one-click start (Windows, needs Node.js 22+ from https://nodejs.org).
REM 1. Starts Edge with the debug port (unless a debug browser is already running) on Weltrade's Analytic Hub.
REM 2. Installs and builds the program on the first run.
REM 3. Runs the saver. Keep this window open while you work; close it or press Ctrl+C to stop.
REM The browser profile (your Weltrade login) is kept in your user folder, never in this program's folder.
REM Override it with WELTRADE_PROFILE. Extra arguments are passed on, e.g.: start.bat --no-panel
setlocal
set "APP=%~dp0"
if "%WELTRADE_PROFILE%"=="" set "WELTRADE_PROFILE=%LOCALAPPDATA%\weltrade-analysis-saver\browser-profile"

set EDGE_EXE="C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
if not exist %EDGE_EXE% set EDGE_EXE="C:\Program Files\Microsoft\Edge\Application\msedge.exe"

curl -s -m 2 http://localhost:9222/json/version >nul 2>&1
if errorlevel 1 (
  echo Starting Edge...
  start "" %EDGE_EXE% --remote-debugging-port=9222 --user-data-dir="%WELTRADE_PROFILE%" https://secure.weltrade.com/trading/analytichub/tradingview
) else (
  echo Using the debug browser that is already running on port 9222.
)

where node >nul 2>&1
if errorlevel 1 (
  echo Node.js is not installed. Install Node.js 22 or newer from https://nodejs.org and run this again.
  pause
  exit /b 1
)

cd /d "%APP%"
if not exist node_modules (
  echo Installing...
  call npm install || (pause & exit /b 1)
)
if not exist dist\saver.js (
  echo Building...
  call npm run build || (pause & exit /b 1)
)

node dist\saver.js %*
pause
