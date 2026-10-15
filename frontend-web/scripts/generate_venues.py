import json
import glob
import unicodedata

# 1. From fixture.json
with open('data/LaLiga/2025/2026/fixture/fixture.json', 'r', encoding='utf-8') as f:
    fixtures_data = json.load(f)

fixture_venues = {}
team_venues = {}

for m in fixtures_data:
    minfo = m.get('matchInfo', {})
    mid = minfo.get('id')
    v = minfo.get('venue')
    contestants = minfo.get('contestant', [])
    home_id = None
    for c in contestants:
        if c.get('position') == 'home':
            home_id = c.get('id')
    if v and 'latitude' in v and 'longitude' in v:
        v_entry = {
            'id': v.get('id'),
            'name': v.get('longName') or v.get('shortName') or 'Estadio',
            'shortName': v.get('shortName') or v.get('longName') or 'Estadio',
            'lat': round(float(v.get('latitude')), 6),
            'lon': round(float(v.get('longitude')), 6)
        }
        if mid:
            fixture_venues[mid] = v_entry
        if home_id:
            team_venues[home_id] = v_entry

# 2. From all other data files
for fpath in glob.glob('data/**/*.json', recursive=True):
    try:
        with open(fpath, 'r', encoding='utf-8') as f:
            d = json.load(f)
            items = d if isinstance(d, list) else [d]
            for it in items:
                minfo = it.get('matchInfo') or it.get('info', {}) or {}
                v = minfo.get('venue')
                contestants = minfo.get('contestant', [])
                mid = minfo.get('id')
                if v and 'latitude' in v and 'longitude' in v:
                    v_entry = {
                        'id': v.get('id'),
                        'name': v.get('longName') or v.get('shortName') or 'Estadio',
                        'shortName': v.get('shortName') or v.get('longName') or 'Estadio',
                        'lat': round(float(v.get('latitude')), 6),
                        'lon': round(float(v.get('longitude')), 6)
                    }
                    if mid and mid not in fixture_venues:
                        fixture_venues[mid] = v_entry
                    for c in contestants:
                        if c.get('position') == 'home' and 'id' in c:
                            if c['id'] not in team_venues:
                                team_venues[c['id']] = v_entry
    except Exception:
        pass

# Explicit known teams from real_teams in Supabase
known_real_teams = {
    '1r541mega6d838hi0p44sv0h2': {
        'id': '7r0v5px7gqs90ak0n46oyg6vy',
        'name': 'Estadio Abanca-Riazor',
        'shortName': 'Riazor',
        'lat': 43.368720,
        'lon': -8.417530
    },
    '7012hpp3p5vg4fzyn3h0yvf09': {
        'id': '63dh9i87h7ipxwwcp36aslpfr',
        'name': 'Estadio La Rosaleda',
        'shortName': 'La Rosaleda',
        'lat': 36.734209,
        'lon': -4.426602
    },
    'bzkwzatvwahmbzok1ymm5vqa1': {
        'id': 'ajntng3bgkrny5s8tc69kuvhe',
        'name': 'Campos de Sport de El Sardinero',
        'shortName': 'El Sardinero',
        'lat': 43.476299,
        'lon': -3.793282
    },
    'agh9ifb2mw3ivjusgedj7c3fe': {
        'id': 'spotify_camp_nou',
        'name': 'Spotify Camp Nou',
        'shortName': 'Camp Nou',
        'lat': 41.380890,
        'lon': 2.122813
    },
    'ah8dala7suqqkj04n2l8xz4zd': {
        'id': 'benito_villamarin',
        'name': 'Estadio Benito Villamarín',
        'shortName': 'Benito Villamarín',
        'lat': 37.356450,
        'lon': -5.981777
    }
}
team_venues.update(known_real_teams)

