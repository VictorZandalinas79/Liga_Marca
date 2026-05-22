import sys
import os
import json
import pandas as pd
from glob import glob

# --- AJUSTE DE RUTAS ---
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

class MatchEventsProcessor:
    """
    Procesa 'Match Events' generando tablas de acciones de juego.
    SE ELIMINÓ: Lineups, Formaciones y Cambios (se procesan en Match Stats).
    SE MANTIENE: Tiros, Pases, Defensa y Matriz de Pases.
    """

    def __init__(self, base_output_path="MisDatosFutbol"):
        self.base_output_path = base_output_path

    def process_match_events(self, df_seasons):
        print("⚡ Iniciando procesamiento de Eventos de Juego (Tiros, Pases, Defensa)...")

        if df_seasons.empty:
            print("⚠️ No hay temporadas para procesar.")
            return

        for index, row in df_seasons.iterrows():
            comp_name = str(row['competicion'])
            season_name = str(row['temporada'])
            
            # Buscar carpeta events
            source_dir = None
            for folder_name in ["events", "match_events", "match_event"]:
                path = os.path.join(self.base_output_path, comp_name, season_name, folder_name)
                if os.path.exists(path):
                    source_dir = path
                    break
            
            rows_data_dir = os.path.join(self.base_output_path, comp_name, season_name, "rows_data")

            if not source_dir:
                print(f"   ⚠️ No se encontró carpeta de eventos para {season_name}")
                continue

            json_files = glob(os.path.join(source_dir, "*.json"))
            print(f"   📂 Procesando {len(json_files)} partidos desde: {os.path.basename(source_dir)}")

            # Listas acumuladoras (Solo eventos de juego)
            rows_shots = []
            rows_passes = []
            rows_matrix = []
            rows_defense = []

            for file_path in json_files:
                try:
                    with open(file_path, 'r', encoding='utf-8') as f:
                        data = json.load(f)

                    match_info = data.get('matchInfo', {})
                    match_id = match_info.get('id')
                    if not match_id:
                        match_id = os.path.splitext(os.path.basename(file_path))[0]
                    
                    live_data = data.get('liveData', {})
                    if not live_data: continue

                    events = live_data.get('event', [])
                    pass_matrix_local = {} 

                    for i, e in enumerate(events):
                        type_id = e.get('typeId')
                        contestant_id = e.get('contestantId')
                        player_id = e.get('playerId')
                        player_name = e.get('playerName')
                        outcome = e.get('outcome')
                        x = e.get('x')
                        y = e.get('y')
                        minuto = e.get('timeMin')
                        segundo = e.get('timeSec')

                        # --- DISPAROS (13, 14, 15, 16) ---
                        if type_id in [13, 14, 15, 16]:
                            rows_shots.append({
                                'id_partido': match_id,
                                'id_equipo': contestant_id,
                                'minuto': minuto,
                                'segundo': segundo,
                                'id_jugador': player_id,
                                'jugador': player_name,
                                'tipo_tiro': type_id,
                                'outcome': outcome,
                                'x': x,
                                'y': y,
                                'es_gol': 1 if type_id == 16 else 0
                            })

                        # --- DEFENSA (4, 7, 8, 49) ---
                        if type_id in [4, 7, 8, 49]:
                            defense_type = {4:'Tackle', 7:'Intercepcion', 8:'Despeje', 49:'Recuperacion'}.get(type_id, str(type_id))
                            rows_defense.append({
                                'id_partido': match_id,
                                'id_equipo': contestant_id,
                                'minuto': minuto,
                                'id_jugador': player_id,
                                'jugador': player_name,
                                'tipo_accion': defense_type,
                                'outcome': outcome,
                                'x': x,
                                'y': y
                            })

                        # --- PASES (1) ---
                        if type_id == 1:
                            end_x = e.get('x') 
                            end_y = e.get('y')
                            qs = e.get('qualifier', [])
                            for q in qs:
                                if q.get('qualifierId') == 140: end_x = q.get('value')
                                if q.get('qualifierId') == 141: end_y = q.get('value')
                            
                            rows_passes.append({
                                'id_partido': match_id,
                                'id_equipo': contestant_id,
                                'minuto': minuto,
                                'segundo': segundo,
                                'id_pasador': player_id,
                                'pasador': player_name,
                                'outcome': outcome,
                                'x_inicio': x,
                                'y_inicio': y,
                                'x_fin': end_x,
                                'y_fin': end_y
                            })

                            # Matriz de Pases
                            if outcome == 1 and i + 1 < len(events):
                                next_e = events[i+1]
                                if next_e.get('contestantId') == contestant_id:
                                    rid = next_e.get('playerId')
                                    rname = next_e.get('playerName')
                                    if rid and rid != player_id:
                                        key = (player_id, player_name, rid, rname, contestant_id)
                                        pass_matrix_local[key] = pass_matrix_local.get(key, 0) + 1

                    # Volcar Matriz Local
                    for (pid, pname, rid, rname, tid), count in pass_matrix_local.items():
                        rows_matrix.append({
                            'id_partido': match_id,
                            'id_equipo': tid,
                            'id_pasador': pid,
                            'pasador': pname,
                            'id_receptor': rid,
                            'receptor': rname,
                            'cantidad_pases': count
                        })

                except Exception as e:
                    print(f"   ❌ Error procesando {os.path.basename(file_path)}: {e}")

            # --- GUARDAR PARQUETS ---
            os.makedirs(rows_data_dir, exist_ok=True)

            def save_parquet(data, name, label):
                if data:
                    df = pd.DataFrame(data)
                    path = os.path.join(rows_data_dir, name)
                    df.to_parquet(path, index=False, engine='pyarrow')
                    print(f"      ✅ {label}: {path} ({len(df)} regs)")
                else:
                    print(f"      ⚠️ {label}: Sin datos.")

            save_parquet(rows_shots, "events_shots.parquet", "Tiros")
            save_parquet(rows_defense, "events_defense.parquet", "Defensa")
            save_parquet(rows_passes, "events_passes.parquet", "Pases Raw")
            save_parquet(rows_matrix, "events_pass_matrix.parquet", "Matriz de Pases")