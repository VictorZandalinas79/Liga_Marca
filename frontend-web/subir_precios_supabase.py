import csv
import os
import json
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

# Cargar configuración
with open('settings.json', 'r', encoding='utf-8') as f:
    config = json.load(f)

SUPABASE_URL = os.environ.get("SUPABASE_URL")
# Usar la service role key para tener permisos de escritura
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_KEY")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)


def get_all_supabase_players():
    """Obtiene todos los jugadores de Supabase para saber sus precios actuales (Paginado porque el límite es 1000)"""
    print("[*] Descargando estado actual de los jugadores desde Supabase para comparar...")
    players = {}
    limit = 1000
    offset = 0
    
    while True:
        response = supabase.table("players").select("id, price").range(offset, offset + limit - 1).execute()
        data = response.data
        if not data:
            break
        
        for player in data:
            players[player['id']] = player.get('price')
            
        offset += limit
        if len(data) < limit:
            break
            
    print(f"    -> Se han descargado {len(players)} jugadores de Supabase.")
    return players


def load_precios_asignados(filename="precios_asignados.csv"):
    """Carga el CSV, obtiene los precios y calcula el precio mínimo."""
    precios = {}
    min_precio = float('inf')
    
    with open(filename, 'r', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        for row in reader:
            player_id = row['supabase_player_id']
            # Convertimos a entero evitando el error de los decimales
            precio = int(float(row['precio'])) if row['precio'] else 0
            
            if precio > 0:
                precios[player_id] = precio
                if precio < min_precio:
                    min_precio = precio

    if min_precio == float('inf'):
        min_precio = 1  # Valor por defecto en caso de que el CSV esté vacío o con ceros
        
    return precios, min_precio


def preparar_actualizaciones(csv_precios, db_players, min_precio):
    """Compara el CSV con la DB y decide a quién hay que actualizar."""
    to_update = []
    skipped = 0
    
    # 1. Revisar los jugadores del CSV frente a la base de datos
    for player_id, precio_csv in csv_precios.items():
        if player_id in db_players:
            precio_db = db_players[player_id]
            if precio_db == precio_csv:
                skipped += 1
            else:
                to_update.append({'player_id': player_id, 'precio': precio_csv})
        else:
            # Si por alguna razón está en el CSV pero no lo vimos en la DB, lo intentamos actualizar igual
            to_update.append({'player_id': player_id, 'precio': precio_csv})

    # 2. Revisar los jugadores de la base de datos que NO están en el CSV (o no tenían precio)
    for player_id, precio_db in db_players.items():
        if player_id not in csv_precios:
            # NUEVA CONDICIÓN: 
            # Si no tiene precio (None o 0) O si el precio tiene más de 3 cifras (>= 1000)
            if precio_db is None or precio_db == 0 or precio_db >= 1000:
                to_update.append({'player_id': player_id, 'precio': min_precio})
            else:
                skipped += 1
                
    return to_update, skipped


def subir_precios_a_supabase(precios_a_actualizar):
    """Sube solo los precios que necesitan ser actualizados."""
    if not precios_a_actualizar:
        return 0, 0
        
    print(f"\nSubiendo {len(precios_a_actualizar)} actualizaciones a Supabase...")

    updated = 0
    errors = 0

    # Iteramos uno a uno sobre los que realmente hay que actualizar
    for idx, precio_data in enumerate(precios_a_actualizar, 1):
        try:
            player_id = precio_data['player_id']
            precio = precio_data['precio']

            response = supabase.table("players").update(
                {"price": precio}
            ).eq("id", player_id).execute()

            if response.data:
                updated += 1
            else:
                errors += 1
                print(f"  ⚠️ No se pudo actualizar jugador ID: {player_id}")

        except Exception as e:
            errors += 1
            print(f"  ❌ Error actualizando jugador {precio_data['player_id']}: {e}")

        # Imprimir progreso cada 500 jugadores para no saturar la consola
        if idx % 500 == 0 or idx == len(precios_a_actualizar):
            print(f"  Progreso: {idx}/{len(precios_a_actualizar)} procesados...")

    return updated, errors


def main():
    print("=" * 60)
    print("SUBIDA INTELIGENTE DE PRECIOS A SUPABASE")
    print("=" * 60)

    # 1. Cargar datos
    print("\n[1] Cargando precios asignados desde 'precios_asignados.csv'...")
    csv_precios, min_precio = load_precios_asignados()
    print(f"    Se encontraron {len(csv_precios)} jugadores en el CSV.")
    print(f"    El precio mínimo detectado es: {min_precio}")

    # 2. Obtener estado de Supabase
    print("\n[2] Obteniendo estado actual de la base de datos...")
    db_players = get_all_supabase_players()

    # 3. Preparar los datos a actualizar
    print("\n[3] Analizando quién necesita actualización...")
    to_update, skipped = preparar_actualizaciones(csv_precios, db_players, min_precio)
    
    print(f"    -> Jugadores que YA tienen el precio correcto: {skipped}")
    print(f"    -> Jugadores que necesitan actualización o precio mínimo: {len(to_update)}")

    if len(to_update) == 0:
        print("\n🎉 ¡Todos los jugadores ya están actualizados! No hay nada que hacer.")
        return

    # 4. Confirmar antes de subir
    print(f"\n⚠️ ¿Estás seguro de que quieres actualizar {len(to_update)} jugadores en Supabase?")
    print("   Presiona Ctrl+C para cancelar, o espera 3 segundos para continuar...")

    import time
    for i in range(3, 0, -1):
        print(f"   {i}...")
        time.sleep(1)

    # 5. Subir precios
    updated, errors = subir_precios_a_supabase(to_update)

    # Mostrar resultados
    print(f"\n{'=' * 60}")
    print("RESULTADOS")
    print(f"{'=' * 60}")
    print(f"✅ Jugadores actualizados con éxito: {updated}")
    print(f"⏭️  Jugadores omitidos (ya estaban bien): {skipped}")
    print(f"❌ Errores: {errors}")

    if errors == 0:
        print(f"\n🎉 ¡Proceso finalizado correctamente!")
    else:
        print(f"\n⚠️ Hubo {errors} errores. Revisa la consola para más detalles.")

    print(f"\n{'=' * 60}")
    print("PROCESO COMPLETADO")
    print(f"{'=' * 60}")


if __name__ == "__main__":
    main()