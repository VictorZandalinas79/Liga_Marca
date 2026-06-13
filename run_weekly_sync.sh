#!/bin/bash
# Sincronización semanal: scraping de jugadores + descarga de fixtures
# Se ejecuta cada lunes automáticamente vía crontab

set -e

PROJECT_DIR="/Users/victorzandal/Proyectos/Liga_Marca"
VENV_PYTHON="$PROJECT_DIR/venv/bin/python"
LOG_FILE="$PROJECT_DIR/sync_log.txt"

cd "$PROJECT_DIR"

echo "======================================" >> "$LOG_FILE"
echo "Sync semanal: $(date '+%Y-%m-%d %H:%M:%S')" >> "$LOG_FILE"
echo "======================================" >> "$LOG_FILE"

echo "--- PASO 1: Scraping jugadores web ---" >> "$LOG_FILE"
"$VENV_PYTHON" "1. scraping_jugadores_web.py" >> "$LOG_FILE" 2>&1

echo "--- PASO 2: Descarga fixtures y sync ---" >> "$LOG_FILE"
"$VENV_PYTHON" "2. descarga_fixtures_y_sync.py" >> "$LOG_FILE" 2>&1

echo "Sync completado: $(date '+%Y-%m-%d %H:%M:%S')" >> "$LOG_FILE"
