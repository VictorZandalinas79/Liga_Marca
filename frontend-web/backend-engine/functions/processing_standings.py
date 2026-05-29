import sys
import os
import json
import pandas as pd

# --- AJUSTE DE RUTAS ---
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

class StandingsProcessor:
    """
    Procesa el archivo standings.json (Tablas de Posiciones) y genera un CSV limpio.
    Guarda el resultado en la carpeta 'rows_data'.
    """

    def __init__(self, base_output_path="MisDatosFutbol"):
        self.base_output_path = base_output_path

    def process_standings(self, df_seasons):
        """
        Recorre las temporadas, lee standings.json y crea standings_final.csv en rows_data.
        """
        print("📊 Iniciando procesamiento de Tablas de Posiciones...")

        if df_seasons.empty:
            print("⚠️ No hay temporadas para procesar.")
            return

        for index, row in df_seasons.iterrows():
            # Forzamos string para evitar problemas de tipos
            comp_name = str(row['competicion'])
            season_name = str(row['temporada'])
            season_id = str(row['id_temporada'])

            # Definir rutas
            # Source: Donde bajó el scraper
            source_file = os.path.join(self.base_output_path, comp_name, season_name, "standings", "standings.json")
            
            # Target: Carpeta limpia
            rows_data_dir = os.path.join(self.base_output_path, comp_name, season_name, "rows_data")

            if not os.path.exists(source_file):
                # print(f"   ⚠️ No existe standings.json para {season_name}")
                continue

            try:
                # Crear carpeta destino si no existe
                os.makedirs(rows_data_dir, exist_ok=True)

                with open(source_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)

                standings_rows = []

                # --- PARSEO DE LA ESTRUCTURA ---
                # Estructura típica: stage -> division (total/home/away) -> ranking
                stages = data.get('stage', [])
                
                for stage in stages:
                    stage_name = stage.get('name', 'General')
                    
                    divisions = stage.get('division', [])
                    for div in divisions:
                        # Tipo de tabla: total, home, away
                        table_type = div.get('type', 'total') 
                        group_name = div.get('groupName', '') # Ej: "Zona A" o "Liga..."
                        
                        rankings = div.get('ranking', [])
                        
                        for rank in rankings:
                            # Extraemos datos del equipo
                            item = {
                                # Contexto
                                'competicion': comp_name,
                                'temporada': season_name,
                                'id_temporada': season_id,
                                'etapa': stage_name,
                                'grupo': group_name,
                                'tipo_tabla': table_type, # Importante para filtrar luego
                                
                                # Posición y Equipo
                                'posicion': rank.get('rank'),
                                'estado': rank.get('rankStatus'), # Ej: Promotion, Relegation
                                'id_equipo': rank.get('contestantId'),
                                'equipo': rank.get('contestantClubName') or rank.get('contestantName'),
                                'codigo_equipo': rank.get('contestantCode'),
                                
                                # Estadísticas
                                'puntos': rank.get('points'),
                                'pj': rank.get('matchesPlayed'),
                                'pg': rank.get('matchesWon'),
                                'pe': rank.get('matchesDrawn'),
                                'pp': rank.get('matchesLost'),
                                'gf': rank.get('goalsFor'),
                                'gc': rank.get('goalsAgainst'),
                                'dif_gol': rank.get('goaldifference'),
                                
                                # Datos extra (últimos 5 partidos si vienen)
                                'last_10_won': rank.get('lastTenWon'),
                                'last_10_drawn': rank.get('lastTenDrawn'),
                                'last_10_lost': rank.get('lastTenLost')
                            }
                            standings_rows.append(item)

                # --- GUARDAR CSV ---
                if standings_rows:
                    df = pd.DataFrame(standings_rows)
                    output_parquet = os.path.join(rows_data_dir, "standings_final.parquet")
                    df.to_parquet(output_parquet, index=False, engine='pyarrow')

                    print(f"   ✅ Tabla guardada en: {output_parquet} ({len(df)} filas)")
                else:
                    print(f"   ⚠️ Archivo leído pero sin datos de ranking válidos: {season_name}")

            except Exception as e:
                print(f"   ❌ Error procesando standings en {season_name}: {e}")