#!/bin/bash
# basketch local setup — run once after cloning
# Usage: ./setup.sh

set -e

echo "==============================="
echo "  Setting up basketch locally"
echo "==============================="
echo ""

# Check prerequisites
command -v node >/dev/null 2>&1 || { echo "Error: Node.js is required. Install from https://nodejs.org"; exit 1; }
command -v python3 >/dev/null 2>&1 || { echo "Error: Python 3 is required. Install from https://python.org"; exit 1; }

echo "1/4  Installing pipeline dependencies..."
cd pipeline && npm install && cd ..

echo ""
echo "2/4  Installing frontend dependencies..."
cd web && npm install && cd ..

echo ""
echo "3/4  Installing Python dependencies..."
pip3 install -r pipeline/coop/requirements.txt

echo ""
echo "4/4  Setting up environment file..."
if [ ! -f .env ]; then
  cp .env.example .env
  echo "     Created .env from template"
else
  echo "     .env already exists — skipping"
fi

echo ""
echo "==============================="
echo "  Setup complete!"
echo "==============================="
echo ""
echo "Next steps:"
echo "  1. Edit .env with your Supabase credentials"
echo "  2. cd web && npm run dev    (start frontend)"
echo "  3. Read CLAUDE.md for the full guide"
echo ""
