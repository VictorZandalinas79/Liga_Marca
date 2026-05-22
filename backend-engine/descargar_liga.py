#!/usr/bin/env python3
"""
Pipeline de descarga incremental de datos de fútbol.
Guarda los datos procesados en formato Parquet (en lugar de CSV).

Uso:
    python descargar_liga.py

Flujo:
    1. Solicita ID de competición y temporada al usuario.
    2. Comprueba si ya hay datos descargados para esa liga/temporada.
    3. Descarga solo los partidos que faltan (los scrapers omiten JSONs existentes).
    4. Procesa todos los JSONs y convierte los resultados a .parquet.
"""

import os
import sys
import pandas as pd
from pathlib import Path

# Ajuste de rutas para importar los módulos del proyecto
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from football_client import FootballClient
from functions.utils_common import sanitize_dir_name

# ============================================================
# CONFIGURACIÓN — editar con tus credenciales
# ============================================================
SDAPI_OUTLET_KEY  = "ft1tiv1inq7v1sk3y9tv12yh5"
CALLBACK_ID       = "W390a6f304709a8ce8b530b7bed50fa8f9dcc7d2f9"
BASE_OUTPUT_PATH  = Path("./data")
# ============================================================

# ============================================================
# LIGAS CONFIGURADAS (Añade más ligas aquí según necesites)
# ============================================================
LIGAS_DISPONIBLES = {
    "1": {"nombre": "Copa del Mundo", "id": "70excpe1synn9kadnbppahdn7"},
    "2": {"nombre": "LaLiga", "id": "34pl8szyvrbwcmfkuocjm3r6t"},

}


def _solicitar_parametros() -> tuple[str, str]:
    print("\n🏆  PIPELINE DE DESCARGA — DATOS DE FÚTBOL")
    print("=" * 56)
    
    print("\n📋  Ligas disponibles:")
    for key, info in LIGAS_DISPONIBLES.items():
        print(f"   [{key}] {info['nombre']}")
        
    opcion = input("\n👉  Elige el número de la competición: ").strip()
    
    while opcion not in LIGAS_DISPONIBLES:
        print("❌  Opción no válida. Inténtalo de nuevo.")
        opcion = input("👉  Elige el número de la competición: ").strip()
        
    comp_id = LIGAS_DISPONIBLES[opcion]["id"]
    print(f"✅  Has seleccionado: {LIGAS_DISPONIBLES[opcion]['nombre']}")
    
    season_name  = input("📅  Temporada (ej: 2024/2025) : ").strip()
    return comp_id, season_name


def _obtener_competicion(bot: FootballClient, comp_id: str) -> pd.DataFrame:
    """Busca la competición en caché local; si no existe, la descarga."""
    csv_path = BASE_OUTPUT_PATH / "todas_las_competiciones.csv"
    if csv_path.exists():
        df = pd.read_csv(csv_path)
        df_match = df[df["id_competicion"] == comp_id]
        if not df_match.empty:
            return df_match
        print("   ↻  No encontrada en caché. Descargando lista de competiciones...")
    return bot.get_competitions()


def _obtener_temporada(
    bot: FootballClient,
    df_comp: pd.DataFrame,
    comp_id: str,
    season_name: str,
) -> pd.DataFrame:
    """Busca la temporada en caché local; si no existe, hace scraping."""
    csv_path = BASE_OUTPUT_PATH / "todas_las_temporadas.csv"
    if csv_path.exists():
        df = pd.read_csv(csv_path)
        df_match = df[
            (df["id_competicion"] == comp_id) & (df["temporada"] == season_name)
        ]
        if not df_match.empty:
            return df_match
        print("   ↻  Temporada no encontrada en caché. Descargando temporadas...")
    df_all = bot.get_seasons(df_comp)
    return df_all[df_all["temporada"] == season_name]


def _mostrar_estado_actual(rows_path: Path, comp_name: str, season_name: str) -> bool:
    """Imprime los Parquets existentes y sus filas. Devuelve True si hay datos."""
    parquets = sorted(rows_path.glob("*.parquet"))
    if not parquets:
        print(f"   → No hay datos previos para {comp_name} — {season_name}.")
        return False
    print(f"\n📂  Datos ya procesados para  {comp_name} — {season_name}:")
    for pf in parquets:
        try:
            n = len(pd.read_parquet(pf))
            print(f"   • {pf.name:<50}  {n:>8,} filas")
        except Exception:
            print(f"   • {pf.name}  (no se pudo leer)")
    return True


