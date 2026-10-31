// Fotos de estadios para el fondo de la cabecera del partido.
//
// Fuentes:
//  - tuespaciodefutbol.es.tl/Estadios-_-España.htm (una foto por club, 500 px,
//    servidas desde img.webme.com). La página está organizada por club, no por
//    estadio: el mapeo estadio → archivo está hecho a mano.
//  - Transfermarkt (img.a.transfermarkt.technology): bloquea el scraping (AWS WAF),
//    así que sus fotos se añaden a mano copiando las URLs del carrusel.
//
// Si un estadio tiene varias fotos se elige una al azar. Si no tiene ninguna,
// la cabecera usa la vista de satélite.
//
// La clave se compara contra el nombre del estadio normalizado (sin tildes, en
// minúsculas), así vale tanto para los nombres de Opta como para los de venues.ts.

const TEF = 'https://img.webme.com/pic/t/tuespaciodefutbol/'
const TM = 'https://img.a.transfermarkt.technology/foto/newsansicht/'

const STADIUM_PHOTOS: [keyword: string, urls: string[]][] = [
  // Primera
  ['camp nou', [TEF + 'estbarcelona2026.png', TM + 'spotify-camp-nou-fc-barcelona-2025-1763391077-183033.jpg']],
  ['bernabeu', [TEF + 'estrealmadrid3.jpg']],
  ['metropolitano', [TEF + 'estatmadrid.png']],
  ['mestalla', [TEF + 'estvalencia.jpg']],
  ['pizjuan', [TEF + 'estsevilla3.jpg']],
  ['villamarin', [TEF + 'estbetis3.png']],
  ['san mames', [TEF + 'estathleticbilbao3.jpg']],
  ['balaidos', [TEF + 'estcelta3.jpg']],
  ['anoeta', [TEF + 'estrealsociedad3.jpg']],
  ['reale arena', [TEF + 'estrealsociedad3.jpg']],
  ['sadar', [TEF + 'estosasuna2.jpg']],
  ['vallecas', [TEF + 'estrayovallecano2.jpg']],
  ['coliseum', [TEF + 'estGetafe2.jpg']],
  ['ceramica', [TEF + 'estvillarreal2.jpg']],
  ['montilivi', [TEF + 'estgirona4.jpg']],
  ['son moix', [TEF + 'estmallorca2.jpg']],
  ['rcde', [TEF + 'estespanyol3.jpg']],
  ['mendizorroza', [TEF + 'estalaves2.jpg']],
  ['martinez valero', [TEF + 'estelche3.jpg']],
  ['tartiere', [TEF + 'estoviedo2.jpg']],
  ['ciudad de valencia', [TEF + 'estlevante2.jpg']],
  ['ciutat de valencia', [TEF + 'estlevante2.jpg']],
  // Segunda
  ['butarque', [TEF + 'estleganes2.jpg']],
  ['zorrilla', [TEF + 'estvalladolid.jpg']],
  ['gran canaria', [TEF + 'estlaspalmas3.jpg']],
  ['ipurua', [TEF + 'esteibar2.jpg']],
  ['molinon', [TEF + 'estsportinggijon2.jpg']],
  ['almeria', [TEF + 'estalmeria2.jpg']],
  ['carmenes', [TEF + 'estgranada2.jpg']],
  ['castalia', [TEF + 'estcastellon.jpg']],
  ['mirandilla', [TEF + 'estcadiz2.jpg']],
  ['arcangel', [TEF + 'estcordoba3.jpg']],
  ['plantio', [TEF + 'estburgos2.jpg']],
  ['belmonte', [TEF + 'estalbacete2.jpg']],
  ['rosaleda', [TEF + 'estmalaga.jpg']],
  ['sardinero', [TEF + 'estracingsantander.jpg']],
  ['riazor', [TEF + 'estdeportivocoru%C3%B1a.jpg']],
  ['alfonso murube', [TEF + 'estceuta.jpg']],
  ['zubieta', [TEF + 'estrealsociedadb2.png']],
  ['heliodoro', [TEF + 'esttenerife2.jpg']],
  ['pepico amat', [TEF + 'esteldense.png']],
  ['nova creu alta', [TEF + 'estsabadell.png']],
]

function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
}

/** Todas las fotos conocidas de un estadio (vacío si no hay). */
export function getStadiumPhotos(venueName?: string | null): string[] {
  if (!venueName) return []
  const norm = normalize(venueName)
  for (const [kw, urls] of STADIUM_PHOTOS) {
    if (norm.includes(kw)) return urls
  }
  return []
}

/** Una foto al azar del estadio, o null si no hay ninguna. */
export function pickStadiumPhoto(venueName?: string | null): string | null {
  const photos = getStadiumPhotos(venueName)
  if (photos.length === 0) return null
  return photos[Math.floor(Math.random() * photos.length)]
}