# Ordered keyword rules (more specific first to avoid false positives like "deportivo" matching Alavés)
ordered_keyword_venues = [
    ('alaves', {'id': 'mendizorroza', 'name': 'Estadio de Mendizorroza', 'shortName': 'Mendizorroza', 'lat': 42.837076, 'lon': -2.688247}),
    ('coruna', {'id': 'riazor', 'name': 'Estadio Abanca-Riazor', 'shortName': 'Riazor', 'lat': 43.368720, 'lon': -8.417530}),
    ('riazor', {'id': 'riazor', 'name': 'Estadio Abanca-Riazor', 'shortName': 'Riazor', 'lat': 43.368720, 'lon': -8.417530}),
    ('deportivo de a coruna', {'id': 'riazor', 'name': 'Estadio Abanca-Riazor', 'shortName': 'Riazor', 'lat': 43.368720, 'lon': -8.417530}),
    ('deportivo de la coruna', {'id': 'riazor', 'name': 'Estadio Abanca-Riazor', 'shortName': 'Riazor', 'lat': 43.368720, 'lon': -8.417530}),
    ('rc deportivo', {'id': 'riazor', 'name': 'Estadio Abanca-Riazor', 'shortName': 'Riazor', 'lat': 43.368720, 'lon': -8.417530}),
    ('malaga', {'id': 'rosaleda', 'name': 'Estadio La Rosaleda', 'shortName': 'La Rosaleda', 'lat': 36.734209, 'lon': -4.426602}),
    ('racing', {'id': 'sardinero', 'name': 'Campos de Sport de El Sardinero', 'shortName': 'El Sardinero', 'lat': 43.476299, 'lon': -3.793282}),
    ('levante', {'id': 'ciudad_valencia', 'name': 'Estadio Ciudad de Valencia', 'shortName': 'Ciutat de València', 'lat': 39.494686, 'lon': -0.363820}),
    ('atletico de madrid', {'id': 'metropolitano', 'name': 'Riyadh Air Metropolitano', 'shortName': 'Metropolitano', 'lat': 40.436226, 'lon': -3.599460}),
    ('club atletico', {'id': 'metropolitano', 'name': 'Riyadh Air Metropolitano', 'shortName': 'Metropolitano', 'lat': 40.436226, 'lon': -3.599460}),
    ('barcelona', {'id': 'camp_nou', 'name': 'Spotify Camp Nou', 'shortName': 'Camp Nou', 'lat': 41.380890, 'lon': 2.122813}),
    ('barca', {'id': 'camp_nou', 'name': 'Spotify Camp Nou', 'shortName': 'Camp Nou', 'lat': 41.380890, 'lon': 2.122813}),
    ('real madrid', {'id': 'bernabeu', 'name': 'Estadio Bernabéu', 'shortName': 'Bernabéu', 'lat': 40.453068, 'lon': -3.688354}),
    ('valencia cf', {'id': 'mestalla', 'name': 'Estadio de Mestalla', 'shortName': 'Mestalla', 'lat': 39.474602, 'lon': -0.358257}),
    ('valencia', {'id': 'mestalla', 'name': 'Estadio de Mestalla', 'shortName': 'Mestalla', 'lat': 39.474602, 'lon': -0.358257}),
    ('sevilla', {'id': 'pizjuan', 'name': 'Estadio Ramón Sánchez-Pizjuán', 'shortName': 'Sánchez-Pizjuán', 'lat': 37.384046, 'lon': -5.970592}),
    ('betis', {'id': 'villamarin', 'name': 'Estadio Benito Villamarín', 'shortName': 'Benito Villamarín', 'lat': 37.356450, 'lon': -5.981777}),
    ('athletic', {'id': 'san_mames', 'name': 'Estadio de San Mamés', 'shortName': 'San Mamés', 'lat': 43.264173, 'lon': -2.949383}),
    ('celta', {'id': 'balaidos', 'name': 'Estadio Abanca-Balaídos', 'shortName': 'Balaídos', 'lat': 42.211852, 'lon': -8.739721}),
    ('sociedad', {'id': 'anoeta', 'name': 'Estadio Municipal de Anoeta', 'shortName': 'Anoeta', 'lat': 43.301376, 'lon': -1.973602}),
    ('osasuna', {'id': 'sadar', 'name': 'Estadio El Sadar', 'shortName': 'El Sadar', 'lat': 42.796677, 'lon': -1.637141}),
    ('rayo', {'id': 'vallecas', 'name': 'Estadio de Vallecas', 'shortName': 'Vallecas', 'lat': 40.391823, 'lon': -3.658589}),
    ('getafe', {'id': 'coliseum', 'name': 'Estadio Coliseum', 'shortName': 'Coliseum', 'lat': 40.325729, 'lon': -3.714964}),
    ('villarreal', {'id': 'ceramica', 'name': 'Estadio de la Cerámica', 'shortName': 'La Cerámica', 'lat': 39.944119, 'lon': -0.103474}),
    ('girona', {'id': 'montilivi', 'name': 'Estadi Municipal de Montilivi', 'shortName': 'Montilivi', 'lat': 41.961195, 'lon': 2.828495}),
    ('mallorca', {'id': 'son_moix', 'name': 'Estadi Mallorca Son Moix', 'shortName': 'Son Moix', 'lat': 39.589940, 'lon': 2.630078}),
    ('espanyol', {'id': 'rcde', 'name': 'RCDE Stadium', 'shortName': 'RCDE Stadium', 'lat': 41.347860, 'lon': 2.075622}),
    ('elche', {'id': 'valero', 'name': 'Estadio Manuel Martínez Valero', 'shortName': 'Martínez Valero', 'lat': 38.267129, 'lon': -0.663300}),
    ('oviedo', {'id': 'tartiere', 'name': 'Estadio Municipal Carlos Tartiere', 'shortName': 'Carlos Tartiere', 'lat': 43.360762, 'lon': -5.870261}),
    ('zaragoza', {'id': 'romareda', 'name': 'Estadio La Romareda', 'shortName': 'La Romareda', 'lat': 41.632500, 'lon': -0.901667}),
    ('valladolid', {'id': 'zorrilla', 'name': 'Estadio Municipal José Zorrilla', 'shortName': 'José Zorrilla', 'lat': 41.644580, 'lon': -4.761264}),
    ('leganes', {'id': 'butarque', 'name': 'Estadio Ontime Butarque', 'shortName': 'Butarque', 'lat': 40.340472, 'lon': -3.760688}),
    ('eibar', {'id': 'ipurua', 'name': 'Estadio Municipal de Ipurúa', 'shortName': 'Ipurúa', 'lat': 43.181765, 'lon': -2.475851}),
    ('sporting', {'id': 'molinon', 'name': 'Estadio Municipal El Molinón', 'shortName': 'El Molinón', 'lat': 43.536284, 'lon': -5.637397}),
    ('almeria', {'id': 'almeria_stadium', 'name': 'UD Almería Stadium', 'shortName': 'Power Horse', 'lat': 36.840039, 'lon': -2.435457}),
    ('granada', {'id': 'carmenes', 'name': 'Estadio Nuevo Los Cármenes', 'shortName': 'Los Cármenes', 'lat': 37.152946, 'lon': -3.595737}),
    ('las palmas', {'id': 'gran_canaria', 'name': 'Estadio de Gran Canaria', 'shortName': 'Gran Canaria', 'lat': 28.100362, 'lon': -15.456707}),
    ('castellon', {'id': 'castalia', 'name': 'Estadio SkyFi Castalia', 'shortName': 'Castalia', 'lat': 39.996126, 'lon': -0.038629}),
    ('cadiz', {'id': 'mirandilla', 'name': 'Estadio Nuevo Mirandilla', 'shortName': 'Nuevo Mirandilla', 'lat': 36.502552, 'lon': -6.272941}),
    ('cordoba', {'id': 'arcangel', 'name': 'Estadio Nuevo Arcángel', 'shortName': 'Nuevo Arcángel', 'lat': 37.872239, 'lon': -4.764539}),
    ('burgos', {'id': 'plantio', 'name': 'Estadio Municipal de El Plantío', 'shortName': 'El Plantío', 'lat': 42.344266, 'lon': -3.680600}),
    ('huesca', {'id': 'alcoraz', 'name': 'Estadio El Alcoraz', 'shortName': 'El Alcoraz', 'lat': 42.131891, 'lon': -0.424599}),
    ('mirandes', {'id': 'anduva', 'name': 'Estadio Municipal de Anduva', 'shortName': 'Anduva', 'lat': 42.680826, 'lon': -2.935431}),
    ('albacete', {'id': 'belmonte', 'name': 'Estadio Carlos Belmonte', 'shortName': 'Carlos Belmonte', 'lat': 38.981146, 'lon': -1.852114})
]

