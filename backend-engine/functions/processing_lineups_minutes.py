import sys
import os
import json
import pandas as pd
from glob import glob

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

class LineupsMinutesProcessor:
    """
    Procesa 'match_stats' para obtener:
    - Minutos jugados exactos.
    - Titulares vs Suplentes.
    - Formaciones Iniciales (AGREGADO).
    Genera: 'matches_minutes_played.csv'
    """

    def __init__(self, base_output_path="MisDatosFutbol"):
        self.base_output_path = base_output_path

    def process_minutes(self, df_seasons):
        print("⏱️  Calculando Minutos y Formaciones desde Match Stats...")

        if df_seasons.empty: return

        for index, row in df_seasons.iterrows():
            comp_name = str(row['competicion'])
            season_name = str(row['temporada'])
            
            source_dir = os.path.join(self.base_output_path, comp_name, season_name, "match_stats")
            rows_data_dir = os.path.join(self.base_output_path, comp_name, season_name, "rows_data")

            if not os.path.exists(source_dir): continue

            json_files = glob(os.path.join(source_dir, "*.json"))
            print(f"   📂 Procesando {len(json_files)} partidos...")

            all_players_rows = []

            for file_path in json_files:
                try:
                    with open(file_path, 'r', encoding='utf-8') as f:
                        data = json.load(f)

                    match_info = data.get('matchInfo', {})
                    match_id = match_info.get('id')
                    if not match_id: match_id = os.path.splitext(os.path.basename(file_path))[0]
                    
                    match_len = 96 
                    live_data = data.get('liveData', {})
                    if not live_data: continue

                    match_details = live_data.get('matchDetails', {})
                    if 'matchLengthMin' in match_details: match_len = match_details['matchLengthMin']

                    player_tracking = {}
                    lineups = live_data.get('lineUp', [])
                    
                    # --- PROCESAR TITULARES Y FORMACIÓN ---
                    for team in lineups:
                        team_id = team.get('contestantId')
                        formation = team.get('formationUsed', 'Unknown') # Capturamos formación
                        
                        for p in team.get('player', []):
                            pid = p.get('playerId')
                            pname = p.get('matchName') or p.get('firstName') + ' ' + p.get('lastName')
                            
                            player_tracking[pid] = {
                                'id_equipo': team_id,
                                'nombre': pname,
                                'camiseta': p.get('shirtNumber'),
                                'posicion': p.get('position'),
                                'formacion_inicial': formation, # Guardamos el dato
                                'es_titular': 1,
                                'minuto_entrada': 0,
                                'minuto_salida': match_len,
                                'motivo_salida': 'Fin Partido'
                            }

                    # --- PROCESAR CAMBIOS ---
                    subs = live_data.get('substitute', [])
                    for s in subs:
                        time_min = s.get('timeMin')
                        p_out = s.get('playerOutId')
                        p_in = s.get('playerInId')
                        
                        if p_out in player_tracking:
                            player_tracking[p_out]['minuto_salida'] = time_min
                            player_tracking[p_out]['motivo_salida'] = 'Sustituido'
                        
                        player_tracking[p_in] = {
                            'id_equipo': s.get('contestantId'),
                            'nombre': s.get('playerInName'),
                            'camiseta': 0,
                            'posicion': 'Suplente',
                            'formacion_inicial': None, # Suplente no inicia con formación
                            'es_titular': 0,
                            'minuto_entrada': time_min,
                            'minuto_salida': match_len,
                            'motivo_salida': 'Fin Partido'
                        }

                    # --- PROCESAR ROJAS ---
                    for c in live_data.get('card', []):
                        if c.get('type') in ['RC', 'Red']:
                            pid = c.get('playerId')
                            if pid in player_tracking:
                                if player_tracking[pid]['minuto_salida'] > c.get('timeMin'):
                                    player_tracking[pid]['minuto_salida'] = c.get('timeMin')
                                    player_tracking[pid]['motivo_salida'] = 'Expulsado'

                    # --- GENERAR FILAS ---
                    for pid, info in player_tracking.items():
                        mins = info['minuto_salida'] - info['minuto_entrada']
                        if mins < 0: mins = 0
                        
                        all_players_rows.append({
                            'id_partido': match_id,
                            'id_equipo': info['id_equipo'],
                            'id_jugador': pid,
                            'jugador': info['nombre'],
                            'camiseta': info['camiseta'],
                            'posicion': info['posicion'],
                            'formacion_inicial': info['formacion_inicial'], # Nueva Columna
                            'es_titular': info['es_titular'],
                            'minuto_entrada': info['minuto_entrada'],
                            'minuto_salida': info['minuto_salida'],
                            'motivo_salida': info['motivo_salida'],
                            'minutos_jugados': mins
                        })

                except Exception as e:
                    print(f"   ❌ Error en {os.path.basename(file_path)}: {e}")

            if all_players_rows:
                os.makedirs(rows_data_dir, exist_ok=True)
                df = pd.DataFrame(all_players_rows)
                out_path = os.path.join(rows_data_dir, "matches_minutes_played.parquet")
                df.to_parquet(out_path, index=False, engine='pyarrow')
                print(f"   ✅ Archivo generado: {out_path} ({len(df)} registros)")