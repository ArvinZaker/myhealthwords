#!/usr/bin/env bash
set -euo pipefail

python3 import_workbook.py data/data.xlsx entries.json
python3 build_fallbacks.py
node --check app.js

echo "Website database regenerated: entries.json"