ts_content = f"""// Catálogo completo de estadios y coordenadas de fútbol español (LaLiga EA Sports + Hypermotion)
export interface VenueInfo {{
  id: string
  name: string
  shortName: string
  lat: number
  lon: number
}}

// Mapa de sedes por ID de fixture (partido específico)
export const FIXTURE_VENUES: Record<string, VenueInfo> = {json.dumps(fixture_venues, indent=2, ensure_ascii=False)};

// Mapa de sedes por ID del equipo local
export const TEAM_VENUES: Record<string, VenueInfo> = {json.dumps(team_venues, indent=2, ensure_ascii=False)};

// Lista de reglas por orden de prioridad para emparejar por nombre de equipo
export const ORDERED_KEYWORD_VENUES: [string, VenueInfo][] = {json.dumps(ordered_keyword_venues, indent=2, ensure_ascii=False)};

/**
 * Normaliza una cadena quitando tildes y caracteres especiales
 */
function normalizeStr(s: string): string {{
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\\u0300-\\u036f]/g, '')
    .trim()
}}

/**
 * Obtiene la información del estadio para un partido dado su ID, ID del equipo local y/o nombre del equipo
 */
export function getVenueInfo(
  fixtureId?: string | null,
  homeTeamId?: string | null,
  homeTeamName?: string | null
): VenueInfo | null {{
  if (fixtureId && FIXTURE_VENUES[fixtureId]) {{
    return FIXTURE_VENUES[fixtureId]
  }}
  if (homeTeamId && TEAM_VENUES[homeTeamId]) {{
    return TEAM_VENUES[homeTeamId]
  }}
  if (homeTeamName) {{
    const norm = normalizeStr(homeTeamName)
    for (const [kw, venue] of ORDERED_KEYWORD_VENUES) {{
      if (norm.includes(kw)) {{
        return venue
      }}
    }}
  }}
  return null
}}

/**
 * Genera la URL de la foto de satélite de alta resolución (ArcGIS Esri World Imagery)
 * Se ajusta el bounding box centrado en las coordenadas del estadio
 */
export function getStadiumSatelliteUrl(lat: number, lon: number, width = 800, height = 450): string {{
  // Delta para encuadrar el campo de fútbol perfectamente (zoom centrado en el terreno de juego)
  const dLat = 0.0018
  const dLon = 0.0032
  const minLon = (lon - dLon).toFixed(6)
  const minLat = (lat - dLat).toFixed(6)
  const maxLon = (lon + dLon).toFixed(6)
  const maxLat = (lat + dLat).toFixed(6)
  const bbox = `${{minLon}},${{minLat}},${{maxLon}},${{maxLat}}`

  return `https://services.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/export?bbox=${{bbox}}&bboxSR=4326&imageSR=4326&size=${{width}},${{height}}&format=jpg&f=image`
}}

/**
 * URL para abrir el estadio directamente en Google Maps en vista satélite
 */
export function getGoogleMapsSatelliteUrl(lat: number, lon: number): string {{
  return `https://www.google.com/maps/search/?api=1&query=${{lat}},${{lon}}&t=k`
}}
"""

with open('src/lib/venues.ts', 'w', encoding='utf-8') as f:
    f.write(ts_content)

print(f"Generated src/lib/venues.ts with {len(fixture_venues)} fixtures and {len(team_venues)} teams.")