def _contar_jsons(season_dir: Path, subcarpeta: str) -> int:
    """Devuelve la cantidad de JSONs ya descargados en una subcarpeta."""
    folder = season_dir / subcarpeta
    if not folder.exists():
        return 0
    return sum(1 for _ in folder.glob("*.json"))


def main() -> None:
    # ── 1. Parámetros del usuario ─────────────────────────────────────────────
    comp_id, season_name = _solicitar_parametros()
    season_safe = sanitize_dir_name(season_name)   # "2024/2025" → "2024_2025"

    # ── 2. Inicializar cliente ────────────────────────────────────────────────
    bot = FootballClient(
        sdapi_outlet_key=SDAPI_OUTLET_KEY,
        callback_id=CALLBACK_ID,
        base_output_path=str(BASE_OUTPUT_PATH),
    )

    # ── 3. Buscar competición ─────────────────────────────────────────────────
    print("\n🔍  Buscando competición...")
    df_comp_all = _obtener_competicion(bot, comp_id)
    df_comp = df_comp_all[df_comp_all["id_competicion"] == comp_id]
    if df_comp.empty:
        print(f"❌  No se encontró la competición con ID: {comp_id}")
        sys.exit(1)
    comp_name = str(df_comp.iloc[0]["competicion"])
    print(f"   ✅  {comp_name}")

    # ── 4. Buscar temporada ───────────────────────────────────────────────────
    print("\n📅  Buscando temporada...")
    df_season = _obtener_temporada(bot, df_comp, comp_id, season_name)
    if df_season.empty:
        print(f"❌  No se encontró la temporada '{season_name}' para {comp_name}.")
        sys.exit(1)
    season_row_raw = df_season.iloc[0]
    print(f"   ✅  {season_name}  (ID: {season_row_raw['id_temporada']})")

    # Creamos un df_season con el nombre de temporada sanitizado (underscores)
    # para que todos los scrapers/procesadores usen la misma ruta en disco.
    df_season_safe = df_season.copy()
    df_season_safe["temporada"] = season_safe

    season_dir = BASE_OUTPUT_PATH / comp_name / season_safe
    rows_path  = season_dir / "rows_data"

    # ── 5. Estado actual ──────────────────────────────────────────────────────
    hay_datos = _mostrar_estado_actual(rows_path, comp_name, season_name)

    # ── 6. Descargar fixture ──────────────────────────────────────────────────
    print(f"\n📅  Obteniendo fixture para {comp_name} — {season_name}...")
    bot.fixture_scraper.download_fixture_for_season(df_season_safe.iloc[0])
    df_fixture = bot.process_fixture(df_season_safe, index=0)

    if df_fixture is None or df_fixture.empty:
        print("❌  No se pudo obtener el fixture.")
        sys.exit(1)

    total = len(df_fixture)

    # ── 7. Resumen de lo que falta descargar ──────────────────────────────────
    n_events = _contar_jsons(season_dir, "events")
    n_stats  = _contar_jsons(season_dir, "match_stats")
    n_data   = _contar_jsons(season_dir, "match_data")

    print(f"\n📊  Fixture: {total} partidos en la competición")
    if hay_datos or n_events > 0:
        print(f"   • Eventos descargados   : {n_events}/{total}  ({max(0, total - n_events)} nuevos)")
        print(f"   • Match Stats descargados: {n_stats}/{total}  ({max(0, total - n_stats)} nuevos)")
        print(f"   • Match Data descargados : {n_data}/{total}  ({max(0, total - n_data)} nuevos)")
    else:
        print("   → Primera descarga: se bajarán todos los partidos.")

    if hay_datos and n_events >= total and n_stats >= total:
        print("\n✅  Todo parece estar al día.")
        resp = input("¿Quieres reprocesar y regenerar los Parquets de todas formas? (s/N): ").strip().lower()
        if resp != "s":
            print("👋  Saliendo sin cambios.")
            return

    # ── 8. Descarga de datos de partido ───────────────────────────────────────
    comp_str   = comp_name
    season_str = season_safe   # usamos la versión con underscores en rutas

    print("\n" + "=" * 56)
    print("⬇️   DESCARGANDO DATOS DE PARTIDO")
    print("=" * 56)

    print("\n⚡  Eventos de partido...")
    bot.events_scraper.download_events_for_season(comp_str, season_str, df_fixture)

    print("\n📊  Match Stats...")
    bot.stats_scraper.download_stats_for_season(comp_str, season_str, df_fixture)

    print("\n🏟️   Match Data (detalles de partido)...")
    bot.match_data_scraper.download_match_data_for_season(comp_str, season_str, df_fixture)

    # ── 9. Datos de temporada ─────────────────────────────────────────────────
    print("\n" + "=" * 56)
    print("⬇️   DESCARGANDO DATOS DE TEMPORADA")
    print("=" * 56)

    season_id_str = str(season_row_raw["id_temporada"])

    print("\n🏆  Standings...")
    bot.standings_scraper.download_standings_for_season(comp_str, season_str, season_id_str)

    print("\n👥  Planteles (squads)...")
    bot.squads_scraper.download_squads_for_season(comp_str, season_str, season_id_str)

    print("\n📈  Season Stats (por equipo)...")
    df_equipos = bot._extract_teams_from_fixture(df_fixture)
    bot.season_stats_scraper.download_season_stats_from_list(
        comp_str, season_str, season_id_str, df_equipos
    )

    if hasattr(bot, "rankings_scraper"):
        print("\n🥇  Rankings...")
        bot.rankings_scraper.download_rankings_for_season(comp_str, season_str, season_id_str)

    # ── 10. Procesamiento ─────────────────────────────────────────────────────
    print("\n" + "=" * 56)
    print("⚙️   PROCESANDO Y GUARDANDO RESULTADOS")
    print("=" * 56)

    # Fixture ya procesado arriba; solo guardamos el Parquet directamente
    fixture_pq = rows_path / "fixture_final.parquet"
    rows_path.mkdir(parents=True, exist_ok=True)
    df_fixture.to_parquet(fixture_pq, index=False, engine="pyarrow")
    print(f"\n   ✅  fixture_final.parquet  ({len(df_fixture):,} partidos)")

    print("\n👥  Procesando planteles...")
    bot.process_squads_to_csv(df_season_safe)

    print("\n🏟️   Procesando fichas de partido...")
    bot.process_match_data(df_season_safe, index=0)

    print("\n📊  Procesando match stats...")
    bot.process_match_stats(df_season_safe, index=0)

    print("\n⏱️   Calculando minutos jugados...")
    bot.process_minutes_played(df_season_safe, index=0)

    print("\n🏆  Procesando standings...")
    bot.process_standings(df_season_safe, index=0)

    print("\n📈  Procesando season stats...")
    bot.process_season_stats(df_season_safe, index=0)

    bio_folder = season_dir / "player_bio"
    if bio_folder.exists() and any(bio_folder.glob("*.json")):
        print("\n👤  Procesando biografías de jugadores...")
        bot.process_player_bio(df_season_safe, index=0)

    print("\n⚡  Procesando eventos tácticos (tiros, pases, defensa)...")
    bot.process_match_events(df_season_safe, index=0)

    print("\n💎  Generando clean event data (xT + qualifiers)...")
    bot.process_enriched_events(df_season_safe, index=0)

    # ── 11. Aplicar modelo de xG/xA ─────────────────────────────────────────────
    print("\n" + "=" * 56)
    print("⚽  APLICANDO MODELO xG/xA")
    print("=" * 56)

    import subprocess
    script_xgxa = Path("/Users/imac/Programas/Modelo_xG_xA/aplicar_modelo_libreria.py")
    if script_xgxa.exists():
        try:
            subprocess.run(
                ["python3", str(script_xgxa), "--dir", str(rows_path), "--no-backup"],
                check=True,
                timeout=300
            )
            print("\n✅  Modelo xG/xA aplicado correctamente")
        except subprocess.CalledProcessError as e:
            print(f"\n⚠️  Error al aplicar xG/xA: {e}")
        except subprocess.TimeoutExpired:
            print("\n⚠️  Timeout al aplicar xG/xA")
        except Exception as e:
            print(f"\n⚠️  Error inesperado: {e}")
    else:
        print(f"\n⚠️  Script xG/xA no encontrado: {script_xgxa}")

    print("\n" + "=" * 56)
    print(f"✅  COMPLETADO: {comp_name} — {season_name}")
    print(f"📁  Archivos en: {rows_path}")
    print("=" * 56)


if __name__ == "__main__":
    main()
