#!/usr/bin/env bash
# Weltrade analysis saver: smart installer for macOS and Linux (apt, dnf, pacman).
# - Installs Git if it is missing.
# - Installs Node.js if it is missing, or upgrades it if it is older than 22 (the version this project needs).
# - Clones the project (or updates it if it is already there), then runs npm install and npm run build.
# Safe to run again at any time. Usage:  bash install.sh [folder]     (default folder: ~/weltrade-analysis-saver)
set -euo pipefail

REPO="https://github.com/Mjg-tech/weltrade-analysis-saver.git"
MIN_NODE=22
DIR="${1:-$HOME/weltrade-analysis-saver}"

SUDO=""
[ "$(id -u)" -ne 0 ] && command -v sudo >/dev/null 2>&1 && SUDO="sudo"

node_major() { command -v node >/dev/null 2>&1 && node -v | sed 's/^v//; s/\..*//' || echo 0; }
die() { echo "ERROR: $*" >&2; exit 1; }

if command -v brew >/dev/null 2>&1; then PM=brew
elif command -v apt-get >/dev/null 2>&1; then PM=apt
elif command -v dnf >/dev/null 2>&1; then PM=dnf
elif command -v pacman >/dev/null 2>&1; then PM=pacman
else PM=""; fi

# Git
if command -v git >/dev/null 2>&1; then
  echo "Git: OK ($(git --version))"
else
  echo "Git: not found, installing..."
  case "$PM" in
    brew)   brew install git ;;
    apt)    $SUDO apt-get update && $SUDO apt-get install -y git ;;
    dnf)    $SUDO dnf install -y git ;;
    pacman) $SUDO pacman -S --noconfirm git ;;
    *)      die "no supported package manager found. Install Git by hand, then run this again." ;;
  esac
fi

# Node.js
major="$(node_major)"
if [ "$major" -ge "$MIN_NODE" ]; then
  echo "Node.js: OK ($(node -v))"
else
  if [ "$major" -eq 0 ]; then echo "Node.js: not found, installing..."; else echo "Node.js: v$major is too old (need $MIN_NODE+), upgrading..."; fi
  case "$PM" in
    brew)
      # "brew install node" installs or upgrades; the versioned formula is the fallback if "node" is pinned or too old
      brew install node || brew upgrade node || true
      [ "$(node_major)" -ge "$MIN_NODE" ] || brew install "node@$MIN_NODE"
      [ "$(node_major)" -ge "$MIN_NODE" ] || brew link --overwrite --force "node@$MIN_NODE"
      ;;
    apt)
      $SUDO apt-get update && $SUDO apt-get install -y curl ca-certificates
      curl -fsSL "https://deb.nodesource.com/setup_${MIN_NODE}.x" | $SUDO -E bash -
      $SUDO apt-get install -y nodejs
      ;;
    dnf)
      $SUDO dnf install -y curl
      curl -fsSL "https://rpm.nodesource.com/setup_${MIN_NODE}.x" | $SUDO bash -
      $SUDO dnf install -y nodejs
      ;;
    pacman) $SUDO pacman -S --noconfirm nodejs npm ;;
    *)      die "no supported package manager found. Install Node.js $MIN_NODE+ from https://nodejs.org, then run this again." ;;
  esac
  hash -r
  [ "$(node_major)" -ge "$MIN_NODE" ] || die "Node.js is still older than $MIN_NODE ($(node -v 2>/dev/null || echo 'none')). Open a new terminal and run this again, or install it from https://nodejs.org."
  echo "Node.js: now $(node -v)"
fi

# Project
if [ -d "$DIR/.git" ]; then
  echo "Updating $DIR ..."
  git -C "$DIR" pull --ff-only
else
  echo "Cloning into $DIR ..."
  git clone "$REPO" "$DIR"
fi
cd "$DIR"
npm install
npm run build

cat <<EOF

Installed in $DIR
Start Edge with the debug port, then the saver (see the README, "Installation"):
  cd "$DIR" && node dist/saver.js
EOF
