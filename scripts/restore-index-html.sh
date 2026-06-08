#!/bin/bash
# Restore index.html to dev entry point after Vite build overwrites it
# Uses git to extract the clean source version (avoids quoting issues)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJ_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# First try: restore from git HEAD's original (pre-build) version
# We store a backup before each build
BACKUP_FILE="$PROJ_ROOT/.index.html.dev"

if [ -f "$BACKUP_FILE" ]; then
  cp "$BACKUP_FILE" "$PROJ_ROOT/index.html"
  echo "✓ index.html restored from backup"
else
  # Fallback: use git show from rev1 tag
  cd "$PROJ_ROOT"
  git show rev1:index.html > index.html 2>/dev/null
  if [ $? -eq 0 ]; then
    echo "✓ index.html restored from git rev1"
  else
    echo "✗ Failed to restore index.html — please restore manually"
    exit 1
  fi
fi
