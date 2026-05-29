import os
import sys
import requests
import pandas as pd
from pathlib import Path
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

# --- IMPORTS DE TUS FUNCIONES ---
# 1. Scrapers Estructurales (Navegación)
from functions.scraping_competitions import CompetitionScraper
from functions.scraping_seasons import SeasonScraper

# 2. Fixture
from functions.scraping_fixture import FixtureScraper

# 3. Datos de Partido (Match)
from functions.scraping_match_events import MatchEventScraper
from functions.scraping_match_stats import MatchStatsScraper
from functions.scraping_match_data import MatchDataScraper

# 4. Datos de Temporada (Season)
from functions.scraping_standings import StandingsScraper
from functions.scraping_season_stats import SeasonStatsScraper
from functions.scraping_squads import SquadsScraper

# 5. Scrapers Pendientes/Opcionales (Bio, Rankings, etc.)
try:
    from functions.scraping_player_bio import PlayerBioScraper
    from functions.scraping_rankings import RankingsScraper
except ImportError:
    pass

# 2. Fixture y Procesamiento
from functions.processing_fixtures import FixtureProcessor
from functions.processing_squads import SquadsProcessor # <-- NUEVO IMPORT
from functions.processing_standings import StandingsProcessor # <-- NUEVO
from functions.processing_match_data import MatchDataProcessor
from functions.processing_season_stats import SeasonStatsProcessor
from functions.processing_match_stats import MatchStatsProcessor
from functions.processing_player_bio import PlayerBioProcessor
from functions.processing_match_events import MatchEventsProcessor
from functions.processing_enriched_events import EnrichedEventProcessor # <-- Nuevo Import
from functions.processing_lineups_minutes import LineupsMinutesProcessor

