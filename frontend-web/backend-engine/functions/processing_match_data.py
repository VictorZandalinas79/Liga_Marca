import sys
import os
import json
import pandas as pd
from glob import glob

# --- AJUSTE DE RUTAS ---
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

class MatchDataProcessor:
    """
    Procesa los JSONs individuales de la carpeta 'match_data'.
    Extrae detalles como Estadio, Árbitro, Asistencia, etc.
    Guarda el resultado en 'rows_data/matches_details.csv'.
    """

    def __init__(self, base_output_path="MisDatosFutbol"):
        self.base_output_path = base_output_path

    def process_match_data(self, df_seasons):
        """
        Recorre las temporadas, busca la carpeta match_data y procesa cada JSON.
        """
        print("🏟️ Iniciando procesamiento de Fichas de Partido (Match Data)...")

        if df_seasons.empty:
            print("⚠️ No hay temporadas para procesar.")
            return

        for index, row in df_seasons.iterrows():
            comp_name = str(row['competicion'])
            season_name = str(row['temporada'])
            season_id = str(row['id_temporada'])

            # Rutas
            source_dir = os.path.join(self.base_output_path, comp_name, season_name, "match_data")
            rows_data_dir = os.path.join(self.base_output_path, comp_name, season_name, "rows_data")

            if not os.path.exists(source_dir):
                # print(f"   ⚠️ No existe carpeta match_data para {season_name}")
                continue

            # Buscar todos los JSONs
            json_files = glob(os.path.join(source_dir, "*.json"))
            print(f"   📂 Procesando {len(json_files)} partidos en: {comp_name} - {season_name}")

            matches_rows = []

            for file_path in json_files:
                try:
                    with open(file_path, 'r', encoding='utf-8') as f:
                        data = json.load(f)

                    # La clave principal suele ser matchInfo
                    info = data.get('matchInfo', {})
                    if not info:
                        continue

                    match_id = info.get('id')
                    
                    # --- 1. ESTADIO ---
                    venue = info.get('venue', {})
                    stadium_name = venue.get('longName') or venue.get('shortName')
                    city = venue.get('city')

                    # --- 2. ÁRBITROS ---
                    # Buscamos el árbitro principal ("Referee")
                    referee_name = "Desconocido"
                    officials = info.get('officials', [])
                    for off in officials:
                        if off.get('type') == 'Referee':
                            # Concatenar nombre
                            first = off.get('firstName', '')
                            last = off.get('lastName', '')
                            referee_name = f"{first} {last}".strip()
                            break
                    
                    # --- 3. DATOS ADICIONALES ---
                    attendance = info.get('attendance')
                    weather = info.get('weather') # A veces viene
                    
                    # --- 4. EQUIPOS Y ENTRENADORES ---
                    # A veces los managers están en contestant -> official
                    home_manager = ""
                    away_manager = ""
                    
                    contestants = info.get('contestant', [])
                    for c in contestants:
                        c_pos = c.get('position') # home / away
                        # Buscar manager en la lista de oficiales del equipo
                        # (La estructura puede variar, esto es un intento común)
                        # Nota: Si no viene en matchInfo, a veces está en liveData, 
                        # pero por ahora nos centramos en matchInfo que es lo seguro del archivo.
                        pass 

                    # Construir la fila
                    item = {
                        'competicion': comp_name,
                        'temporada': season_name,
                        'id_temporada': season_id,
                        'id_partido': match_id,
                        'descripcion': info.get('description'),
                        'fecha_local': info.get('localDate'),
                        'hora_local': info.get('localTime'),
                        'jornada': info.get('week') or (info.get('round') or {}).get('number'),

                        # Detalles extraídos
                        'estadio': stadium_name,
                        'ciudad': city,
                        'arbitro': referee_name,
                        'asistencia': attendance,
                        'coordenadas': venue.get('googleMapCoordinates')
                    }
                    matches_rows.append(item)

                except Exception as e:
                    print(f"   ❌ Error leyendo {os.path.basename(file_path)}: {e}")

            # --- GUARDAR PARQUET ---
            if matches_rows:
                # Crear carpeta destino
                os.makedirs(rows_data_dir, exist_ok=True)
                
                df = pd.DataFrame(matches_rows)
                # Guardar en rows_data
                output_parquet = os.path.join(rows_data_dir, "fixture_final.parquet")

                # Saneamiento obligatorio para Parquet (evita errores de tipos mixtos)
                for col in df.select_dtypes(include=['object']).columns:
                    df[col] = df[col].astype(str).replace('nan', None)

                df.to_parquet(output_parquet, index=False, engine='pyarrow')

                print(f"      ✅ Detalles guardados en: {output_parquet} ({len(df)} partidos)")
            else:
                print(f"      ⚠️ No se extrajeron datos de partidos para {season_name}")