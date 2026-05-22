#!/usr/bin/env python3
"""
Actualiza settings.json con el ID de temporada obtenido.
"""

import json
import sys

if len(sys.argv) < 2:
    print("Uso: python3 update_settings.py <season_id>")
    sys.exit(1)

season_id = sys.argv[1]

with open('settings.json', 'r', encoding='utf-8') as f:
    config = json.load(f)

config['active_league']['season_id'] = season_id

with open('settings.json', 'w', encoding='utf-8') as f:
    json.dump(config, f, indent=2, ensure_ascii=False)

print(f"✅ settings.json actualizado con season_id: {season_id}")
