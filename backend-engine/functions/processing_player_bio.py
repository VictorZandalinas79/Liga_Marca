import sys
import os
import json
import pandas as pd
from glob import glob

# --- AJUSTE DE RUTAS ---
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

class PlayerBioProcessor:
    """
    Procesa los JSON de Biografías de Jugadores (player_bio).
    Genera dos CSVs en 'rows_data':
    1. players_detailed_profiles.csv (Info personal estática)
    2. players_career_stats.csv (Estadísticas por competición/temporada encontradas en la bio)
    """

    def __init__(self, base_output_path="MisDatosFutbol"):
        self.base_output_path = base_output_path

    def process_player_bio(self, df_seasons):
        print("👤 Iniciando procesamiento de Biografías (Player Bio)...")

        if df_seasons.empty:
            print("⚠️ No hay temporadas para procesar.")
            return

        for index, row in df_seasons.iterrows():
            comp_name = str(row['competicion'])
            season_name = str(row['temporada'])
            season_id = str(row['id_temporada'])

            # Rutas
            source_dir = os.path.join(self.base_output_path, comp_name, season_name, "player_bio")
            rows_data_dir = os.path.join(self.base_output_path, comp_name, season_name, "rows_data")

            if not os.path.exists(source_dir):
                # print(f"   ⚠️ No existe carpeta player_bio para {season_name}")
                continue

            json_files = glob(os.path.join(source_dir, "*.json"))
            print(f"   📂 Procesando {len(json_files)} biografías en: {comp_name} - {season_name}")

            profiles_rows = []
            career_stats_rows = []

            for file_path in json_files:
                try:
                    with open(file_path, 'r', encoding='utf-8') as f:
                        data = json.load(f)

                    # La raíz suele ser "person": [ { ... } ]
                    persons = data.get('person', [])
                    if not persons and isinstance(data, dict):
                         # Intento fallback si no está encapsulado
                         persons = [data]

                    for p in persons:
                        p_id = p.get('id')
                        p_name = f"{p.get('firstName', '')} {p.get('lastName', '')}".strip()
                        
                        # --- 1. PERFIL DETALLADO ---
                        profiles_rows.append({
                            'id_jugador': p_id,
                            'nombre_completo': p_name,
                            'nombre_corto': p.get('matchName') or p.get('shortLastName'),
                            'posicion': p.get('position'),
                            'nacionalidad': p.get('nationality'),
                            'fecha_nacimiento': p.get('dateOfBirth'),
                            'lugar_nacimiento': p.get('placeOfBirth'),
                            'pais_nacimiento': p.get('countryOfBirth'),
                            'pie_habil': p.get('foot'), # A veces viene, a veces no
                            'altura': p.get('height'),
                            'peso': p.get('weight'),
                            'genero': p.get('gender'),
                            'tipo': p.get('type')
                        })

                        # --- 2. HISTORIAL / ESTADÍSTICAS (Membership) ---
                        memberships = p.get('membership', [])
                        
                        for mem in memberships:
                            team_name = mem.get('contestantName')
                            team_id = mem.get('contestantId')
                            active = mem.get('active')
                            transfer_type = mem.get('transferType')
                            
                            # Dentro de cada membresía, hay 'stat' que detalla el torneo
                            stats_list = mem.get('stat', [])
                            
                            for s in stats_list:
                                career_stats_rows.append({
                                    # Contexto Jugador
                                    'id_jugador': p_id,
                                    'jugador': p_name,
                                    
                                    # Contexto Equipo/Torneo (del dato histórico)
                                    'equipo': team_name,
                                    'id_equipo': team_id,
                                    'competicion_nombre': s.get('competitionName'), # Ej: Copa Sudamericana
                                    'temporada_nombre': s.get('tournamentCalendarName'), # Ej: 2025
                                    'es_amistoso': s.get('isFriendly'),
                                    
                                    # Métricas Clave
                                    'partidos_jugados': s.get('appearances'),
                                    'minutos_jugados': s.get('minutesPlayed'),
                                    'goles': s.get('goals'),
                                    'asistencias': s.get('assists'),
                                    'amarillas': s.get('yellowCards'),
                                    'rojas': s.get('redCards'),
                                    'suplente_ingresa': s.get('substituteIn'),
                                    'suplente_sale': s.get('substituteOut'),
                                    'en_banco': s.get('subsOnBench'),
                                    'goles_penal': s.get('penaltyGoals'),
                                    'camiseta': s.get('shirtNumber')
                                })

                except Exception as e:
                    print(f"   ❌ Error leyendo {os.path.basename(file_path)}: {e}")

            # --- GUARDAR CSVs ---
            os.makedirs(rows_data_dir, exist_ok=True)

            # 1. Perfiles
            if profiles_rows:
                df_pro = pd.DataFrame(profiles_rows)
                # Eliminar duplicados en perfiles (por si el mismo jugador aparece varias veces)
                df_pro = df_pro.drop_duplicates(subset=['id_jugador'])
                
                out_pro = os.path.join(rows_data_dir, "players_detailed_profiles.parquet")
                df_pro.to_parquet(out_pro, index=False, engine='pyarrow')
                print(f"      ✅ Perfiles guardados: {out_pro} ({len(df_pro)} jug)")

            # 2. Carrera / Stats
            if career_stats_rows:
                df_car = pd.DataFrame(career_stats_rows)
                out_car = os.path.join(rows_data_dir, "players_career_stats.parquet")
                df_car.to_parquet(out_car, index=False, engine='pyarrow')
                print(f"      ✅ Stats carrera guardadas: {out_car} ({len(df_car)} registros)")
            
            if not profiles_rows:
                 print(f"      ⚠️ No se encontraron datos de biografía en {season_name}")