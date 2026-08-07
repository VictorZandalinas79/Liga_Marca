#!/bin/bash
# Fija la contraseña de la cuenta de administrador en Supabase.
# Esa contraseña es la que pide el modal de "eliminar usuario" del panel admin.
# Uso:  bash scratch/set_admin_password.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ADMIN_ID="11e2e364-95a1-4daa-ba1f-4f201af21826"   # vilafranca.fantasy2026@gmail.com

SRK=$(grep -E '^SUPABASE_SERVICE_ROLE_KEY' "$ROOT/.env" | head -1 | cut -d= -f2- | tr -d ' "'"'"'')
URL=$(grep -E '^NEXT_PUBLIC_SUPABASE_URL' "$ROOT/frontend-web/.env.local" | head -1 | cut -d= -f2- | tr -d ' "'"'"'')

if [ $# -ge 1 ]; then
  PASS="$1"
elif [ -t 0 ]; then
  read -rsp "Nueva contraseña de admin (mínimo 6 caracteres): " PASS; echo
  read -rsp "Repítela: " PASS2; echo
  [ "$PASS" = "$PASS2" ] || { echo "No coinciden."; exit 1; }
else
  echo "Sin terminal interactiva. Pasa la contraseña como argumento:" >&2
  echo "  bash scratch/set_admin_password.sh 'MiClave123'" >&2
  exit 1
fi
[ ${#PASS} -ge 6 ] || { echo "Demasiado corta (mínimo 6)."; exit 1; }

BODY=$(PASS="$PASS" python3 -c 'import json,os; print(json.dumps({"password": os.environ["PASS"]}))')

RESP=$(curl -s -w $'\n%{http_code}' -X PUT "$URL/auth/v1/admin/users/$ADMIN_ID" \
  -H "apikey: $SRK" -H "Authorization: Bearer $SRK" \
  -H "Content-Type: application/json" -d "$BODY")

CODE=$(printf '%s' "$RESP" | tail -1)
if [ "$CODE" = "200" ]; then
  echo "OK: contraseña actualizada. Úsala en el modal de eliminar usuario."
else
  echo "ERROR (HTTP $CODE):"
  printf '%s' "$RESP" | sed '$d'
  exit 1
fi
