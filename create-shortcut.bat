@echo off
REM Creates the "Weltrade Charts" desktop shortcut (opens Edge on Weltrade and starts the saver).
REM To use a browser profile that's already logged in, pass it:  create-shortcut.bat "D:\my\edge-profile"
if "%~1"=="" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\create-shortcut.ps1"
) else (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\create-shortcut.ps1" -BrowserProfile "%~1"
)
pause
