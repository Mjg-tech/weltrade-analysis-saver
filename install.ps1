# Weltrade analysis saver: smart installer for Windows (PowerShell 5.1+).
# - Installs Git if it is missing.
# - Installs Node.js if it is missing, or upgrades it if it is older than 22 (the version this project needs).
# - Clones the project (or updates it if it is already there), then runs npm install and npm run build.
# Safe to run again at any time. Usage:
#   powershell -ExecutionPolicy Bypass -File .\install.ps1 [-Dir <folder>] [-Start]
param(
  [string]$Dir = (Join-Path $HOME "weltrade-analysis-saver"),
  [switch]$Start
)
$ErrorActionPreference = "Stop"
$Repo = "https://github.com/Mjg-tech/weltrade-analysis-saver.git"
$MinNode = 22

function Update-SessionPath {
  $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")
}
function Has($cmd) { [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }
function Node-Major {
  if (-not (Has node)) { return 0 }
  return [int](((node -v) -replace "^v", "").Split(".")[0])
}
function Need-Winget {
  if (-not (Has winget)) {
    throw "winget isn't available. Install 'App Installer' from the Microsoft Store (or install Git and Node.js $MinNode+ by hand from git-scm.com and nodejs.org), then run this again."
  }
}
function Invoke-Winget($action, $id) {
  winget.exe $action --id $id -e --silent --accept-package-agreements --accept-source-agreements
}

# Git
if (Has git) {
  Write-Host "Git: OK ($(git --version))"
} else {
  Write-Host "Git: not found, installing..."
  Need-Winget
  Invoke-Winget install Git.Git
  Update-SessionPath
  if (-not (Has git)) { throw "Git was installed but isn't visible yet. Close this window, open a new PowerShell and run this script again." }
}

# Node.js
$major = Node-Major
if ($major -ge $MinNode) {
  Write-Host "Node.js: OK ($(node -v))"
} else {
  if ($major -eq 0) { Write-Host "Node.js: not found, installing..." } else { Write-Host "Node.js: v$major is too old (need $MinNode+), upgrading..." }
  Need-Winget
  if ($major -eq 0) {
    Invoke-Winget install OpenJS.NodeJS
  } else {
    Invoke-Winget upgrade OpenJS.NodeJS
    # an older Node that winget didn't install can't be upgraded: install the current one next to it instead
    Update-SessionPath
    if ((Node-Major) -lt $MinNode) { Invoke-Winget install OpenJS.NodeJS }
  }
  Update-SessionPath
  if ((Node-Major) -lt $MinNode) {
    throw "Node.js $MinNode+ was installed but this window still sees $(if (Has node) { node -v } else { 'no node' }). Close this window, open a new PowerShell and run this script again."
  }
  Write-Host "Node.js: now $(node -v)"
}

# Project
if (Test-Path (Join-Path $Dir ".git")) {
  Write-Host "Updating $Dir ..."
  git -C $Dir pull --ff-only
} else {
  Write-Host "Cloning into $Dir ..."
  git clone $Repo $Dir
}
Set-Location $Dir
npm install
npm run build
if ($LASTEXITCODE -ne 0) { throw "Build failed." }

Write-Host ""
Write-Host "Installed in $Dir"
Write-Host "Start it with:  $Dir\start.bat   (create-shortcut.bat adds a desktop shortcut)"
if ($Start) { & (Join-Path $Dir "start.bat") }
