# Sistema de Sincronización de Partidos en Vivo

Este sistema permite seguir partidos de fútbol en tiempo real y actualizar automáticamente las puntuaciones de los jugadores en tu aplicación.

## 📋 Características

- **Detección automática**: El scheduler detecta partidos que empiezan en los próximos 2 minutos
- **Descarga de squads**: Obtiene automáticamente las alineaciones de ambos equipos
- **Eventos en vivo**: Procesa goles, tarjetas, sustituciones, etc. en tiempo real
- **Cálculo de puntos**: Sistema completo de Fantasy Football basado en eventos Opta
- **Actualización Supabase**: Sube los datos a tu base de datos cada ~30 segundos
- **Desglose detallado**: Cada punto queda registrado con su métrica correspondiente

## 🚀 Configuración

### 1. Ejecutar la migración SQL

En el dashboard de Supabase, ve a SQL Editor y ejecuta:

```bash
# Copia el contenido de migrations/002_update_player_scores.sql
```

Esto creará la tabla `player_scores` con todas las columnas necesarias.

### 2. Configurar el scheduler (Opcional pero recomendado)

Para ejecución automática, añade al crontab:

```bash
crontab -e
```

Añade esta línea para que se ejecute cada minuto:

```
* * * * * cd /Users/victorzandal/Proyectos/Liga_Marca && python scheduler.py >> logs/scheduler.log 2>&1
```

### 3. Ejecución manual

Si prefieres ejecutar manualmente para un partido específico:

```bash
# Espera a que falten ~2 minutos para el partido
python sync_live_matches.py <fixture_id> <match_id>
```

Ejemplo:
```bash
python sync_live_matches.py abc123 1iz38m02tzgh8x5a9yg2ztgyc
```

## 📁 Archivos del Sistema

| Archivo | Descripción |
|---------|-------------|
| `sync_live_matches.py` | Script principal de sincronización |
| `scheduler.py` | Scheduler que detecta partidos automáticamente |
| `descarga_squads.py` | Descarga las alineaciones de los equipos |
| `descarga_eventos.py` | Descarga eventos en vivo de la API |
| `migrations/002_update_player_scores.sql` | Migración de la tabla player_scores |

## 🏗️ Estructura de la Base de Datos

### Tabla `player_scores`

Contiene TODAS las métricas de cada jugador en cada partido:

**Datos básicos:**
- `player_id`, `fixture_id`, `match_id`
- `team_id`, `position` (POR, DEF, MED, DEL)
- `is_starter`, `minutes_played`
- `total_points`

**Goles y Portería:**
- `goals`, `goal_header_bonus`, `goal_freekick_bonus`, `own_goals`
- `goals_conceded`, `clean_sheet`

**Asistencias:**
- `assists`, `key_passes`, `second_assists`, `intent_assists`

**Tiros:**
- `shots_on_target`, `shots_off_target`, `shots_hit_woodwork`
- `big_chances_created`, `big_chances_missed`
- `penalties_scored`, `penalties_missed`, `penalties_won`, `penalties_conceded`

**Portero:**
- `saves`, `penalty_saves`, `claims_ok`, `claims_fail`
- `fumbles`, `crosses_not_claimed`, `punches_ok`, `punches_fail`
- `smothers`, `sweepers_ok`, `sweepers_fail`
- `parries_safe`, `parries_danger`

**Defensa:**
- `clearances`, `clearances_last_line`, `blocked_crosses`
- `interceptions`, `tackles_won`, `tackles_lost`
- `blocked_shots`, `blocked_passes`
- `ball_recoveries`, `offsides_provoked`, `challenges_lost`

**Errores:**
- `errors_leading_to_shot`, `errors_leading_to_goal`

**Pases:**
- `passes_completed`, `passes_attempted`, `pass_accuracy`
- `progressive_passes`, `passes_into_final_third`, `passes_into_box`
- `through_balls`, `crosses_completed`, `switch_plays`
- `pull_backs`, `long_balls_completed`, `lay_offs`

