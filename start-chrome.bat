@echo off
REM Weltrade analysis saver: one-click start with Google Chrome (Windows, needs Node.js 22+ from https://nodejs.org).
REM Same as start.bat, but opens Chrome instead of Edge.
REM 1. Starts Chrome with the debug port (unless a debug browser is already running) on Weltrade's Analytic Hub.
REM 2. Installs and builds the program on the first run.
REM 3. Runs the saver. Keep this window open while you work; close it or press Ctrl+C to stop.
REM Chrome opens on Weltrade's sign-in page the first time; the login is kept in its own profile in your user folder,
REM never in this program's folder. Override that folder with WELTRADE_PROFILE. Extra arguments are passed on, e.g.:
REM   start-chrome.bat --no-panel
setlocal
set "APP=%~dp0"
if "%WELTRADE_PROFILE%"=="" set "WELTRADE_PROFILE=%LOCALAPPDATA%\weltrade-analysis-saver\browser-profile-chrome"

set "CHROME_EXE="
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "CHROME_EXE=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not defined CHROME_EXE if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set "CHROME_EXE=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not defined CHROME_EXE if exist "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" set "CHROME_EXE=%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"

curl -s -m 2 http://localhost:9222/json/version >nul 2>&1
if errorlevel 1 (
  if not defined CHROME_EXE (
    echo Google Chrome was not found. Install it from https://www.google.com/chrome or use start.bat to open Edge.
    pause
    exit /b 1
  )
  echo Starting Chrome...
  start "" "%CHROME_EXE%" --remote-debugging-port=9222 --user-data-dir="%WELTRADE_PROFILE%" https://secure.weltrade.com/trading/analytichub/tradingview
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
