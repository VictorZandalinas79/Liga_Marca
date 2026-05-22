import sys
import os
import json
import pandas as pd
from glob import glob

# --- AJUSTE DE RUTAS ---
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

class SeasonStatsProcessor:
    """
    Procesa los JSON de estadísticas acumuladas de temporada (Season Stats).
    Genera dos CSVs en 'rows_data':
    1. season_stats_teams.csv (Stats globales del equipo)
    2. season_stats_players.csv (Stats acumuladas por jugador)
    """

    def __init__(self, base_output_path="MisDatosFutbol"):
        self.base_output_path = base_output_path

    def process_season_stats(self, df_seasons):
        """
        Recorre las temporadas, procesa los JSON de season_stats y genera CSVs.
        """
        print("📈 Iniciando procesamiento de Season Stats...")

        if df_seasons.empty:
            print("⚠️ No hay temporadas para procesar.")
            return

        for index, row in df_seasons.iterrows():
            comp_name = str(row['competicion'])
            season_name = str(row['temporada'])
            season_id = str(row['id_temporada'])

            # Rutas
            source_dir = os.path.join(self.base_output_path, comp_name, season_name, "season_stats")
            rows_data_dir = os.path.join(self.base_output_path, comp_name, season_name, "rows_data")

            if not os.path.exists(source_dir):
                # print(f"   ⚠️ No existe carpeta season_stats para {season_name}")
                continue

            json_files = glob(os.path.join(source_dir, "*.json"))
            print(f"   📂 Procesando {len(json_files)} equipos en: {comp_name} - {season_name}")

            team_stats_rows = []
            player_stats_rows = []

            for file_path in json_files:
                try:
                    with open(file_path, 'r', encoding='utf-8') as f:
                        data = json.load(f)

                    # La estructura suele ser raíz -> contestant
                    contestant = data.get('contestant', {})
                    if not contestant:
                        # A veces es una lista en la raíz
                        if isinstance(data, list) and len(data) > 0 and 'contestant' in data[0]:
                             contestant = data[0]['contestant']
                        else:
                             # Intento fallback si la estructura es diferente
                             continue

                    team_id = contestant.get('id')
                    team_name = contestant.get('name')

                    # --- 1. STATS DEL EQUIPO ---
                    t_stats = contestant.get('stat', [])
                    for s in t_stats:
                        team_stats_rows.append({
                            'competicion': comp_name,
                            'temporada': season_name,
                            'id_temporada': season_id,
                            'id_equipo': team_id,
                            'equipo': team_name,
                            'stat_name': s.get('name'),
                            'stat_value': s.get('value')
                        })

                    # --- 2. STATS DE JUGADORES ---
                    players = contestant.get('player', [])
                    for p in players:
                        p_id = p.get('id')
                        p_name = f"{p.get('firstName', '')} {p.get('lastName', '')}".strip()
                        p_stats = p.get('stat', [])
                        
                        for ps in p_stats:
                            player_stats_rows.append({
                                'competicion': comp_name,
                                'temporada': season_name,
                                'id_temporada': season_id,
                                'id_equipo': team_id,
                                'equipo': team_name,
                                'id_jugador': p_id,
                                'jugador': p_name,
                                'posicion': p.get('position'),
                                'stat_name': ps.get('name'),
                                'stat_value': ps.get('value')
                            })

                except Exception as e:
                    print(f"   ❌ Error leyendo {os.path.basename(file_path)}: {e}")

            # --- GUARDAR CSVs ---
            os.makedirs(rows_data_dir, exist_ok=True)
            
            # Guardar Teams Stats
            if team_stats_rows:
                df_teams = pd.DataFrame(team_stats_rows)
                out_teams = os.path.join(rows_data_dir, "season_stats_teams.parquet")
                df_teams.to_parquet(out_teams, index=False, engine='pyarrow')
                print(f"      ✅ Equipos stats: {out_teams} ({len(df_teams)} registros)")

            # Guardar Players Stats
            if player_stats_rows:
                df_players = pd.DataFrame(player_stats_rows)
                out_players = os.path.join(rows_data_dir, "season_stats_players.parquet")
                df_players.to_parquet(out_players, index=False, engine='pyarrow')
                print(f"      ✅ Jugadores stats: {out_players} ({len(df_players)} registros)")
            
            if not team_stats_rows and not player_stats_rows:
                 print(f"      ⚠️ No se encontraron estadísticas para procesar en {season_name}")