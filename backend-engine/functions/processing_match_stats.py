import sys
import os
import json
import pandas as pd
from glob import glob

# --- AJUSTE DE RUTAS ---
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

class MatchStatsProcessor:
    """
    Procesa las estadísticas de partido (Match Stats).
    Extrae datos de 'liveData' -> 'lineUp'.
    Genera DOS archivos en rows_data:
    1. matches_stats_teams.csv
    2. matches_stats_players.csv
    """

    def __init__(self, base_output_path="MisDatosFutbol"):
        self.base_output_path = base_output_path

    def process_match_stats(self, df_seasons):
        print("⚽ Iniciando procesamiento de Match Stats (Teams & Players)...")

        if df_seasons.empty:
            print("⚠️ No hay temporadas para procesar.")
            return

        for index, row in df_seasons.iterrows():
            comp_name = str(row['competicion'])
            season_name = str(row['temporada'])
            season_id = str(row['id_temporada'])

            source_dir = os.path.join(self.base_output_path, comp_name, season_name, "match_stats")
            rows_data_dir = os.path.join(self.base_output_path, comp_name, season_name, "rows_data")

            if not os.path.exists(source_dir):
                # print(f"   ⚠️ No existe carpeta match_stats para {season_name}")
                continue

            json_files = glob(os.path.join(source_dir, "*.json"))
            print(f"   📂 Procesando {len(json_files)} partidos en: {comp_name} - {season_name}")

            team_stats_rows = []
            player_stats_rows = []

            for file_path in json_files:
                try:
                    with open(file_path, 'r', encoding='utf-8') as f:
                        data = json.load(f)

                    # 1. Identificar el Partido
                    match_info = data.get('matchInfo', {})
                    match_id = match_info.get('id')
                    if not match_id:
                        match_id = os.path.splitext(os.path.basename(file_path))[0]
                    week = match_info.get('week')

                    # 2. Mapa de Equipos (ID -> Nombre)
                    # Lo sacamos de matchInfo porque en lineUp a veces solo viene el ID
                    team_map = {}
                    if 'contestant' in match_info:
                        for c in match_info['contestant']:
                            team_map[c['id']] = c['name']

                    # 3. Buscar LineUp (Donde están las stats)
                    lineups = []
                    if 'liveData' in data and 'lineUp' in data['liveData']:
                        lineups = data['liveData']['lineUp']
                    
                    if not lineups:
                        # Fallback: Intentar estructura antigua
                        if 'matchStats' in data and 'contestant' in data['matchStats']:
                             # Lógica legacy (si existiera)
                             pass
                        continue

                    # 4. Procesar cada equipo en el LineUp
                    for team_obj in lineups:
                        team_id = team_obj.get('contestantId')
                        team_name = team_map.get(team_id, "Desconocido")

                        # A) Stats del Equipo - captura TODAS las stats + desgloses fh/sh
                        t_stats = team_obj.get('stat', [])
                        for s in t_stats:
                            stat_name = s.get('type')
                            if not stat_name:
                                continue

                            # Fila principal con valor total
                            base_row = {
                                'competicion': comp_name,
                                'temporada': season_name,
                                'id_temporada': season_id,
                                'id_partido': match_id,
                                'week': week,
                                'id_equipo': team_id,
                                'equipo': team_name,
                                'stat_name': stat_name,
                                'stat_value': s.get('value')
                            }
                            team_stats_rows.append(base_row.copy())

                            # Desglose primera mitad (fh) si existe
                            if 'fh' in s:
                                fh_row = base_row.copy()
                                fh_row['stat_name'] = f"{stat_name}_fh"
                                fh_row['stat_value'] = s.get('fh')
                                team_stats_rows.append(fh_row)

                            # Desglose segunda mitad (sh) si existe
                            if 'sh' in s:
                                sh_row = base_row.copy()
                                sh_row['stat_name'] = f"{stat_name}_sh"
                                sh_row['stat_value'] = s.get('sh')
                                team_stats_rows.append(sh_row)

                        # B) Stats de Jugadores - captura TODAS las stats
                        players = team_obj.get('player', [])
                        for p in players:
                            p_id = p.get('playerId')
                            p_name = p.get('matchName') or f"{p.get('firstName','')} {p.get('lastName','')}".strip()

                            p_stats = p.get('stat', [])
                            for ps in p_stats:
                                stat_name = ps.get('type')
                                if not stat_name:
                                    continue
                                player_stats_rows.append({
                                    'competicion': comp_name,
                                    'temporada': season_name,
                                    'id_temporada': season_id,
                                    'id_partido': match_id,
                                    'week': week,
                                    'id_equipo': team_id,
                                    'equipo': team_name,
                                    'id_jugador': p_id,
                                    'jugador': p_name,
                                    'stat_name': stat_name,
                                    'stat_value': ps.get('value')
                                })

                except Exception as e:
                    print(f"   ❌ Error leyendo {os.path.basename(file_path)}: {e}")

            # --- GUARDAR PARQUETS ---
            os.makedirs(rows_data_dir, exist_ok=True)

            # 1. Teams
            if team_stats_rows:
                df_teams = pd.DataFrame(team_stats_rows)
                out_teams = os.path.join(rows_data_dir, "matches_stats_teams.parquet")
                df_teams.to_parquet(out_teams, index=False, engine='pyarrow')
                print(f"      ✅ Team Stats: {len(df_teams)} filas guardadas.")

            # 2. Players
            if player_stats_rows:
                df_players = pd.DataFrame(player_stats_rows)
                out_players = os.path.join(rows_data_dir, "matches_stats_players.parquet")
                df_players.to_parquet(out_players, index=False, engine='pyarrow')
                print(f"      ✅ Player Stats: {len(df_players)} filas guardadas.")
            
            if not team_stats_rows and not player_stats_rows:
                 print(f"      ⚠️ No se encontraron stats en {season_name}")