**Regates y Técnica:**
- `takeons_won`, `takeons_lost`, `takeons_overrun`
- `good_skills`, `dispossessed`, `bad_touches`

**Juego Aéreo:**
- `aerials_won`, `aerials_lost`, `aerial_success_rate`

**Faltas y Tarjetas:**
- `fouls_committed`, `fouls_won`
- `yellow_cards`, `second_yellow_cards`, `red_cards`

## 🎯 Sistema de Puntuación

### Porteros (POR)
- Parada: +0.6 pts
- Penalti parado: +6 pts
- Portería a cero: +4 pts
- Gol: +12 pts

### Defensas (DEF)
- Entrada ganada: +0.4 pts
- Intercepción: +0.3 pts
- Despeje: +0.3 pts
- Despeje última línea: +0.8 pts
- Portería a cero: +4 pts
- Gol: +10 pts

### Medios (MED)
- Pase progresivo: +0.2 pts
- Regate completado: +0.5 pts
- Portería a cero: +1 pts
- Gol: +8 pts

### Delanteros (DEL)
- Gol: +6 pts
- Asistencia: +4 pts
- Tiro a puerta: +1 pts

### Comunes
- Amarilla: -1 pts
- Roja: -5 pts
- Segunda amarilla: -3 pts
- Autogol: -4 pts

## 📱 Páginas de la Aplicación

### `/partidos`
Lista todos los partidos agrupados por jornada.
- Click en un partido → Detalle del partido
- Indicator visual para partidos que empiezan en ≤2 min

### `/partidos/[id]`
Detalle de un partido específico:
- Marcador en vivo
- Jugadores de ambos equipos (titulares y suplentes)
- Puntos de cada jugador en tiempo real
- Click en jugador → Detalle del jugador

### `/jugadores/[id]`
Perfil completo de un jugador:
- Foto, datos personales y físicos
- Precio y estadísticas acumuladas
- Rendimiento por partido
- **Desglose detallado de puntos**: Al clickar en un partido, muestra CADA métrica con su explicación y porqué de los puntos

## 🔧 Troubleshooting

### El scheduler no detecta partidos
1. Verifica que los fixtures estén en Supabase con `start_time` correcto
2. Comprueba la zona horaria (debe estar en UTC o tu hora local)
3. Revisa `logs/scheduler.log` para errores

### Error al conectar con la API
1. Verifica que `headers/headers.json` exista y sea válido
2. Asegúrate de que `SDAPI_OUTLET_KEY` es correcto
3. Comprueba tu conexión a internet

### Los puntos no se actualizan
1. Verifica que la tabla `player_scores` tenga todas las columnas
2. Comprueba que `SUPABASE_SERVICE_ROLE_KEY` sea correcta
3. Revisa los logs del proceso de sincronización

## 📊 Monitorización

Para ver el estado del scheduler:

```bash
# Ver logs en tiempo real
tail -f logs/scheduler.log

# Ver procesos activos
ps aux | grep sync_live_matches

# Ver partidos en seguimiento
pgrep -af sync_live_matches
```

## 🎯 Flujo de Uso Típico

1. **Antes del partido** (días antes):
   - Los fixtures ya están en Supabase
   - El scheduler está corriendo

2. **2 minutos antes**:
   - El scheduler detecta el partido próximo
   - Inicia `sync_live_matches.py` automáticamente
   - Se descargan los squads

3. **Durante el partido**:
   - Eventos se procesan en tiempo real
   - Datos se suben a Supabase cada ~30s
   - La app muestra actualizaciones al instante

4. **Final del partido**:
   - Se aplica bonus de portería a cero
   - Última actualización a Supabase
   - Proceso termina limpiamente

## 💡 Consejos

- Ejecuta el scheduler como servicio para producción
- Usa `systemd` o `supervisor` para reinicio automático
- Monitoriza el espacio en disco (logs y datos pueden crecer)
- Para testing, usa `python sync_live_matches.py <fixture_id> <match_id>` manualmente
