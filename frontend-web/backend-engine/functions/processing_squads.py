import os
import json
import pandas as pd
from glob import glob
from pathlib import Path

class SquadsProcessor:
    """
    Procesa los archivos JSON de Squads y genera CSVs organizados en carpetas 'rows_data'.
    """

    def __init__(self, base_output_path):
        self.base_output_path = Path(base_output_path)

    def process_squads_to_csv(self, df_seasons):
        """
        Genera CSVs de jugadores dentro de la carpeta 'rows_data' de cada temporada.
        Retorna un DataFrame consolidado de todos los jugadores procesados.
        """
        print("🔄 Iniciando procesamiento de Squads a CSV...")
        
        all_seasons_players = [] # Acumulador global para retornar al final

        if df_seasons.empty:
            print("⚠️ No hay temporadas para procesar.")
            return None

        # Iterar por cada temporada
        for index, row in df_seasons.iterrows():
            comp_name = str(row['competicion'])
            season_name = str(row['temporada'])
            season_id = str(row['id_temporada'])
            
            # Definir rutas
            season_dir = self.base_output_path / comp_name / season_name
            squads_dir = season_dir / "squads"
            
            # --- NUEVA CARPETA SOLICITADA ---
            rows_data_dir = season_dir / "rows_data"
            
            if not squads_dir.exists():
                continue

            # Crear carpeta rows_data si no existe
            rows_data_dir.mkdir(parents=True, exist_ok=True)

            json_files = glob(str(squads_dir / "*.json"))
            print(f"   📂 Procesando {len(json_files)} equipos en: {comp_name} - {season_name}")
            
            # Lista temporal solo para esta temporada
            current_season_players = []

            for file_path in json_files:
                try:
                    with open(file_path, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                        
                    # Extraer info del equipo
                    team_info = data.get('team', {})
                    if not team_info and 'contestant' in data: 
                        # Ajuste para formato 'contestant' si el JSON es diferente
                        if isinstance(data['contestant'], dict):
                            team_info = data['contestant']
                        else:
                             # Caso donde contestantName está plano
                             team_info = {'id': data.get('contestantId'), 'name': data.get('contestantName')}
                    
                    team_name = team_info.get('name', 'Desconocido')
                    team_id = team_info.get('id', '')
                    
                    # Extraer lista de jugadores
                    players = data.get('players', [])
                    # Soporte para estructuras alternativas
                    if not players:
                        if 'squad' in data: players = data['squad']
                        elif 'person' in data: players = data['person']
                    
                    # Procesar cada jugador
                    for p in players:
                        player_row = {
                            # Contexto
                            'competicion': comp_name,
                            'temporada': season_name,
                            'id_temporada': season_id,
                            'equipo': team_name,
                            'id_equipo': team_id,
                            
                            # Identificadores
                            'id_jugador': p.get('id'),
                            'nombre': p.get('firstName'),
                            'apellido': p.get('lastName'),
                            'nombre_corto': p.get('matchName') or p.get('shortLastName'),
                            
                            # Datos Físicos/Bio
                            'nacionalidad': p.get('nationality'),
                            'posicion': p.get('position'),
                            'fecha_nacimiento': p.get('dateOfBirth'),
                            'lugar_nacimiento': p.get('placeOfBirth'),
                            'altura': p.get('height'),
                            'peso': p.get('weight'),
                            'pie': p.get('foot'),
                            'camiseta': p.get('shirtNumber'),
                            'estado': p.get('status')
                        }
                        current_season_players.append(player_row)
                        all_seasons_players.append(player_row)
                        
                except Exception as e:
                    print(f"   ❌ Error leyendo {os.path.basename(file_path)}: {e}")

            # --- GUARDADO POR TEMPORADA EN ROWS_DATA ---
            if current_season_players:
                df_season = pd.DataFrame(current_season_players)
                
                # 1. Archivo Detallado (Jugadores por equipo)
                file_full = rows_data_dir / "players_by_season_team.parquet"
                df_season.to_parquet(file_full, index=False, engine='pyarrow')

                # 2. Archivo Maestro Único (Sin repetidos por ID, para Bio)
                df_unique = df_season.drop_duplicates(subset=['id_jugador'])
                file_master = rows_data_dir / "master_players_list.parquet"
                df_unique.to_parquet(file_master, index=False, engine='pyarrow')

                print(f"      ✅ Guardados Parquets en: {rows_data_dir}")

        # Retornar el acumulado global (únicos) para el scraper de Bio
        if all_seasons_players:
            df_global = pd.DataFrame(all_seasons_players)
            return df_global.drop_duplicates(subset=['id_jugador'])
        else:
            return None