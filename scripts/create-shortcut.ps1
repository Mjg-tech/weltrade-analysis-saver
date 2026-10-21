# Creates the "Weltrade Charts" desktop shortcut: one click opens Edge on Weltrade and starts the saver.
# Run it through create-shortcut.bat (double-click). Options:
#   -BrowserProfile <folder>  use an existing Edge debug profile (e.g. one that's already logged in to Weltrade).
#                             Default: start.bat's own profile in %LOCALAPPDATA%\weltrade-analysis-saver.
#   -Destination <folder>     where to put the shortcut. Default: your desktop.
param(
  [string]$BrowserProfile = $env:WELTRADE_PROFILE,
  [string]$Destination = [Environment]::GetFolderPath('Desktop')
)
$ErrorActionPreference = 'Stop'

$app = Split-Path -Parent $PSScriptRoot
$start = Join-Path $app 'start.bat'
if (-not (Test-Path -LiteralPath $start)) { throw "start.bat not found next to this script ($start)." }

$lnk = Join-Path $Destination 'Weltrade Charts.lnk'
$edge = @('C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe', 'C:\Program Files\Microsoft\Edge\Application\msedge.exe') |
  Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1

# The target is cmd.exe rather than start.bat itself: Windows only lets you pin shortcuts to programs to the taskbar.
# "/s /c" keeps the inner quotes intact, so folder names with spaces work.
$inner = if ($BrowserProfile) { "set ""WELTRADE_PROFILE=$BrowserProfile"" && ""$start""" } else { """$start""" }

$shell = New-Object -ComObject WScript.Shell
$s = $shell.CreateShortcut($lnk)
$s.TargetPath = Join-Path $env:SystemRoot 'System32\cmd.exe'
$s.Arguments = "/s /c ""$inner"""
$s.WorkingDirectory = $app
if ($edge) { $s.IconLocation = "$edge,0" }
$s.Description = 'Open Weltrade charts with the analysis saver (auto-save, Save / History / Load)'
$s.Save()

Write-Host "Created: $lnk"
if ($BrowserProfile) { Write-Host "Browser profile: $BrowserProfile" } else { Write-Host 'Browser profile: the saver''s own (log in to Weltrade once on first use)' }
Write-Host ''
Write-Host 'To pin it: right-click "Weltrade Charts" on the desktop > Pin to taskbar.'
Write-Host '(Windows does not allow programs to pin to the taskbar themselves.)'
