// Colores de club (principal / secundario) para teñir las fichas de jugador.
// Se buscan por palabras clave del nombre normalizado para tolerar variantes
// ("Atlético de Madrid" / "Atlético Madrid", "Alavés" / "Deportivo Alavés"...).

export interface TeamColors {
  primary: string
  secondary: string
}

const DEFAULT_COLORS: TeamColors = { primary: '#64748b', secondary: '#94a3b8' }

// El orden importa: las claves más específicas van antes ("real sociedad"
// antes que "real madrid"/"betis", "atletico" antes que "athletic").
const TEAM_COLORS: Array<[string[], TeamColors]> = [
  [['real sociedad'], { primary: '#0067b1', secondary: '#ffffff' }],
  [['real madrid'], { primary: '#e8e8e8', secondary: '#febe10' }],
  [['atletico'], { primary: '#cb3524', secondary: '#272e61' }],
  [['athletic'], { primary: '#ee2523', secondary: '#ffffff' }],
  [['barcelona', 'barca'], { primary: '#a50044', secondary: '#004d98' }],
  [['betis'], { primary: '#0bb363', secondary: '#ffffff' }],
  [['sevilla'], { primary: '#d81920', secondary: '#ffffff' }],
  [['villarreal'], { primary: '#ffe667', secondary: '#005187' }],
  [['valencia'], { primary: '#ee3524', secondary: '#ffdf1c' }],
  [['celta'], { primary: '#8ac3ee', secondary: '#e5254e' }],
  [['alaves'], { primary: '#0761af', secondary: '#ffffff' }],
  [['espanyol'], { primary: '#007fc8', secondary: '#ffffff' }],
  [['getafe'], { primary: '#005999', secondary: '#ffffff' }],
  [['girona'], { primary: '#cd2534', secondary: '#ffffff' }],
  [['levante'], { primary: '#b4053f', secondary: '#004d98' }],
  [['mallorca'], { primary: '#e20613', secondary: '#000000' }],
  [['osasuna'], { primary: '#d91a21', secondary: '#0a346f' }],
  [['rayo'], { primary: '#e53027', secondary: '#ffffff' }],
  [['oviedo'], { primary: '#0047ab', secondary: '#ffffff' }],
  [['elche'], { primary: '#05642c', secondary: '#ffffff' }],
  [['las palmas'], { primary: '#ffe400', secondary: '#0055a5' }],
  [['leganes'], { primary: '#0055a5', secondary: '#ffffff' }],
  [['valladolid'], { primary: '#5c2d91', secondary: '#ffffff' }],
]

function normalize(name: string): string {
  return name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

export function getTeamColors(teamName?: string | null): TeamColors {
  if (!teamName) return DEFAULT_COLORS
  const n = normalize(teamName)
  const match = TEAM_COLORS.find(([keys]) => keys.some(k => n.includes(k)))
  return match ? match[1] : DEFAULT_COLORS
}
