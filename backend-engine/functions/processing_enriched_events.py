import sys
import os
import json
import pandas as pd
import numpy as np
import re
from glob import glob

# --- AJUSTE DE RUTAS ---
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

class EnrichedEventProcessor:
    """
    Procesador Avanzado de Eventos.
    - Cruza con Opta Dictionaries (Qualifiers, TypeIds).
    - Cruza con Rosters (Squads).
    - Calcula xT (Expected Threat).
    - Genera 'clean_event_data.json' consolidado.
    """

    def __init__(self, base_output_path="MisDatosFutbol", base_data_folder="data/base"):
        self.base_output_path = base_output_path
        self.base_data_folder = base_data_folder
        self.type_id_map = None
        self.qualifier_map = None
        self.xt_grid = None
        self._load_auxiliary_files()

    def _load_auxiliary_files(self):
        """Carga los archivos excel/csv de soporte (Base)."""
        try:
            path_type = os.path.join(self.base_data_folder, "Opta_typeId.xlsx")
            path_qual = os.path.join(self.base_data_folder, "Opta_qualifiers.xlsx")
            path_xt = os.path.join(self.base_data_folder, "xT_Grid.csv")

            print(f"📂 Cargando archivos base desde: {self.base_data_folder}")
            
            if os.path.exists(path_type):
                self.type_id_map = pd.read_excel(path_type)
                if 'id' in self.type_id_map.columns and 'description' in self.type_id_map.columns:
                     self.type_id_dict = dict(zip(self.type_id_map['id'], self.type_id_map['description']))
                else:
                     self.type_id_dict = {}
                print("   ✅ Opta_typeId cargado.")
            else:
                print("   ⚠️ Faltan Opta_typeId.xlsx. Se usarán IDs crudos.")
                self.type_id_dict = {}

            if os.path.exists(path_qual):
                self.qualifier_map = pd.read_excel(path_qual)
                if 'id' in self.qualifier_map.columns and 'description' in self.qualifier_map.columns:
                     self.qualifier_dict = dict(zip(self.qualifier_map['id'], self.qualifier_map['description']))
                else:
                     self.qualifier_dict = {}
                print("   ✅ Opta_qualifiers cargado.")
            else:
                print("   ⚠️ Faltan Opta_qualifiers.xlsx. Se usarán IDs crudos.")
                self.qualifier_dict = {}

            if os.path.exists(path_xt):
                self.xt_grid = pd.read_csv(path_xt, header=None).values
                print("   ✅ xT_Grid cargado.")
            else:
                print("   ⚠️ Falta xT_Grid.csv. No se calculará xT.")
                self.xt_grid = None

        except Exception as e:
            print(f"   ❌ Error cargando archivos base: {e}")

    def _calculate_xt(self, df):
        """Aplica la lógica de xT Grid al DataFrame de eventos."""
        if self.xt_grid is None or df.empty:
            return df

        # Solo calculamos si tenemos coordenadas de inicio y fin
        if not {'x', 'y', 'endX', 'endY'}.issubset(df.columns):
            return df
            
        # Copia para cálculo
        df_calc = df.copy()
        
        # Binning (Opta 0-100)
        h, w = self.xt_grid.shape
        
        # Asegurar tipos numéricos y llenar nulos
        cols = ['x', 'y', 'endX', 'endY']
        for col in cols:
            df_calc[col] = pd.to_numeric(df_calc[col], errors='coerce').fillna(0)

        df_calc['x1_bin'] = pd.cut(df_calc['x'], bins=w, labels=False).fillna(0).astype(int)
        df_calc['y1_bin'] = pd.cut(df_calc['y'], bins=h, labels=False).fillna(0).astype(int)
        df_calc['x2_bin'] = pd.cut(df_calc['endX'], bins=w, labels=False).fillna(0).astype(int)
        df_calc['y2_bin'] = pd.cut(df_calc['endY'], bins=h, labels=False).fillna(0).astype(int)

        def get_xt(row, x_col, y_col):
            r = min(max(row[y_col], 0), h-1)
            c = min(max(row[x_col], 0), w-1)
            return self.xt_grid[r, c]

        df_calc['start_xt'] = df_calc.apply(lambda r: get_xt(r, 'x1_bin', 'y1_bin'), axis=1)
        df_calc['end_xt'] = df_calc.apply(lambda r: get_xt(r, 'x2_bin', 'y2_bin'), axis=1)
        
        df['xT'] = df_calc['end_xt'] - df_calc['start_xt']
        
        return df

    def process_season_enriched(self, df_seasons):
        print("💎 Iniciando Generación de Clean Event Data (Enriched)...")

        if df_seasons.empty: return

        for index, row in df_seasons.iterrows():
            comp_name = str(row['competicion'])
            season_name = str(row['temporada'])
            
            # --- CORRECCIÓN DE RUTA: Busca múltiples opciones ---
            source_events = None
            # Probamos nombres comunes
            for folder_name in ["events", "match_events", "match_event"]:
                path = os.path.join(self.base_output_path, comp_name, season_name, folder_name)
                if os.path.exists(path):
                    source_events = path
                    break
            
            source_squads = os.path.join(self.base_output_path, comp_name, season_name, "squads")
            rows_data_dir = os.path.join(self.base_output_path, comp_name, season_name, "rows_data")
            os.makedirs(rows_data_dir, exist_ok=True)
            
            if not source_events:
                print(f"   ⚠️ No se encontró carpeta de eventos en {comp_name}/{season_name}")
                continue

            json_files = glob(os.path.join(source_events, "*.json"))
            print(f"   📂 Procesando {len(json_files)} partidos desde: {os.path.basename(source_events)}")

            all_events_accumulator = []

            for file_path in json_files:
                try:
                    with open(file_path, 'r', encoding='utf-8') as f:
                        data = json.load(f)

                    match_info = data.get('matchInfo', {})
                    match_id = match_info.get('id', os.path.splitext(os.path.basename(file_path))[0])
                    match_desc = match_info.get('description', '')
                    
                    # Cargar Roster (Squads)
                    contestants = match_info.get('contestant', [])
                    squad_map = {} 
                    
                    for cont in contestants:
                        tid = cont.get('id')
                        squad_file = os.path.join(source_squads, f"{cont.get('name')}_{tid}.json")
                        if not os.path.exists(squad_file):
                            potential = glob(os.path.join(source_squads, f"*{tid}.json"))
                            if potential: squad_file = potential[0]
                        
                        if os.path.exists(squad_file):
                            with open(squad_file, 'r', encoding='utf-8') as sf:
                                sdata = json.load(sf)
                                players = sdata.get('players', sdata.get('squad', []))
                                for p in players:
                                    # Guardamos datos clave
                                    squad_map[p.get('id')] = {
                                        'name': p.get('matchName') or p.get('firstName') + ' ' + p.get('lastName'),
                                        'position': p.get('position'),
                                        'shirt': p.get('shirtNumber')
                                    }

                    # Procesar eventos
                    events = data.get('liveData', {}).get('event', [])
                    match_events_list = []
                    
                    for e in events:
                        evt = {
                            'match_id': match_id,
                            'match_name': match_desc,
                            'id': e.get('id'),
                            'eventId': e.get('eventId'),
                            'typeId': e.get('typeId'),
                            'type_name': self.type_id_dict.get(e.get('typeId'), str(e.get('typeId'))),
                            'periodId': e.get('periodId'),
                            'timeMin': e.get('timeMin'),
                            'timeSec': e.get('timeSec'),
                            'outcome': e.get('outcome'),
                            'x': e.get('x'),
                            'y': e.get('y'),
                            'playerId': e.get('playerId'),
                            'teamId': e.get('contestantId'),
                            'playerName': e.get('playerName'),
                        }
                        
                        # Completar datos faltantes con Squads
                        if evt['playerId'] in squad_map:
                            if not evt['playerName']: evt['playerName'] = squad_map[evt['playerId']]['name']
                            evt['player_position'] = squad_map[evt['playerId']]['position']
                            evt['shirt_number'] = squad_map[evt['playerId']]['shirt']

                        # Qualifiers
                        qualifiers = e.get('qualifier', [])
                        evt['endX'] = evt['x'] 
                        evt['endY'] = evt['y']
                        
                        for q in qualifiers:
                            qid = q.get('qualifierId')
                            qval = q.get('value')
                            qname = self.qualifier_dict.get(qid, f"qualifier_{qid}")

                            # Si el qualifier existe pero no tiene valor, asignar 1 (flag de presencia)
                            evt[qname] = qval if qval not in (None, '') else 1

                            # Coordenadas finales explícitas para xT
                            if qid == 140: evt['endX'] = float(qval)
                            if qid == 141: evt['endY'] = float(qval)

                        match_events_list.append(evt)

                    if match_events_list:
                        df_match = pd.DataFrame(match_events_list)
                        # Calcular xT
                        df_match = self._calculate_xt(df_match)
                        
                        # Limpieza para JSON (evitar NaN)
                        records = df_match.where(pd.notnull(df_match), None).to_dict(orient='records')
                        all_events_accumulator.extend(records)

                except Exception as e:
                    print(f"   ❌ Error en {os.path.basename(file_path)}: {e}")

            if all_events_accumulator:
                out_pq = os.path.join(rows_data_dir, "clean_event_data.parquet")
                df_pq = pd.DataFrame(all_events_accumulator)
                
                # Saneamiento ULTRA SEGURO para Parquet
                # Convierte cualquier tipo mixto a string explícito, pero mantiene los vacíos (None) reales
                for col in df_pq.select_dtypes(include=['object']).columns:
                    df_pq[col] = df_pq[col].apply(lambda x: str(x) if pd.notna(x) else None)
                
                df_pq.to_parquet(out_pq, index=False, engine='pyarrow')
                
                print(f"   ✅ CLEAN DATA GENERADA: {len(df_pq)} eventos.")
                print(f"      📍 {out_pq}")
