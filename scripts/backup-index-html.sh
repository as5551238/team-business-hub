#!/bin/bash
# Backup index.html before build (so postbuild can restore it)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJ_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cp "$PROJ_ROOT/index.html" "$PROJ_ROOT/.index.html.dev"
echo "✓ index.html backed up before build"
