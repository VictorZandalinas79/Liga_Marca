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


def load_precios_asignados(filename="precios_asignados.csv"):
    """Carga el CSV con los precios asignados."""
    precios = []
    with open(filename, 'r', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        for row in reader:
            precios.append({
                'player_id': row['supabase_player_id'],
                'precio': float(row['precio']) if row['precio'] else 0
            })
    return precios


def subir_precios_a_supabase(precios):
    """
    Sube los precios a la tabla players en Supabase.
    Actualiza solo el campo 'precio' para cada jugador.
    """
    print(f"\nSubiendo {len(precios)} precios a Supabase...")

    # Agrupar actualizaciones en batches de 1000
    batch_size = 1000
    updated = 0
    errors = 0

    for i in range(0, len(precios), batch_size):
        batch = precios[i:i + batch_size]

        for precio_data in batch:
            try:
                player_id = precio_data['player_id']
                precio = precio_data['precio']

                # Actualizar el precio del jugador
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

        print(f"  Progreso: {min(i + batch_size, len(precios))}/{len(precios)} jugadores actualizados")

    return updated, errors


def main():
    print("=" * 60)
    print("SUBIDA DE PRECIOS A SUPABASE")
    print("=" * 60)

    # Cargar precios asignados
    print("\n[1] Cargando precios asignados desde 'precios_asignados.csv'...")
    precios = load_precios_asignados()
    print(f"    {len(precios)} precios para subir")

    # Confirmar antes de subir
    print(f"\n⚠️ ¿Estás seguro de que quieres actualizar {len(precios)} jugadores en Supabase?")
    print("   Esta acción modificará la tabla 'players'.")
    print("\n   Presiona Ctrl+C para cancelar, o espera 3 segundos para continuar...")

    import time
    for i in range(3, 0, -1):
        print(f"   {i}...")
        time.sleep(1)

    # Subir precios
    updated, errors = subir_precios_a_supabase(precios)

    # Mostrar resultados
    print(f"\n{'=' * 60}")
    print("RESULTADOS")
    print(f"{'=' * 60}")
    print(f"✅ Jugadores actualizados: {updated}")
    print(f"❌ Errores: {errors}")

    if errors == 0:
        print(f"\n🎉 ¡Todos los precios se han subido correctamente!")
    else:
        print(f"\n⚠️ Hubo {errors} errores. Revisa la consola para más detalles.")

    print(f"\n{'=' * 60}")
    print("PROCESO COMPLETADO")
    print(f"{'=' * 60}")


if __name__ == "__main__":
    main()