class FootballClient:
    def __init__(self, sdapi_outlet_key, callback_id, base_output_path="MisDatosFutbol", headers=None):
        """
        Cliente Maestro: Centraliza todas las herramientas de scraping.
        Incluye manejo de sesión robusto con reintentos automáticos.
        """
        self.sdapi_outlet_key = sdapi_outlet_key
        self.callback_id = callback_id
        
        # A. Configuración de Rutas
        self.base_output_path = Path(base_output_path)
        self.base_output_path.mkdir(parents=True, exist_ok=True)
        
        # B. Configuración de Sesión ROBUSTA (Con Reintentos)
        self.session = requests.Session()
        
        # Estrategia de reintentos: 3 intentos, esperando 1s, 2s, 4s entre fallos
        retries = Retry(
            total=3, 
            backoff_factor=1, 
            status_forcelist=[429, 500, 502, 503, 504],
            allowed_methods=["HEAD", "GET", "OPTIONS"]
        )
        adapter = HTTPAdapter(max_retries=retries)
        self.session.mount("https://", adapter)
        self.session.mount("http://", adapter)

        if headers:
            self.session.headers.update(headers)
        
        # --- C. INICIALIZACIÓN DE SCRAPERS ---
        
        # Argumentos comunes para la mayoría de las clases
        common_kwargs = {
            'session': self.session,
            'base_output_path': self.base_output_path,
            'sdapi_outlet_key': self.sdapi_outlet_key,
            'callback_id': self.callback_id
        }

        # 1. Navegación
        self.comp_scraper = CompetitionScraper(session=self.session, base_output_path=self.base_output_path)
        self.season_scraper = SeasonScraper(session=self.session, base_output_path=self.base_output_path)
        
        # 2. Fixture
        self.fixture_scraper = FixtureScraper(**common_kwargs)
        
        # 3. Detalles del Partido
        self.events_scraper = MatchEventScraper(**common_kwargs)
        self.stats_scraper = MatchStatsScraper(**common_kwargs)
        self.match_data_scraper = MatchDataScraper(**common_kwargs)
        
        # 4. Datos de Temporada y Equipos
        self.standings_scraper = StandingsScraper(**common_kwargs)
        self.season_stats_scraper = SeasonStatsScraper(**common_kwargs)
        self.squads_scraper = SquadsScraper(**common_kwargs)
        
        # 5. Opcionales (si existen los imports)
        if 'PlayerBioScraper' in globals(): 
            self.player_bio_scraper = PlayerBioScraper(**common_kwargs)
        if 'RankingsScraper' in globals():
            self.rankings_scraper = RankingsScraper(**common_kwargs)

        self.fixture_processor = FixtureProcessor(base_output_path=self.base_output_path)
        self.squads_processor = SquadsProcessor(base_output_path=self.base_output_path)
        self.standings_processor = StandingsProcessor(base_output_path=self.base_output_path)
        self.match_data_processor = MatchDataProcessor(base_output_path=self.base_output_path)
        self.season_stats_processor = SeasonStatsProcessor(base_output_path=self.base_output_path)
        self.match_stats_processor = MatchStatsProcessor(base_output_path=self.base_output_path)
        self.player_bio_processor = PlayerBioProcessor(base_output_path=self.base_output_path)
        self.match_events_processor = MatchEventsProcessor(base_output_path=self.base_output_path)
        self.enriched_event_processor = EnrichedEventProcessor(base_output_path=self.base_output_path, base_data_folder="data/base")
        self.minutes_processor = LineupsMinutesProcessor(base_output_path=self.base_output_path)
    # --- WRAPPERS: MÉTODOS PÚBLICOS FÁCILES DE USAR ---

    def get_competitions(self):
        """Descarga lista de competiciones."""
        return self.comp_scraper.scrape_all()

    def get_seasons(self, df_competitions):
        """Descarga temporadas para las competiciones dadas."""
        return self.season_scraper.scrape_all_seasons(df_competitions)

    def get_fixture(self, df_seasons, index=0):
        """Descarga el JSON del fixture para una temporada específica."""
        if df_seasons.empty: return False
        season_row = df_seasons.iloc[index]
        return self.fixture_scraper.download_fixture_for_season(season_row)

    def process_fixture(self, df_seasons, index=0):
        """
        Convierte el JSON del fixture a un DataFrame/CSV.
        Retorna: df_fixture (con IDs de partidos y equipos).
        """
        if df_seasons.empty: return None
        season_row = df_seasons.iloc[index]
        return self.fixture_processor.process_season_fixture(season_row)

    def get_match_events(self, df_seasons, df_fixture, index=0):
        """Descarga eventos (goles, tarjetas) para los partidos."""
        if df_seasons.empty or df_fixture.empty: return
        row = df_seasons.iloc[index]
        self.events_scraper.download_events_for_season(
            str(row['competicion']), str(row['temporada']), df_fixture
        )

    def get_match_stats(self, df_seasons, df_fixture, index=0):
        """Descarga estadísticas del partido (posesión, tiros)."""
        if df_seasons.empty or df_fixture.empty: return
        row = df_seasons.iloc[index]
        self.stats_scraper.download_stats_for_season(
            str(row['competicion']), str(row['temporada']), df_fixture
        )

    def get_match_data(self, df_seasons, df_fixture, index=0):
        """Descarga metadata del partido (árbitros, estadio)."""
        if df_seasons.empty or df_fixture.empty: return
        row = df_seasons.iloc[index]
        self.match_data_scraper.download_match_data_for_season(
            str(row['competicion']), str(row['temporada']), df_fixture
        )

    def get_standings(self, df_seasons, index=0):
        """Descarga la tabla de posiciones."""
        if df_seasons.empty: return
        row = df_seasons.iloc[index]
        # Usamos id_temporada como tmcl (Legacy URL)
        self.standings_scraper.download_standings_for_season(
            str(row['competicion']), str(row['temporada']), str(row['id_temporada'])
        )

    def _extract_teams_from_fixture(self, df_fixture):
        """Helper para obtener lista única de equipos desde el fixture."""
        locales = df_fixture[['id_local', 'equipo_local']].rename(columns={'id_local': 'id', 'equipo_local': 'nombre'})
        visitas = df_fixture[['id_visita', 'equipo_visita']].rename(columns={'id_visita': 'id', 'equipo_visita': 'nombre'})
        return pd.concat([locales, visitas]).drop_duplicates(subset=['id']).dropna()

    def get_season_stats(self, df_seasons, df_fixture, index=0):
        """Descarga estadísticas acumuladas de la temporada por equipo."""
        if df_seasons.empty or df_fixture.empty: return
        row = df_seasons.iloc[index]
        df_equipos = self._extract_teams_from_fixture(df_fixture)
        
        self.season_stats_scraper.download_season_stats_from_list(
            str(row['competicion']), str(row['temporada']), str(row['id_temporada']), df_equipos
        )

    def get_squads(self, df_seasons, index=0):
        """
        Descarga los planteles (jugadores) de TODOS los equipos de la temporada.
        """
        if df_seasons.empty: return
        row = df_seasons.iloc[index]
        
        # Ahora el scraper se encarga de todo, solo necesita la temporada
        self.squads_scraper.download_squads_for_season(
            str(row['competicion']), 
            str(row['temporada']), 
            str(row['id_temporada'])
        )

    def get_rankings(self, df_seasons, index=0):
        """Descarga rankings (goleadores, asistencias) de la temporada."""
        if df_seasons.empty: return
        row = df_seasons.iloc[index]
        # Verificamos si se cargó el módulo (por si acaso)
        if hasattr(self, 'rankings_scraper'):
            self.rankings_scraper.download_rankings_for_season(
                str(row['competicion']), 
                str(row['temporada']), 
                str(row['id_temporada'])
            )
        else:
            print("⚠️ El módulo RankingsScraper no se ha cargado correctamente.")

    def get_player_bio(self, df_seasons, df_players, index=0, limit=None):
        """
        Descarga biografías (NLG) para la temporada actual.
        """
        if df_seasons.empty or df_players is None or df_players.empty:
            print("⚠️ Faltan datos de temporada o jugadores.")
            return

        row = df_seasons.iloc[index]
        season_id = str(row['id_temporada']) # Extraemos el hash de la temporada
        
        id_list = df_players['id_jugador'].unique().tolist()
        
        if limit:
            print(f"🧪 MODO PRUEBA: Limitando a {limit} jugadores.")
            id_list = id_list[:limit]
        
        if hasattr(self, 'player_bio_scraper'):
            # Pasamos season_id como tercer argumento
            self.player_bio_scraper.download_bios_from_id_list(
                str(row['competicion']), 
                str(row['temporada']), 
                season_id, 
                id_list
            )
        else:
            print("⚠️ El módulo PlayerBioScraper no está cargado.")

    def get_single_player(self, df_seasons, player_id, index=0):
        """
        Descarga la bio de un jugador específico por su ID.
        """
        if df_seasons.empty: return
        row = df_seasons.iloc[index]
        
        if hasattr(self, 'player_bio_scraper'):
            self.player_bio_scraper.download_single_player(
                str(row['competicion']), 
                str(row['temporada']), 
                player_id
            )
        else:
            print("⚠️ El módulo PlayerBioScraper no está cargado.")
    
    def process_squads_to_csv(self, df_seasons):
        """
        Convierte los JSON de squads descargados en un CSV maestro de jugadores.
        Retorna el DataFrame de jugadores únicos.
        """
        return self.squads_processor.process_squads_to_csv(df_seasons)

    def process_standings(self, df_seasons, index=0):
        """
        Procesa el JSON de posiciones y genera un CSV limpio en rows_data.
        """
        if df_seasons.empty: return
        # Pasamos el DataFrame completo, el procesador se encarga de filtrar o iterar
        # Pero para mantener consistencia con tu uso actual, podemos filtrar aquí si quieres
        # O dejar que el procesador itere todo. 
        # Para seguir tu patrón de "index", haremos un slice de 1 fila:
        
        row = df_seasons.iloc[[index]] # Doble corchete mantiene formato DataFrame
        self.standings_processor.process_standings(row)

    def process_match_data(self, df_seasons, index=0):
        """
        Procesa los JSON individuales de partidos (match_data) a CSV.
        """
        if df_seasons.empty: return
        row = df_seasons.iloc[[index]]
        self.match_data_processor.process_match_data(row)

    def process_season_stats(self, df_seasons, index=0):
        """
        Procesa los JSON de estadísticas de temporada (Equipos y Jugadores) a CSV.
        """
        if df_seasons.empty: return
        row = df_seasons.iloc[[index]]
        self.season_stats_processor.process_season_stats(row)
    
    def process_match_stats(self, df_seasons, index=0):
        """
        Procesa los JSON de match_stats y genera matches_stats.csv en rows_data.
        """
        if df_seasons.empty: return
        row = df_seasons.iloc[[index]]
        self.match_stats_processor.process_match_stats(row)

    def process_player_bio(self, df_seasons, index=0):
        """
        Procesa los JSON de player_bio y genera CSVs de perfil y carrera.
        """
        if df_seasons.empty: return
        row = df_seasons.iloc[[index]]
        self.player_bio_processor.process_player_bio(row)

    def process_match_events(self, df_seasons, index=0):
        """
        Procesa los eventos granulares (Goles, Tarjetas, X/Y) a múltiples CSVs.
        """
        if df_seasons.empty: return
        row = df_seasons.iloc[[index]]
        self.match_events_processor.process_match_events(row)
    
    def process_enriched_events(self, df_seasons, index=0):
        """
        Genera clean_event_data.json con xT y Qualifiers mapeados.
        Requiere data/base/ con los archivos Excel de Opta.
        """
        if df_seasons.empty: return
        row = df_seasons.iloc[[index]]
        self.enriched_event_processor.process_season_enriched(row)

    def process_minutes_played(self, df_seasons, index=0):
        """
        Calcula minutos jugados usando match_stats (Lineups + Subs + Rojas).
        """
        if df_seasons.empty: return
        row = df_seasons.iloc[[index]]
        self.minutes_processor.process_minutes(row)

    def run_full_pipeline(self, df_seasons, index=0):
        """
        EJECUCIÓN MAESTRA: Corre todos los procesadores en el orden correcto
        para generar el Data Warehouse completo de una temporada.
        """
        if df_seasons.empty:
            print("⚠️ No hay temporadas seleccionadas.")
            return

        row = df_seasons.iloc[[index]]
        comp = row.iloc[0]['competicion']
        season = row.iloc[0]['temporada']

        print(f"\n🚀 INICIANDO PIPELINE COMPLETO PARA: {comp} - {season}")
        print("="*60)

        # 1. Fixture (Fundamental: crea carpetas y define partidos)
        print("\n[1/10] 📅 Procesando Fixture...")
        self.process_fixture(row, index=0)

        # 2. Squads (Fundamental: necesario para nombres en eventos)
        print("\n[2/10] 👥 Procesando Planteles (Squads)...")
        self.process_squads_to_csv(row)

        # 3. Match Data (Detalles: Estadios, Árbitros)
        print("\n[3/10] 🏟️ Procesando Fichas de Partido (Match Data)...")
        self.process_match_data(row, index=0)

        # 4. Match Stats (Estadísticas: Posesión, Tiros)
        # IMPORTANTE: Se necesita antes de calcular minutos
        print("\n[4/10] 📊 Procesando Estadísticas de Partido (Match Stats)...")
        self.process_match_stats(row, index=0)

        # 5. Minutos Jugados (Depende de Match Stats)
        print("\n[5/10] ⏱️ Calculando Minutos y Titularidades...")
        self.process_minutes_played(row, index=0)

        # 6. Tablas y Rankings
        print("\n[6/10] 🏆 Procesando Tablas y Rankings...")
        self.process_standings(row, index=0)
        self.process_rankings(row, index=0)

        # 7. Season Stats (Acumulados)
        print("\n[7/10] 📈 Procesando Estadísticas de Temporada...")
        self.process_season_stats(row, index=0)

        # 8. Player Bio (Perfiles)
        print("\n[8/10] 👤 Procesando Biografías...")
        self.process_player_bio(row, index=0)

        # 9. Match Events (CSVs: Tiros, Pases, Matriz, Defensa)
        print("\n[9/10] ⚡ Procesando Eventos Tácticos (CSVs)...")
        self.process_match_events(row, index=0)

        # 10. Enriched Events (JSON Clean Data + xT + Qualifiers)
        # Requiere archivos en data/base/
        print("\n[10/10] 💎 Generando Master Dataset (xT & Clean JSON)...")
        self.process_enriched_events(row, index=0)

        print("="*60)
        print(f"✅ PIPELINE FINALIZADO EXITOSAMENTE PARA: {season}")