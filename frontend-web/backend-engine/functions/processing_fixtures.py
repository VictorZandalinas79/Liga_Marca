import sys
import os
import json
import pandas as pd
from datetime import datetime

# --- AJUSTE DE RUTAS ---
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

class FixtureProcessor:
    """
    Clase para procesar JSON de Fixture y generar CSV limpio.
    Guarda el resultado en la carpeta 'rows_data'.
    CORREGIDO: Soporta JSONs que son listas directas o diccionarios.
    """
    
    def __init__(self, base_output_path="MisDatosFutbol"):
        self.base_output_path = base_output_path

    def _parse_match(self, match, season_row):
        """Helper para procesar un solo partido del JSON."""
        try:
            # Validación de seguridad: match debe ser un diccionario
            if not isinstance(match, dict):
                return None

            # --- 1. DATOS BÁSICOS ---
            match_info = match.get('matchInfo', {})
            match_id = match_info.get('id')
            description = match_info.get('description')
            
            # Fecha y Hora
            date_full = match_info.get('date')  # Ej: 2025-01-26Z
            time_full = match_info.get('time')  # Ej: 17:00:00Z
            
            # Limpieza básica de fecha/hora
            date_str = date_full.replace('Z', '') if date_full else None
            time_str = time_full.replace('Z', '') if time_full else None
            
            # --- 2. EQUIPOS ---
            contestants = match_info.get('contestant', [])
            home = {}
            away = {}
            
            for c in contestants:
                position = c.get('position')
                if position == 'home':
                    home = c
                elif position == 'away':
                    away = c
            
            # --- 3. RESULTADO ---
            live_data = match.get('liveData', {})
            scores = live_data.get('matchDetails', {}).get('scores', {}).get('total', {})
            
            home_goals = scores.get('home')
            away_goals = scores.get('away')

            # --- 4. CONSTRUCCIÓN DE LA FILA ---
            # Forzamos str() en competición/temporada para evitar errores de tipo
            row = {
                'id_partido': match_id,
                'fecha': date_str,
                'hora': time_str,
                'descripcion': description,
                
                # Equipos
                'id_local': home.get('id'),
                'equipo_local': home.get('name'),
                'id_visita': away.get('id'),
                'equipo_visita': away.get('name'),
                
                # Goles 
                'goles_local': home_goals,
                'goles_visita': away_goals,
                'estado': match_info.get('status'),
                
                # Contexto
                'competicion': str(season_row.get('competicion')),
                'temporada': str(season_row.get('temporada')),
                'jornada': match_info.get('week') or match_info.get('round', {}).get('number')
            }
            return row

        except Exception as e:
            # print(f"Error parseando partido: {e}")
            return None

    def process_season_fixture(self, season_row):
        """
        Lee el fixture.json y genera fixture_final.csv en la carpeta rows_data.
        """
        # 1. Normalizar entrada
        if isinstance(season_row, pd.DataFrame):
            if not season_row.empty:
                season_row = season_row.iloc[0]
            else:
                return pd.DataFrame()

        comp_name = str(season_row.get('competicion', 'Unknown'))
        season_name = str(season_row.get('temporada', 'Unknown'))
        
        # 2. Rutas de Lectura (Source)
        source_folder = os.path.join(self.base_output_path, comp_name, season_name, "fixture")
        json_file = os.path.join(source_folder, "fixture.json")

        # 3. Rutas de Escritura (Target) -> rows_data
        target_folder = os.path.join(self.base_output_path, comp_name, season_name, "rows_data")
        
        print(f"⚙️ Procesando fixture para: {comp_name} - {season_name}")
        
        if not os.path.exists(json_file):
            print(f"   ⚠️ No se encontró el archivo: {json_file}")
            return pd.DataFrame()

        try:
            # Crear carpeta rows_data si no existe
            os.makedirs(target_folder, exist_ok=True)
            
            with open(json_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            matches = []
            match_list = []

            # --- LÓGICA DE DETECCIÓN DE ESTRUCTURA ---
            if isinstance(data, list):
                # Caso A: El JSON es directamente una lista de partidos [{}, {}]
                match_list = data
                # print("   ℹ️ Estructura detectada: Lista directa")
            elif isinstance(data, dict):
                # Caso B: El JSON es un diccionario {"match": [{}, {}]}
                match_list = data.get('match', [])
                # print("   ℹ️ Estructura detectada: Diccionario con clave 'match'")
            else:
                print(f"   ⚠️ Estructura JSON desconocida: {type(data)}")
                return pd.DataFrame()
            
            if not match_list:
                print("   ⚠️ La lista de partidos está vacía.")
                return pd.DataFrame()

            # Procesar
            for m in match_list:
                parsed = self._parse_match(m, season_row)
                if parsed:
                    matches.append(parsed)
            
            if matches:
                df = pd.DataFrame(matches)
                
                # Guardar en rows_data
                output_parquet = os.path.join(target_folder, "fixture_final.parquet")
                
                # Saneamiento obligatorio para Parquet (evita errores de tipos mixtos)
                for col in df.select_dtypes(include=['object']).columns:
                    df[col] = df[col].astype(str).replace('nan', None)
                    
                df.to_parquet(output_parquet, index=False, engine='pyarrow')
                
                print(f"   ✅ Fixture guardado en: {output_parquet} ({len(df)} partidos)")
                return df
            else:
                print("   ⚠️ No se pudieron procesar partidos válidos.")
                return pd.DataFrame()

        except Exception as e:
            print(f"   ❌ Error procesando fixture: {e}")
            # Para debug profundo, descomenta esto:
            # import traceback
            # traceback.print_exc()
            return pd.DataFrame()