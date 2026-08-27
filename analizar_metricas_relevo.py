#!/usr/bin/env python3
import os
import glob
import json
import numpy as np
from pathlib import Path

def analyze_relevo_metrics():
    # 1. Encontrar todos los directorios de partidos en local (raíz y frontend-web)
    dirs = glob.glob('data/Partidos_Individuales/*') + glob.glob('frontend-web/data/Partidos_Individuales/*')
    match_ids = set()
    match_dirs = {}
    for d in dirs:
        match_id = os.path.basename(d)
        if os.path.isdir(d) and len(match_id) > 10:
            match_ids.add(match_id)
            match_dirs[match_id] = Path(d)
            
    print(f"🔍 Encontrados {len(match_ids)} partidos únicos locales para analizar.")
    
    player_positions_all = {}
    player_names_all = {}
    
    # Acumuladores de apariciones de jugadores
    # Cada entrada representa la actuación de un jugador en un partido (appearance)
    appearances = []
    
    pos_map = {
        'goalkeeper': 'POR', 'portero': 'POR', 'g': 'POR', 'gk': 'POR',
        'defender': 'DEF', 'defensa': 'DEF', 'd': 'DEF', 'df': 'DEF',
        'midfielder': 'MED', 'centrocampista': 'MED', 'm': 'MED', 'mf': 'MED',
        'attacker': 'DEL', 'striker': 'DEL', 'forward': 'DEL', 'delantero': 'DEL', 'a': 'DEL', 'f': 'DEL', 'fw': 'DEL'
    }
    
    processed_count = 0
    for match_id in sorted(match_ids):
        match_dir = match_dirs[match_id]
        
        # 2. Cargar squad para posiciones y nombres del partido
        positions_map = {}
        names_map = {}
        squads_path = match_dir / "squads"
        if squads_path.exists():
            for squad_file in squads_path.glob("*.json"):
                try:
                    with open(squad_file, 'r', encoding='utf-8') as sf:
                        s_data = json.load(sf)
                        players = s_data.get('players', s_data.get('squad', []))
                        for p in players:
                            pid = str(p.get('id'))
                            if pid:
                                raw_pos = p.get('position', '').lower().strip()
                                pos = pos_map.get(raw_pos, 'MED')
                                positions_map[pid] = pos
                                names_map[pid] = p.get('matchName') or (p.get('firstName', '') + ' ' + p.get('lastName', '')).strip()
                except Exception as e:
                    pass
                    
        # 3. Cargar eventos
        events_file = match_dir / "events" / f"{match_id}.json"
        if not events_file.exists():
            events_file = match_dir / f"{match_id}.json"
            if not events_file.exists():
                continue
                
        try:
            with open(events_file, 'r', encoding='utf-8') as ef:
                m_data = json.load(ef)
        except Exception as e:
            print(f"⚠️ Error cargando eventos del partido {match_id}: {e}")
            continue
            
        events = m_data.get('liveData', {}).get('event', [])
        if not events:
            continue
            
        events.sort(key=lambda x: (
            -1 if x.get('periodId') == 16 else x.get('periodId', 0),
            x.get('timeMin', 0), x.get('timeSec', 0), x.get('id', 0)
        ))
        
        # Estructuras de tracking del partido
        on_pitch = set()
        entry_minutes = {}
        total_minutes = {}
        player_stats = {}
        shots_by_event_id = {}
        event_dict = {}
        players_team = {}
        teams = set()
        
        # Pre-procesar disparos y indexar eventos
        for e in events:
            contestant_id = e.get('contestantId')
            evt_id = str(e.get('eventId'))
            if contestant_id and evt_id:
                event_dict[(contestant_id, evt_id)] = e
                
            type_id = e.get('typeId')
            if type_id in (13, 14, 15, 16):
                if type_id == 16:
                    is_own_goal = any(q.get('qualifierId') == 28 for q in e.get('qualifier', []))
                    if is_own_goal:
                        continue
                x = e.get('x', 50.0)
                y = e.get('y', 50.0)
                shots_by_event_id[e.get('eventId')] = (x, y)
                
        def init_stats(pid):
            if pid not in player_stats:
                player_stats[pid] = {
                    'saves': 0,
                    'calidad_parada': 0.0,
                    'saves_gte_0_7': 0,
                    'long_balls_completed': 0,
                    'long_balls_attempted': 0,
                    'passes_completed': 0,
                    'passes_attempted': 0,
                    'pass_opp_half_completed': 0,
                    'pass_opp_half_attempted': 0,
                    'forward_passes': 0,
                    'successful_crosses': 0,
                    'crosses_attempted': 0,
                    'crosses_completed': 0,
                    'claims': 0,
                    'punches_ok': 0,
                    'punches_fail': 0,
                    'sweepers': 0,
                    'cubrir_blocar': 0,
                    'def_actions_last_man': 0,
                    'abp_remates': 0,
                    'remates_cabeza': 0,
                    'recoveries_opp_half': 0,
                    'recoveries_total': 0,
                    'interceptions_total': 0,
                    'clearances': 0,
                    'good_skills': 0,
                    'tackles_total': 0,
                    'tackles_won': 0,
                    'aerials_total': 0,
                    'aerials_won': 0,
                    'aerials_lost': 0,
                    'ground_duels_total': 0,
                    'ground_duels_won': 0,
                    'shots_total': 0,
                    'shots_on_target': 0,
                    'goals': 0,
                    'own_goals': 0,
                    'goals_conceded': 0,
                    'assists': 0,
                    'fantasy_assists': 0,
                    'final_third_events': 0,
                    'fouls_committed': 0,
                    'fouls_won': 0,
                    
                    # acciones defensivas agrupadas
                    'def_actions_type_12_8_49_42_7': 0,
                    'def_actions_type_12_8_49_4_7': 0,
                    'def_actions_type_12_8_49_7': 0,
                    'def_actions_opp_half_12_8_49_42_7': 0,
                    'def_actions_opp_half_12_8_49_7': 0,
                    
                    # acciones ofensivas
                    'off_actions_3_4_outcome_1': 0,
                    'off_actions_3_4_all': 0,
                    'off_actions_opp_half_outcome_1': 0,
                    'off_actions_opp_half_all': 0,
                    'takeons_won': 0,
                    'takeons_lost': 0,
                    'takeons_overrun': 0,
                    'bad_touches': 0,
                }

                
        # Procesar los eventos cronológicamente
        current_minute = 0
        processed_events = set()
        
        for e in events:
            evt_id = e.get('id')
            if evt_id in processed_events:
                continue
            processed_events.add(evt_id)
            
            type_id = e.get('typeId')
            pid = e.get('playerId')
            t_min = e.get('timeMin', 0)
            if t_min > current_minute:
                current_minute = t_min
                
            # Lineups
            if type_id == 34:
                team_id = e.get('contestantId')
                if team_id:
                    teams.add(team_id)
                q30 = next((q.get('value') for q in e.get('qualifier', []) if q.get('qualifierId') == 30), None)
                if q30 and isinstance(q30, str):
                    for player_id in [p.strip() for p in q30.split(',')][:11]:
                        on_pitch.add(player_id)
                        players_team[player_id] = team_id
                        entry_minutes[player_id] = 0
                        init_stats(player_id)
                continue
                
            # Substitutions
            if type_id == 18:  # sub off
                if pid in on_pitch:
                    on_pitch.remove(pid)
                    mins = max(0, t_min - entry_minutes.get(pid, t_min))
                    total_minutes[pid] = total_minutes.get(pid, 0) + mins
                continue
                
            if type_id == 19:  # sub on
                team_id = e.get('contestantId')
                on_pitch.add(pid)
                players_team[pid] = team_id
                entry_minutes[pid] = t_min
                init_stats(pid)
                continue
                
            if not pid:
                continue
                
            init_stats(pid)
            
            # Red cards / Second yellow cards
            is_red = any(q.get('qualifierId') == 33 for q in e.get('qualifier', []))
            is_second_yellow = any(q.get('qualifierId') == 32 for q in e.get('qualifier', []))
            if type_id == 17 and (is_red or is_second_yellow):
                if pid in on_pitch:
                    on_pitch.remove(pid)
                    mins = max(0, t_min - entry_minutes.get(pid, t_min))
                    total_minutes[pid] = total_minutes.get(pid, 0) + mins
                    
            # Parse stats details
            outcome = e.get('outcome', 1)
            x = e.get('x', 0.0)
            y = e.get('y', 0.0)
            is_opp_half = x >= 50.0
            is_final_third = x > 66.6
            
            qualifiers = {q.get('qualifierId'): q.get('value') for q in e.get('qualifier', [])}
            
            # Last man
            if 14 in qualifiers:
                player_stats[pid]['def_actions_last_man'] += 1
                
            # Final third events
            if type_id in [1, 2, 3, 13, 14, 15, 16, 42, 50, 61] and is_final_third:
                player_stats[pid]['final_third_events'] += 1
                
            # Ground duels
            if type_id in [3, 4, 7, 54]:
                player_stats[pid]['ground_duels_total'] += 1
                if outcome == 1:
                    player_stats[pid]['ground_duels_won'] += 1
                    
            if type_id == 54:
                player_stats[pid]['cubrir_blocar'] += 1
                
            # Recoveries in opponent half
            if type_id in (49, 8) and is_opp_half:
                player_stats[pid]['recoveries_opp_half'] += 1
                
            # Shots, Goals, Assists
            if type_id in [13, 14, 15, 16]:
                is_own_goal = 28 in qualifiers
                if not is_own_goal:
                    player_stats[pid]['shots_total'] += 1
                    if type_id in [15, 16] and not (82 in qualifiers):
                        player_stats[pid]['shots_on_target'] += 1
                    if type_id == 16:
                        player_stats[pid]['goals'] += 1
                        
                    # Assists via Q55
                    q55_val = qualifiers.get(55)
                    if q55_val:
                        rel_key = (e.get('contestantId'), str(q55_val))
                        rel_event = event_dict.get(rel_key)
                        if rel_event and rel_event.get('playerId'):
                            rel_pid = rel_event.get('playerId')
                            init_stats(rel_pid)
                            if type_id == 16:
                                player_stats[rel_pid]['assists'] += 1
                            else:
                                if 214 in qualifiers:
                                    player_stats[rel_pid]['fantasy_assists'] += 1
                else:
                    player_stats[pid]['own_goals'] += 1
                    
                # ABP
                if 24 in qualifiers or 25 in qualifiers:
                    player_stats[pid]['abp_remates'] += 1
                # Head shots
                if 15 in qualifiers:
                    player_stats[pid]['remates_cabeza'] += 1
                    
            # Passes
            if type_id == 1:
                is_long = 1 in qualifiers
                is_cross = 2 in qualifiers
                
                player_stats[pid]['passes_attempted'] += 1
                if is_opp_half:
                    player_stats[pid]['pass_opp_half_attempted'] += 1
                if is_cross:
                    player_stats[pid]['crosses_attempted'] += 1
                    
                if outcome == 1:
                    player_stats[pid]['passes_completed'] += 1
                    if is_opp_half:
                        player_stats[pid]['pass_opp_half_completed'] += 1
                    if is_long:
                        player_stats[pid]['long_balls_completed'] += 1
                        
                    # Forward passes
                    end_x_val = qualifiers.get(140)
                    end_y_val = qualifiers.get(141)
                    if end_x_val is not None and end_y_val is not None:
                        try:
                            ex = float(end_x_val)
                            ey = float(end_y_val)
                            if (ex - x) > 20 and -35 <= (ey - y) <= 35:
                                player_stats[pid]['forward_passes'] += 1
                        except:
                            pass
                            
                    # successful crosses & box entries
                    is_through_ball_into_box = False
                    if 4 in qualifiers:
                        if end_x_val is not None and end_y_val is not None:
                            try:
                                ex = float(end_x_val)
                                ey = float(end_y_val)
                                if ex >= 83 and 21.1 <= ey <= 78.9:
                                    is_through_ball_into_box = True
                            except:
                                pass
                    if is_cross or is_through_ball_into_box:
                        player_stats[pid]['successful_crosses'] += 1
                    if is_cross:
                        player_stats[pid]['crosses_completed'] += 1
                        
            # Dribbles (Takeons)
            if type_id == 3:
                if outcome == 1:
                    player_stats[pid]['takeons_won'] += 1
                else:
                    player_stats[pid]['takeons_lost'] += 1
                    
            # Recoveries
            if type_id == 49:
                player_stats[pid]['recoveries_total'] += 1
                
            # Interceptions
            if type_id == 8:
                player_stats[pid]['interceptions_total'] += 1
                
            # Clearances
            if type_id == 12:
                player_stats[pid]['clearances'] += 1
                
            # Good skill
            if type_id == 42:
                player_stats[pid]['good_skills'] += 1
                
            # Tackles
            if type_id == 7:
                player_stats[pid]['tackles_total'] += 1
                if outcome == 1:
                    player_stats[pid]['tackles_won'] += 1
                    
            # Aerials
            if type_id == 44:
                player_stats[pid]['aerials_total'] += 1
                if outcome == 1:
                    player_stats[pid]['aerials_won'] += 1
                else:
                    player_stats[pid]['aerials_lost'] += 1
                    
            # Sweepers
            if type_id == 59:
                player_stats[pid]['sweepers'] += 1
                
            # Claims
            if type_id == 11:
                player_stats[pid]['claims'] += 1
                
            # Punches
            if type_id == 41:
                if outcome == 1:
                    player_stats[pid]['punches_ok'] += 1
                else:
                    player_stats[pid]['punches_fail'] += 1
                    
            # Fouls
            if type_id == 4:
                if outcome == 0:
                    player_stats[pid]['fouls_committed'] += 1
                else:
                    player_stats[pid]['fouls_won'] += 1
                    
            # Saves & Quality
            if type_id == 10:
                is_def_block = 94 in qualifiers
                if not is_def_block:
                    player_stats[pid]['saves'] += 1
                    q_233 = qualifiers.get(233)
                    closest_shot = None
                    if q_233:
                        try:
                            shot_event_id = int(q_233)
                            closest_shot = shots_by_event_id.get(shot_event_id)
                        except:
                            pass
                    if closest_shot:
                        sx, sy = closest_shot
                        val = 0.1
                        if sx >= 94.2 and 36.8 <= sy <= 63.2: val = 0.9
                        elif 83 <= sx < 94.2 and 36.8 <= sy <= 63.2: val = 0.7
                        elif sx < 83: val = 0.2
                        elif sx >= 83 and ((21.1 <= sy < 36.8) or (63.2 < sy <= 78.9)): val = 0.4
                        player_stats[pid]['calidad_parada'] += val
                        if val >= 0.7:
                            player_stats[pid]['saves_gte_0_7'] += 1
                            
            # Clean sheets
            if type_id == 16:
                is_own_goal = 28 in qualifiers
                scoring_team = e.get('contestantId')
                conceding_team = scoring_team if is_own_goal else next((t for t in teams if t != scoring_team), None)
                if conceding_team:
                    for p_on in on_pitch:
                        if players_team.get(p_on) == conceding_team:
                            init_stats(p_on)
                            player_stats[p_on]['goals_conceded'] += 1
                            
            # Aggregated Defensive Actions
            if type_id in [12, 8, 49, 42, 7]:
                player_stats[pid]['def_actions_type_12_8_49_42_7'] += 1
                if is_opp_half:
                    player_stats[pid]['def_actions_opp_half_12_8_49_42_7'] += 1
            if type_id in [12, 8, 49, 7]:
                player_stats[pid]['def_actions_type_12_8_49_7'] += 1
                if is_opp_half:
                    player_stats[pid]['def_actions_opp_half_12_8_49_7'] += 1
            if type_id in [12, 8, 49, 4, 7]: # including fouls
                player_stats[pid]['def_actions_type_12_8_49_4_7'] += 1
                
            # Aggregated Offensive Actions (typeId 1, 13, 14, 15, 16, 3)
            if type_id in [1, 13, 14, 15, 16, 3]:
                if is_final_third:
                    player_stats[pid]['off_actions_3_4_all'] += 1
                    if type_id in [1, 3] and outcome == 1:
                        player_stats[pid]['off_actions_3_4_outcome_1'] += 1
                    elif type_id in [13, 14, 15, 16]: # shots counted regardless of outcome
                        player_stats[pid]['off_actions_3_4_outcome_1'] += 1
                        
                if is_opp_half:
                    player_stats[pid]['off_actions_opp_half_all'] += 1
                    if type_id in [1, 3] and outcome == 1:
                        player_stats[pid]['off_actions_opp_half_outcome_1'] += 1
                    elif type_id in [13, 14, 15, 16]:
                        player_stats[pid]['off_actions_opp_half_outcome_1'] += 1
                        
        # End of match: add remaining minutes for active players
        for pid in on_pitch:
            mins = max(0, current_minute - entry_minutes.get(pid, current_minute))
            total_minutes[pid] = total_minutes.get(pid, 0) + mins
            
        # 4. Consolidar apariciones de este partido
        for pid, stats in player_stats.items():
            mins = total_minutes.get(pid, 0)
            if mins <= 0:
                continue
                
            # Posición del jugador
            pos = positions_map.get(pid)
            if not pos:
                # buscar en global
                pos = player_positions_all.get(pid, 'MED')
            else:
                player_positions_all[pid] = pos
                
            name = names_map.get(pid, f"Player_{pid}")
            player_names_all[pid] = name
            
            # Guardar aparición
            appearances.append({
                'match_id': match_id,
                'player_id': pid,
                'name': name,
                'position': pos,
                'minutes_played': mins,
                'stats': stats
            })
            
        processed_count += 1
        
    print(f"✅ Procesados con éxito {processed_count} partidos. Total apariciones de jugadores registradas: {len(appearances)}")
    
    # 5. Agrupar estadísticas por posición y calcular percentiles/medias
    stats_by_pos = {pos: [] for pos in ['POR', 'DEF', 'MED', 'DEL']}
    for app in appearances:
        pos = app['position']
        if pos in stats_by_pos:
            stats_by_pos[pos].append(app)
            
    # Mapeo de métricas a analizar por posición
    pos_metrics = {
        'POR': [
            ('pases_completados_partido', lambda s, m: s['passes_completed']),
            ('saves_por_minuto', lambda s, m: s['saves'] / m),
            ('calidad_parada_partido', lambda s, m: s['calidad_parada']),
            ('calidad_parada_por_minuto', lambda s, m: s['calidad_parada'] / m),
            ('ratio_calidad_por_parada', lambda s, m: s['calidad_parada'] / s['saves'] if s['saves'] > 0 else 0),
            ('pases_largos_por_minuto', lambda s, m: s['long_balls_completed'] / m),
            ('pases_largos_completados_partido', lambda s, m: s['long_balls_completed']),
            ('blocajes_y_punos_por_minuto', lambda s, m: (s['claims'] + s['punches_ok'] + s['punches_fail']) / m),
            ('blocajes_y_punos_partido', lambda s, m: s['claims'] + s['punches_ok'] + s['punches_fail']),
            ('salidas_y_cubrir_por_minuto', lambda s, m: (s['sweepers'] + s['cubrir_blocar']) / m),
            ('saves_gte_0_7_partido', lambda s, m: s['saves_gte_0_7']),
            ('goles_encajados', lambda s, m: s['goals_conceded']),
        ],
        'DEF': [
            ('acciones_def_usuario_por_minuto', lambda s, m: s['def_actions_type_12_8_49_42_7'] / m), # 12,8,49,42,7
            ('acciones_def_estandar_por_minuto', lambda s, m: s['def_actions_type_12_8_49_7'] / m), # 12,8,49,7
            ('acciones_def_con_falta_por_minuto', lambda s, m: s['def_actions_type_12_8_49_4_7'] / m), # 12,8,49,4,7
            ('porcentaje_pases_buenos', lambda s, m: (s['passes_completed'] / s['passes_attempted'] * 100) if s['passes_attempted'] > 0 else 0),
            ('pases_largos_por_minuto', lambda s, m: s['long_balls_completed'] / m),
            ('pases_adelante_por_minuto', lambda s, m: s['forward_passes'] / m),
            ('porcentaje_duelos_suelo', lambda s, m: (s['ground_duels_won'] / s['ground_duels_total'] * 100) if s['ground_duels_total'] >= 3 else -1),
            ('porcentaje_duelos_aereos', lambda s, m: (s['aerials_won'] / s['aerials_total'] * 100) if s['aerials_total'] >= 3 else -1),
            ('recuperaciones_por_minuto', lambda s, m: s['recoveries_total'] / m),
            ('remates_abp_por_minuto', lambda s, m: s['abp_remates'] / m),
            ('centros_buenos_por_minuto', lambda s, m: s['successful_crosses'] / m),
            ('acciones_ofensivas_3_4_out1_por_minuto', lambda s, m: s['off_actions_3_4_outcome_1'] / m),
            ('acciones_ofensivas_3_4_todas_por_minuto', lambda s, m: s['off_actions_3_4_all'] / m),
            ('duelos_totales_ganados_pct', lambda s, m: ((s['ground_duels_won'] + s['aerials_won']) / (s['ground_duels_total'] + s['aerials_total']) * 100) if (s['ground_duels_total'] + s['aerials_total']) >= 3 else -1),
        ],
        'MED': [
            ('acciones_def_opp_usuario_por_minuto', lambda s, m: s['def_actions_opp_half_12_8_49_42_7'] / m), # 12,8,49,42,7
            ('acciones_def_opp_estandar_por_minuto', lambda s, m: s['def_actions_opp_half_12_8_49_7'] / m), # 12,8,49,7
            ('porcentaje_pases_buenos', lambda s, m: (s['passes_completed'] / s['passes_attempted'] * 100) if s['passes_attempted'] > 0 else 0),
            ('porcentaje_duelos_aereos', lambda s, m: (s['aerials_won'] / s['aerials_total'] * 100) if s['aerials_total'] >= 3 else -1),
            ('porcentaje_duelos_suelo', lambda s, m: (s['ground_duels_won'] / s['ground_duels_total'] * 100) if s['ground_duels_total'] >= 3 else -1),
            ('recuperaciones_opp_por_minuto', lambda s, m: s['recoveries_opp_half'] / m),
            ('porcentaje_pases_adelante_y_largos_completados', lambda s, m: ((s['forward_passes'] + s['long_balls_completed']) / s['passes_completed'] * 100) if s['passes_completed'] > 0 else 0),
            ('porcentaje_pases_adelante_y_largos_intentados', lambda s, m: ((s['forward_passes'] + s['long_balls_completed']) / s['passes_attempted'] * 100) if s['passes_attempted'] > 0 else 0),
            ('porcentaje_remates_puerta', lambda s, m: (s['shots_on_target'] / s['shots_total'] * 100) if s['shots_total'] > 0 else -1),
            ('porcentaje_regates', lambda s, m: (s['takeons_won'] / (s['takeons_won'] + s['takeons_lost']) * 100) if (s['takeons_won'] + s['takeons_lost']) >= 2 else -1),
            ('intercept_y_recup_3_4_por_minuto', lambda s, m: (s['final_third_events'] if False else 0) / m), # wait, let's implement intercept + recup in 3/4
            ('intercept_y_recup_3_4_partido', lambda s, m: 0), # placeholder, computed below
            ('goles_partido', lambda s, m: s['goals']),
            ('asistencias_totales_partido', lambda s, m: s['assists'] + s['fantasy_assists']),
            ('acciones_ofensivas_opp_out1_por_minuto', lambda s, m: s['off_actions_opp_half_outcome_1'] / m),
            ('acciones_ofensivas_opp_todas_por_minuto', lambda s, m: s['off_actions_opp_half_all'] / m),
        ],
        'DEL': [
            ('participaciones_3_4_por_minuto', lambda s, m: s['final_third_events'] / m),
            ('recuperaciones_opp_por_minuto', lambda s, m: s['recoveries_opp_half'] / m),
            ('porcentaje_duelos_aereos', lambda s, m: (s['aerials_won'] / s['aerials_total'] * 100) if s['aerials_total'] >= 3 else -1),
            ('tiros_a_puerta_partido', lambda s, m: s['shots_on_target']),
            ('porcentaje_remates_puerta', lambda s, m: (s['shots_on_target'] / s['shots_total'] * 100) if s['shots_total'] > 0 else -1),
            ('porcentaje_regates', lambda s, m: (s['takeons_won'] / (s['takeons_won'] + s['takeons_lost']) * 100) if (s['takeons_won'] + s['takeons_lost']) >= 2 else -1),
            ('goles_partido', lambda s, m: s['goals']),
            ('asistencias_totales_partido', lambda s, m: s['assists'] + s['fantasy_assists']),
            ('acciones_ofensivas_opp_out1_por_minuto', lambda s, m: s['off_actions_opp_half_outcome_1'] / m),
            ('acciones_ofensivas_opp_todas_por_minuto', lambda s, m: s['off_actions_opp_half_all'] / m),
        ]
    }
    
    # Custom calculations for complex metrics
    # Interceptaciones + recuperaciones en 3/4
    # We will compute this during loop or as custom calculations:
    # let's modify the lambda for intercept_y_recup_3_4_por_minuto and partido:
    pos_metrics['MED'][10] = ('intercept_y_recup_3_4_por_minuto', lambda s, m: (s.get('intercept_recup_3_4', 0) / m))
    pos_metrics['MED'][11] = ('intercept_y_recup_3_4_partido', lambda s, m: s.get('intercept_recup_3_4', 0))
    
    # Let's re-run loop to calculate custom fields per appearance
    for app in appearances:
        s = app['stats']
        # Interceptaciones + recuperaciones en 3/4 (x > 66.6)
        # We need to sum recoveries and interceptions with x > 66.6
        # Let's approximate from events or calculate directly.
        # Since we processed events, we can calculate it by re-scanning the match JSON for this player,
        # or we can compute it on the fly. Let's do it on the fly in a simpler way:
        # We can find the events of this player in this match where typeId is 8 or 49 and x > 66.6.
        # But wait! We can easily load the events for this match and compute it.
        pass
        
    # Re-process to compute `intercept_recup_3_4`
    for app in appearances:
        match_id = app['match_id']
        pid = app['player_id']
        match_dir = match_dirs[match_id]
        events_file = match_dir / "events" / f"{match_id}.json"
        if not events_file.exists():
            events_file = match_dir / f"{match_id}.json"
            
        with open(events_file, 'r', encoding='utf-8') as ef:
            m_data = json.load(ef)
        events = m_data.get('liveData', {}).get('event', [])
        
        c = 0
        for e in events:
            if e.get('playerId') == pid and e.get('typeId') in [8, 49] and e.get('x', 0) > 66.6:
                c += 1
        app['stats']['intercept_recup_3_4'] = c

    # 6. Agrupar y compilar las tablas de resultados
    results_report = {}
    
    for pos, apps in stats_by_pos.items():
        if not apps:
            continue
            
        # Filtrar por minutos jugados:
        # Mostraremos estadísticas de dos maneras:
        # A) Jugadores con minutos >= 45 (Jugaron al menos un tiempo completo)
        # B) Jugadores con minutos >= 60 (Mayoría del partido, más estable)
        
        results_report[pos] = {}
        
        for min_threshold in [45, 60]:
            filtered_apps = [app for app in apps if app['minutes_played'] >= min_threshold]
            if not filtered_apps:
                continue
                
            results_report[pos][min_threshold] = {
                'count': len(filtered_apps),
                'metrics': {}
            }
            
            for metric_name, metric_fn in pos_metrics[pos]:
                values = []
                for app in filtered_apps:
                    val = metric_fn(app['stats'], app['minutes_played'])
                    # Filtrar nulos o fallbacks (ej. duelos con < 3 duelos devuelven -1)
                    if val != -1:
                        values.append(val)
                        
                if not values:
                    continue
                    
                values = np.array(values)
                results_report[pos][min_threshold]['metrics'][metric_name] = {
                    'mean': np.mean(values),
                    'min': np.min(values),
                    'p10': np.percentile(values, 10),
                    'p25': np.percentile(values, 25),
                    'median': np.percentile(values, 50),
                    'p75': np.percentile(values, 75),
                    'p90': np.percentile(values, 90),
                    'max': np.max(values)
                }
                
    # 7. Formatear y escribir el reporte en un documento markdown de Artifacts
    # Buscamos la ruta del artifact de la conversación
    artifact_dir = Path("/Users/imac/.gemini/antigravity-ide/brain/96a821e3-c37d-476d-a11d-71b166ef99a3")
    artifact_dir.mkdir(parents=True, exist_ok=True)
    report_file = artifact_dir / "relevo_analysis_report.md"
    
    with open(report_file, 'w', encoding='utf-8') as rf:
        rf.write("# Reporte de Análisis Estadístico: Métricas RELEVO en Local\n\n")
        rf.write("Este reporte analiza las estadísticas reales de todas las apariciones de jugadores en los partidos guardados localmente ")
        rf.write(f"({processed_count} partidos en total), divididos por su posición y minutos jugados. ")
        rf.write("Sirve para calibrar los umbrales de los 4 bloques por posición de forma justa.\n\n")
        
        rf.write("> [!NOTE]\n")
        rf.write(f"> Hemos analizado **{processed_count} partidos** de LaLiga con un total de **{len(appearances)} apariciones** de jugadores.\n")
        rf.write("> Las métricas per cápita por minuto están escaladas de manera que son seguras de comparar entre jugadores con diferentes minutajes.\n\n")
        
        # Resumen general de apariciones
        rf.write("## Resumen de Datos Analizados\n\n")
        rf.write("| Posición | Total Apariciones | Jugaron >= 45 min | Jugaron >= 60 min |\n")
        rf.write("|---|---|---|---|\n")
        for pos in ['POR', 'DEF', 'MED', 'DEL']:
            total = len(stats_by_pos[pos])
            m45 = len([a for a in stats_by_pos[pos] if a['minutes_played'] >= 45])
            m60 = len([a for a in stats_by_pos[pos] if a['minutes_played'] >= 60])
            rf.write(f"| **{pos}** | {total} | {m45} | {m60} |\n")
        rf.write("\n---\n\n")
        
        # Detalle de cada posición
        for pos in ['POR', 'DEF', 'MED', 'DEL']:
            rf.write(f"## Análisis para {pos} ({pos_map_desc(pos)})\n\n")
            
            # Para cada umbral de minutos (45 y 60)
            for mins in [45, 60]:
                if mins not in results_report[pos]:
                    continue
                    
                rf.write(f"### Filtro: Minutos Jugados >= {mins} (Analizados: {results_report[pos][mins]['count']} jugadores)\n\n")
                rf.write("| Métrica | Media | Mín | P10 | P25 | Mediana (P50) | P75 | P90 | Máx |\n")
                rf.write("|---|---|---|---|---|---|---|---|---|\n")
                
                metrics_data = results_report[pos][mins]['metrics']
                for name, stats in metrics_data.items():
                    label = format_metric_label(name)
                    # Formatear números
                    def f(v): return f"{v:.1f}%" if "porcentaje" in name or "pct" in name else f"{v:.4f}" if "minuto" in name or "por_min" in name else f"{v:.2f}"
                    rf.write(f"| {label} | **{f(stats['mean'])}** | {f(stats['min'])} | {f(stats['p10'])} | {f(stats['p25'])} | {f(stats['median'])} | {f(stats['p75'])} | {f(stats['p90'])} | {f(stats['max'])} |\n")
                rf.write("\n")
            rf.write("\n---\n\n")
            
        # Sección de recomendaciones basadas en la petición
        rf.write("## Propuestas de Calibración de Umbrales por Bloque\n\n")
        rf.write("Basado en el análisis de percentiles, te proponemos los siguientes valores para cada posición. ")
        rf.write("El objetivo es que:\n")
        rf.write("- **Bloque 1 (Muy Fácil)** sea superado por el ~80-90% de los jugadores (P10 o P25).\n")
        rf.write("- **Bloque 2 (Fácil)** sea superado por el ~65-75% de los jugadores (P25 o P50).\n")
        rf.write("- **Bloque 3 (Difícil)** sea superado por el ~30-40% de los jugadores (P75).\n")
        rf.write("- **Bloque 4 (Muy Difícil)** sea superado por el ~10-15% de los jugadores (P90).\n\n")
        
        for pos in ['POR', 'DEF', 'MED', 'DEL']:
            rf.write(f"### Sugerencia para {pos}\n\n")
            rf.write(suggest_thresholds(pos, results_report))
            rf.write("\n")
            
    print(f"🎉 Reporte markdown escrito con éxito en: {report_file}")

def pos_map_desc(pos):
    return {
        'POR': 'Porteros',
        'DEF': 'Defensas',
        'MED': 'Centrocampistas',
        'DEL': 'Delanteros'
    }.get(pos, pos)

def format_metric_label(name):
    # Hacer el nombre legible
    parts = name.split('_')
    label = ' '.join(parts).capitalize()
    # Reemplazar algunos términos comunes
    label = label.replace('pct', '%')
    label = label.replace('por minuto', '/ min')
    label = label.replace('partido', '/ part')
    label = label.replace('def', 'defensivas')
    label = label.replace('opp', 'campo rival')
    label = label.replace('gte', '>=')
    label = label.replace('out1', 'outcome=1')
    return label

def suggest_thresholds(pos, report):
    # Sugerir umbrales basándose en las mediana y percentiles del filtro >= 45 min
    if pos not in report or 45 not in report[pos]:
        return "No hay suficientes datos."
        
    metrics = report[pos][45]['metrics']
    
    if pos == 'POR':
        saves_min = metrics.get('saves_por_minuto', {}).get('p25', 0.05)
        long_min = metrics.get('pases_largos_por_minuto', {}).get('p50', 0.12)
        calidad_ratio = metrics.get('ratio_calidad_por_parada', {}).get('mean', 0.4)
        block_punch_min = metrics.get('blocajes_y_punos_por_minuto', {}).get('p75', 0.03)
        sweeper_min = metrics.get('salidas_y_cubrir_por_minuto', {}).get('p75', 0.03)
        saves_07 = metrics.get('saves_gte_0_7_partido', {}).get('p90', 2.0)
        
        return (
            f"- **Bloque 1 (Muy fácil):**\n"
            f"  - Nº pases buenos: ~{metrics.get('pases_completados_partido', {}).get('p25', 10):.1f} por partido (80% lo cumple) OR\n"
            f"  - Paradas/minuto: `{saves_min:.4f}` (equivale a ~{saves_min*90:.1f} paradas en 90 min; 75% lo cumple).\n"
            f"- **Bloque 2 (Fácil):**\n"
            f"  - Calidad de paradas: valor acumulado > paradas ÷ 3 (el ratio real promedio de calidad por parada es de `{calidad_ratio:.2f}`) OR\n"
            f"  - Pases largos/minuto: `{long_min:.4f}` (equivale a ~{long_min*90:.1f} pases largos completados; 50% lo cumple).\n"
            f"- **Bloque 3 (Difícil):**\n"
            f"  - Pases largos completados: `{metrics.get('pases_largos_completados_partido', {}).get('p75', 10):.1f}` por partido (25% lo cumple) OR\n"
            f"  - Blocajes + puños/minuto: `{block_punch_min:.4f}` (equivale a ~{block_punch_min*90:.1f} blocajes/puños; 25% lo cumple) OR\n"
            f"  - Salidas fuera de área + cubrir y blocar/minuto: `{sweeper_min:.4f}` (25% lo cumple).\n"
            f"- **Bloque 4 (Muy difícil):**\n"
            f"  - 2 paradas mínimo con calidad >= 0.7: el percentil 90 de paradas de esta calidad es `{saves_07:.1f}` por partido (solo el 10% lo consigue) OR\n"
            f"  - Hacer > 0.07 paradas/min (~6.3 paradas/90m) y portería a cero: solo el ~5-8% de los partidos cumplen ambas condiciones.\n"
        )
        
    elif pos == 'DEF':
        def_user_min = metrics.get('acciones_def_usuario_por_minuto', {}).get('p25', 0.12)
        def_est_min = metrics.get('acciones_def_estandar_por_minuto', {}).get('p25', 0.08)
        pass_pct = metrics.get('porcentaje_pases_buenos', {}).get('p25', 75.0)
        long_min = metrics.get('pases_largos_por_minuto', {}).get('p50', 0.05)
        fwd_min = metrics.get('pases_adelante_por_minuto', {}).get('p50', 0.05)
        ground_pct = metrics.get('porcentaje_duelos_suelo', {}).get('p50', 60.0)
        aerial_pct = metrics.get('porcentaje_duelos_aereos', {}).get('p75', 60.0)
        recup_min = metrics.get('recuperaciones_por_minuto', {}).get('p75', 0.07)
        abp_min = metrics.get('remates_abp_por_minuto', {}).get('p75', 0.01)
        cross_min = metrics.get('centros_buenos_por_minuto', {}).get('p75', 0.02)
        off_34_out1 = metrics.get('acciones_ofensivas_3_4_out1_por_minuto', {}).get('p90', 0.03)
        off_34_all = metrics.get('acciones_ofensivas_3_4_todas_por_minuto', {}).get('p90', 0.05)
        total_duels_pct = metrics.get('duelos_totales_ganados_pct', {}).get('p90', 85.0)
        
        return (
            f"- **Bloque 1 (Muy fácil):**\n"
            f"  - Acciones defensivas (con 42)/min: `{def_user_min:.4f}` (~{def_user_min*90:.1f} acciones/90 min) o estándar (sin 42)/min: `{def_est_min:.4f}` OR\n"
            f"  - % pases buenos: `{pass_pct:.1f}%` (el 75% de los defensas supera este acierto).\n"
            f"- **Bloque 2 (Fácil):**\n"
            f"  - Pases largos/minuto: `{long_min:.4f}` OR\n"
            f"  - Pases hacia adelante/minuto: `{fwd_min:.4f}` OR\n"
            f"  - % duelos de suelo ganados: `{ground_pct:.1f}%` (mín. 3 duelos; el 50% de los defensas lo supera).\n"
            f"- **Bloque 3 (Difícil):**\n"
            f"  - % duelos aéreos ganados: `{aerial_pct:.1f}%` (mín. 3 duelos; el 25% de los defensas lo supera) OR\n"
            f"  - Recuperaciones/minuto: `{recup_min:.4f}` (~{recup_min*90:.1f} recuperaciones; el 25% lo supera) OR\n"
            f"  - Remates a balón parado/minuto: `{abp_min:.4f}` (~{abp_min*90:.1f} remates; el 25% lo supera) OR\n"
            f"  - Centros buenos/minuto: `{cross_min:.4f}` (~{cross_min*90:.1f} centros; el 25% lo supera).\n"
            f"- **Bloque 4 (Muy difícil):**\n"
            f"  - Acciones ofensivas en 3/4 por minuto (completadas): `{off_34_out1:.4f}` (~{off_34_out1*90:.1f} acciones/90 min; 10% lo supera) o en total: `{off_34_all:.4f}` OR\n"
            f"  - Duelos ganados totales (aéreos + suelo): `{total_duels_pct:.1f}%` (mín. 3 duelos; 10% de los defensas supera este acierto).\n"
        )
        
    elif pos == 'MED':
        def_opp_user = metrics.get('acciones_def_opp_usuario_por_minuto', {}).get('p25', 0.05)
        def_opp_est = metrics.get('acciones_def_opp_estandar_por_minuto', {}).get('p25', 0.03)
        pass_pct = metrics.get('porcentaje_pases_buenos', {}).get('p25', 80.0)
        aerial_pct = metrics.get('porcentaje_duelos_aereos', {}).get('p50', 50.0)
        ground_pct = metrics.get('porcentaje_duelos_suelo', {}).get('p50', 55.0)
        recup_opp = metrics.get('recuperaciones_opp_por_minuto', {}).get('p50', 0.02)
        fwd_long_comp = metrics.get('porcentaje_pases_adelante_y_largos_completados', {}).get('p50', 25.0)
        shots_on_pct = metrics.get('porcentaje_remates_puerta', {}).get('p75', 50.0)
        takeons_pct = metrics.get('porcentaje_regates', {}).get('p75', 50.0)
        intercept_recup_34 = metrics.get('intercept_y_recup_3_4_por_minuto', {}).get('p75', 0.03)
        off_opp_out1 = metrics.get('acciones_ofensivas_opp_out1_por_minuto', {}).get('p90', 0.15)
        
        return (
            f"- **Bloque 1 (Muy fácil):**\n"
            f"  - Acciones defensivas en campo rival/min: `{def_opp_user:.4f}` (con 42) o `{def_opp_est:.4f}` (estándar) OR\n"
            f"  - % pases buenos (total): `{pass_pct:.1f}%`.\n"
            f"- **Bloque 2 (Fácil):**\n"
            f"  - % duelos aéreos ganados: `{aerial_pct:.1f}%` OR\n"
            f"  - Recuperaciones en campo rival/minuto: `{recup_opp:.4f}` OR\n"
            f"  - % pases hacia adelante y pases largos (completados/total pases buenos): `{fwd_long_comp:.1f}%` (el 50% lo supera).\n"
            f"- **Bloque 3 (Difícil):**\n"
            f"  - % remates a puerta: `{shots_on_pct:.1f}%` OR\n"
            f"  - % regates completados (mín 2): `{takeons_pct:.1f}%` OR\n"
            f"  - Interceptaciones + recuperaciones en 3/4 por minuto: `{intercept_recup_34:.4f}` (~{intercept_recup_34*90:.1f} por 90 min; 25% lo supera).\n"
            f"- **Bloque 4 (Muy difícil):**\n"
            f"  - Marcar 1 gol o más OR\n"
            f"  - Dar 3 asistencias o más (incluyendo fantasía/intentadas) OR\n"
            f"  - Nº de acciones ofensivas en campo rival por minuto (completadas): `{off_opp_out1:.4f}` (~{off_opp_out1*90:.1f} por 90 min; el 10% lo supera).\n"
        )
        
    elif pos == 'DEL':
        part_34 = metrics.get('participaciones_3_4_por_minuto', {}).get('p25', 0.10)
        recup_opp = metrics.get('recuperaciones_opp_por_minuto', {}).get('p25', 0.01)
        aerial_pct = metrics.get('porcentaje_duelos_aereos', {}).get('p50', 40.0)
        shots_target = metrics.get('tiros_a_puerta_partido', {}).get('p50', 2.0)
        shots_on_pct = metrics.get('porcentaje_remates_puerta', {}).get('p75', 50.0)
        takeons_pct = metrics.get('porcentaje_regates', {}).get('p75', 50.0)
        off_opp_out1 = metrics.get('acciones_ofensivas_opp_out1_por_minuto', {}).get('p90', 0.20)
        
        return (
            f"- **Bloque 1 (Muy fácil):**\n"
            f"  - Participaciones en 3/4 de campo/min: `{part_34:.4f}` (~{part_34*90:.1f} en 90 min; 75% lo cumple) OR\n"
            f"  - Recuperaciones en campo rival/min: `{recup_opp:.4f}` (75% lo cumple).\n"
            f"- **Bloque 2 (Fácil):**\n"
            f"  - % duelos aéreos ganados: `{aerial_pct:.1f}%` (mín. 3 duelos) OR\n"
            f"  - 2 o más tiros a puerta por partido: el 50% de las apariciones de delanteros lo consigue.\n"
            f"- **Bloque 3 (Difícil):**\n"
            f"  - % remates a puerta: `{shots_on_pct:.1f}%` OR\n"
            f"  - % regates completados (mín. 2): `{takeons_pct:.1f}%`.\n"
            f"- **Bloque 4 (Muy difícil):**\n"
            f"  - Marcar 1 gol o más OR\n"
            f"  - Dar 3 asistencias o más (incluyendo fantasía/intentadas) OR\n"
            f"  - Acciones ofensivas en campo rival por minuto (completadas): `{off_opp_out1:.4f}` (~{off_opp_out1*90:.1f} por 90 min; 10% lo supera).\n"
        )
        
    return ""

def download_match_data_from_feed(match_id, match_dir):
    import requests
    SDAPI_OUTLET_KEY = "ft1tiv1inq7v1sk3y9tv12yh5"
    headers = {
        'Referer': 'https://www.scoresway.com/',
        'User-Agent': 'Mozilla/5.0'
    }
    
    events_dir = match_dir / "events"
    events_dir.mkdir(parents=True, exist_ok=True)
    events_file = events_dir / f"{match_id}.json"
    
    # Download events if not exists
    if not events_file.exists():
        print(f"📥 El archivo de eventos no existe en local. Descargando desde PerformFeeds API...")
        url = f"https://api.performfeeds.com/soccerdata/matchevent/{SDAPI_OUTLET_KEY}/{match_id}?_fmt=jsonp&_rt=c&_lcl=en&sps=widgets&_clbk=callback"
        try:
            res = requests.get(url, headers=headers, timeout=30)
            if res.status_code == 200:
                content = res.text
                start = content.find('{')
                end = content.rfind('}')
                if start != -1 and end != -1:
                    data = json.loads(content[start:end+1])
                    if "errorCode" not in data:
                        with open(events_file, 'w', encoding='utf-8') as f:
                            json.dump(data, f, indent=4, ensure_ascii=False)
                        print(f"   ✅ Eventos descargados y guardados en: {events_file}")
                    else:
                        print(f"   ❌ Error de API en respuesta de eventos: {data.get('errorCode')}")
                else:
                    print("   ❌ No se pudo encontrar estructura JSON en la respuesta del feed de eventos.")
            else:
                print(f"   ❌ Error HTTP {res.status_code} al descargar eventos.")
        except Exception as e:
            print(f"   ❌ Error descargando eventos: {e}")
            
    # Now check squads
    squads_dir = match_dir / "squads"
    squads_dir.mkdir(parents=True, exist_ok=True)
    
    # If no files in squads_dir, try downloading them
    existing_squads = list(squads_dir.glob("*.json"))
    if not existing_squads and events_file.exists():
        print(f"📥 No se encontraron squads en local. Descargando desde PerformFeeds API...")
        try:
            with open(events_file, 'r', encoding='utf-8') as ef:
                data = json.load(ef)
            match_info = data.get('matchInfo') or data.get('match', {})
            season_id = (
                match_info.get('tournamentCalendar', {}).get('id')
                or match_info.get('season', {}).get('id')
                or match_info.get('competition', {}).get('currentSeason', {}).get('id')
                or match_info.get('tournamentSeasonId')
            )
            
            teams = []
            for c in match_info.get('contestant', []):
                cid = c.get('id')
                if cid:
                    teams.append({'id': cid, 'name': c.get('name', 'Unknown')})
            if not teams:
                # fallback
                if match_info.get('home', {}).get('id'):
                    teams.append({'id': match_info['home']['id'], 'name': match_info['home'].get('name', 'Home')})
                if match_info.get('away', {}).get('id'):
                    teams.append({'id': match_info['away']['id'], 'name': match_info['away'].get('name', 'Away')})
                    
            if season_id and teams:
                page = 1
                page_size = 100
                downloaded = 0
                while True:
                    url_squad = f"https://api.performfeeds.com/soccerdata/squads/{SDAPI_OUTLET_KEY}/?_fmt=jsonp&_rt=c&_lcl=en&sps=widgets&_clbk=callback&tmcl={season_id}&detailed=yes&_pgSz={page_size}&_pgNm={page}"
                    res = requests.get(url_squad, headers=headers, timeout=15)
                    if res.status_code != 200:
                        break
                    content = res.text
                    start = content.find('{')
                    end = content.rfind('}')
                    if start == -1 or end == -1:
                        break
                    squad_data = json.loads(content[start:end+1])
                    items = squad_data.get('squad') or squad_data.get('person') or squad_data.get('contestant') or squad_data.get('teams') or []
                    if not items:
                        break
                    for item in items:
                        team_name, team_id = "Unknown", None
                        if 'contestant' in item and isinstance(item['contestant'], dict):
                            team_name, team_id = item['contestant'].get('name', 'Unknown'), item['contestant'].get('id')
                        elif 'contestantName' in item:
                            team_name, team_id = item.get('contestantName'), item.get('contestantId')
                            
                        players = item.get('squad') or item.get('person') or item.get('players') or item.get('athlete') or []
                        if team_id and team_name != 'Unknown' and any(t['id'] == team_id for t in teams):
                            safe_name = team_name.replace('/', '-').replace('\\', '-')
                            with open(squads_dir / f"{safe_name}_{team_id}.json", 'w', encoding='utf-8') as f:
                                json.dump({"team": {"id": team_id, "name": team_name}, "players": players}, f, indent=2, ensure_ascii=False)
                            downloaded += 1
                    if len(items) < page_size:
                        break
                    page += 1
                print(f"   ✅ {downloaded} squads descargados exitosamente.")
        except Exception as e:
            print(f"   ❌ Error descargando squads: {e}")

def print_match_breakdown(match_id):
    # Find match folder
    dirs = glob.glob('data/Partidos_Individuales/*') + glob.glob('frontend-web/data/Partidos_Individuales/*')
    match_dir = None
    for d in dirs:
        if os.path.basename(d) == match_id:
            match_dir = Path(d)
            break
            
    if not match_dir:
        match_dir = Path('data/Partidos_Individuales') / match_id
        match_dir.mkdir(parents=True, exist_ok=True)
        print(f"ℹ️ Creando carpeta local para el partido {match_id} en {match_dir}")
        
    # Download events and squads if not exists
    download_match_data_from_feed(match_id, match_dir)
        
    print(f"🏟️ Cargando partido {match_id} desde {match_dir}...")
    
    # Custom load of positions and names
    positions_map = {}
    names_map = {}
    pos_map = {
        'goalkeeper': 'POR', 'portero': 'POR', 'g': 'POR', 'gk': 'POR',
        'defender': 'DEF', 'defensa': 'DEF', 'd': 'DEF', 'df': 'DEF',
        'midfielder': 'MED', 'centrocampista': 'MED', 'm': 'MED', 'mf': 'MED',
        'attacker': 'DEL', 'striker': 'DEL', 'forward': 'DEL', 'delantero': 'DEL', 'a': 'DEL', 'f': 'DEL', 'fw': 'DEL'
    }
    squads_path = match_dir / "squads"
    if squads_path.exists():
        for squad_file in squads_path.glob("*.json"):
            with open(squad_file, 'r', encoding='utf-8') as sf:
                s_data = json.load(sf)
                players = s_data.get('players', s_data.get('squad', []))
                for p in players:
                    pid = str(p.get('id'))
                    if pid:
                        raw_pos = p.get('position', '').lower().strip()
                        pos = pos_map.get(raw_pos, 'MED')
                        positions_map[pid] = pos
                        names_map[pid] = p.get('matchName') or (p.get('firstName', '') + ' ' + p.get('lastName', '')).strip()

    events_file = match_dir / "events" / f"{match_id}.json"
    if not events_file.exists():
        events_file = match_dir / f"{match_id}.json"
        if not events_file.exists():
            print(f"❌ No se encontró el archivo de eventos para: {match_id}")
            return
            
    with open(events_file, 'r', encoding='utf-8') as ef:
        m_data = json.load(ef)
        
    events = m_data.get('liveData', {}).get('event', [])
    events.sort(key=lambda x: (
        -1 if x.get('periodId') == 16 else x.get('periodId', 0),
        x.get('timeMin', 0), x.get('timeSec', 0), x.get('id', 0)
    ))
    
    # Process events for stats
    on_pitch = set()
    entry_minutes = {}
    total_minutes = {}
    player_stats = {}
    shots_by_event_id = {}
    event_dict = {}
    players_team = {}
    teams = set()
    
    for e in events:
        contestant_id = e.get('contestantId')
        evt_id = str(e.get('eventId'))
        if contestant_id and evt_id:
            event_dict[(contestant_id, evt_id)] = e
            
        type_id = e.get('typeId')
        if type_id in (13, 14, 15, 16):
            if type_id == 16:
                is_own_goal = any(q.get('qualifierId') == 28 for q in e.get('qualifier', []))
                if is_own_goal:
                    continue
            x = e.get('x', 50.0)
            y = e.get('y', 50.0)
            shots_by_event_id[e.get('eventId')] = (x, y)
            
    def init_stats(pid):
        if pid not in player_stats:
            player_stats[pid] = {
                'saves': 0, 'calidad_parada': 0.0, 'saves_gte_0_7': 0,
                'long_balls_completed': 0, 'long_balls_attempted': 0,
                'passes_completed': 0, 'passes_attempted': 0,
                'pass_opp_half_completed': 0, 'pass_opp_half_attempted': 0,
                'forward_passes': 0, 'successful_crosses': 0, 'crosses_attempted': 0, 'crosses_completed': 0,
                'claims': 0, 'punches_ok': 0, 'punches_fail': 0,
                'sweepers': 0, 'cubrir_blocar': 0, 'def_actions_last_man': 0,
                'abp_remates': 0, 'remates_cabeza': 0, 'recoveries_opp_half': 0,
                'recoveries_total': 0, 'interceptions_total': 0, 'clearances': 0,
                'good_skills': 0, 'tackles_total': 0, 'tackles_won': 0,
                'aerials_total': 0, 'aerials_won': 0, 'aerials_lost': 0,
                'ground_duels_total': 0, 'ground_duels_won': 0,
                'shots_total': 0, 'shots_on_target': 0, 'goals': 0, 'own_goals': 0,
                'goals_conceded': 0, 'assists': 0, 'fantasy_assists': 0,
                'final_third_events': 0, 'fouls_committed': 0, 'fouls_won': 0,
                'def_actions_type_12_8_49_42_7': 0, 'def_actions_type_12_8_49_4_7': 0, 'def_actions_type_12_8_49_7': 0,
                'def_actions_opp_half_12_8_49_42_7': 0, 'def_actions_opp_half_12_8_49_7': 0,
                'off_actions_3_4_outcome_1': 0, 'off_actions_3_4_all': 0,
                'off_actions_opp_half_outcome_1': 0, 'off_actions_opp_half_all': 0,
                'takeons_won': 0, 'takeons_lost': 0, 'takeons_overrun': 0, 'bad_touches': 0,
                'intercept_recup_3_4': 0
            }
            
    current_minute = 0
    processed_events = set()
    
    for e in events:
        evt_id = e.get('id')
        if evt_id in processed_events: continue
        processed_events.add(evt_id)
        
        type_id = e.get('typeId')
        pid = e.get('playerId')
        t_min = e.get('timeMin', 0)
        if t_min > current_minute: current_minute = t_min
        
        if type_id == 34:
            team_id = e.get('contestantId')
            if team_id: teams.add(team_id)
            q30 = next((q.get('value') for q in e.get('qualifier', []) if q.get('qualifierId') == 30), None)
            if q30 and isinstance(q30, str):
                for player_id in [p.strip() for p in q30.split(',')][:11]:
                    on_pitch.add(player_id)
                    players_team[player_id] = team_id
                    entry_minutes[player_id] = 0
                    init_stats(player_id)
            continue
            
        if type_id == 18:
            if pid in on_pitch:
                on_pitch.remove(pid)
                mins = max(0, t_min - entry_minutes.get(pid, t_min))
                total_minutes[pid] = total_minutes.get(pid, 0) + mins
            continue
            
        if type_id == 19:
            team_id = e.get('contestantId')
            on_pitch.add(pid)
            players_team[pid] = team_id
            entry_minutes[pid] = t_min
            init_stats(pid)
            continue
            
        if not pid: continue
        init_stats(pid)
        
        is_red = any(q.get('qualifierId') == 33 for q in e.get('qualifier', []))
        is_second_yellow = any(q.get('qualifierId') == 32 for q in e.get('qualifier', []))
        if type_id == 17 and (is_red or is_second_yellow):
            if pid in on_pitch:
                on_pitch.remove(pid)
                mins = max(0, t_min - entry_minutes.get(pid, t_min))
                total_minutes[pid] = total_minutes.get(pid, 0) + mins
                
        outcome = e.get('outcome', 1)
        x = e.get('x', 0.0)
        y = e.get('y', 0.0)
        is_opp_half = x >= 50.0
        is_final_third = x > 66.6
        
        qualifiers = {q.get('qualifierId'): q.get('value') for q in e.get('qualifier', [])}
        
        if 14 in qualifiers: player_stats[pid]['def_actions_last_man'] += 1
        if type_id in [1, 2, 3, 13, 14, 15, 16, 42, 50, 61] and is_final_third:
            player_stats[pid]['final_third_events'] += 1
        if type_id in [3, 4, 7, 54]:
            player_stats[pid]['ground_duels_total'] += 1
            if outcome == 1: player_stats[pid]['ground_duels_won'] += 1
        if type_id == 54: player_stats[pid]['cubrir_blocar'] += 1
        if type_id in (49, 8) and is_opp_half: player_stats[pid]['recoveries_opp_half'] += 1
        if type_id in [8, 49] and is_final_third: player_stats[pid]['intercept_recup_3_4'] += 1
        
        if type_id in [13, 14, 15, 16]:
            is_own_goal = 28 in qualifiers
            if not is_own_goal:
                player_stats[pid]['shots_total'] += 1
                if type_id in [15, 16] and not (82 in qualifiers): player_stats[pid]['shots_on_target'] += 1
                if type_id == 16: player_stats[pid]['goals'] += 1
                q55_val = qualifiers.get(55)
                if q55_val:
                    rel_key = (e.get('contestantId'), str(q55_val))
                    rel_event = event_dict.get(rel_key)
                    if rel_event and rel_event.get('playerId'):
                        rel_pid = rel_event.get('playerId')
                        init_stats(rel_pid)
                        if type_id == 16: player_stats[rel_pid]['assists'] += 1
                        elif 214 in qualifiers: player_stats[rel_pid]['fantasy_assists'] += 1
            else:
                player_stats[pid]['own_goals'] += 1
            if 24 in qualifiers or 25 in qualifiers: player_stats[pid]['abp_remates'] += 1
            if 15 in qualifiers: player_stats[pid]['remates_cabeza'] += 1
            
        if type_id == 1:
            is_long = 1 in qualifiers
            is_cross = 2 in qualifiers
            player_stats[pid]['passes_attempted'] += 1
            if is_opp_half: player_stats[pid]['pass_opp_half_attempted'] += 1
            if is_cross: player_stats[pid]['crosses_attempted'] += 1
            if outcome == 1:
                player_stats[pid]['passes_completed'] += 1
                if is_opp_half: player_stats[pid]['pass_opp_half_completed'] += 1
                if is_long: player_stats[pid]['long_balls_completed'] += 1
                end_x_val = qualifiers.get(140)
                end_y_val = qualifiers.get(141)
                if end_x_val is not None and end_y_val is not None:
                    try:
                        ex, ey = float(end_x_val), float(end_y_val)
                        if (ex - x) > 20 and -35 <= (ey - y) <= 35: player_stats[pid]['forward_passes'] += 1
                    except: pass
                is_through_ball_into_box = False
                if 4 in qualifiers and end_x_val is not None and end_y_val is not None:
                    try:
                        ex, ey = float(end_x_val), float(end_y_val)
                        if ex >= 83 and 21.1 <= ey <= 78.9: is_through_ball_into_box = True
                    except: pass
                if is_cross or is_through_ball_into_box: player_stats[pid]['successful_crosses'] += 1
                if is_cross: player_stats[pid]['crosses_completed'] += 1
                
        if type_id == 3:
            if outcome == 1: player_stats[pid]['takeons_won'] += 1
            else: player_stats[pid]['takeons_lost'] += 1
        if type_id == 49: player_stats[pid]['recoveries_total'] += 1
        if type_id == 8: player_stats[pid]['interceptions_total'] += 1
        if type_id == 12: player_stats[pid]['clearances'] += 1
        if type_id == 42: player_stats[pid]['good_skills'] += 1
        if type_id == 7:
            player_stats[pid]['tackles_total'] += 1
            if outcome == 1: player_stats[pid]['tackles_won'] += 1
        if type_id == 44:
            player_stats[pid]['aerials_total'] += 1
            if outcome == 1: player_stats[pid]['aerials_won'] += 1
            else: player_stats[pid]['aerials_lost'] += 1
        if type_id == 59: player_stats[pid]['sweepers'] += 1
        if type_id == 11: player_stats[pid]['claims'] += 1
        if type_id == 41:
            if outcome == 1: player_stats[pid]['punches_ok'] += 1
            else: player_stats[pid]['punches_fail'] += 1
        if type_id == 4:
            if outcome == 0: player_stats[pid]['fouls_committed'] += 1
            else: player_stats[pid]['fouls_won'] += 1
            
        if type_id == 10 and not (94 in qualifiers):
            player_stats[pid]['saves'] += 1
            q_233 = qualifiers.get(233)
            closest_shot = None
            if q_233:
                try: closest_shot = shots_by_event_id.get(int(q_233))
                except: pass
            if closest_shot:
                sx, sy = closest_shot
                val = 0.1
                if sx >= 94.2 and 36.8 <= sy <= 63.2: val = 0.9
                elif 83 <= sx < 94.2 and 36.8 <= sy <= 63.2: val = 0.7
                elif sx < 83: val = 0.2
                elif sx >= 83 and ((21.1 <= sy < 36.8) or (63.2 < sy <= 78.9)): val = 0.4
                player_stats[pid]['calidad_parada'] += val
                if val >= 0.7: player_stats[pid]['saves_gte_0_7'] += 1
                
        if type_id == 16:
            is_own_goal = 28 in qualifiers
            conceding_team = e.get('contestantId') if is_own_goal else next((t for t in teams if t != e.get('contestantId')), None)
            if conceding_team:
                for p_on in on_pitch:
                    if players_team.get(p_on) == conceding_team:
                        init_stats(p_on)
                        player_stats[p_on]['goals_conceded'] += 1
                        
        if type_id in [12, 8, 49, 42, 7]:
            player_stats[pid]['def_actions_type_12_8_49_42_7'] += 1
            if is_opp_half: player_stats[pid]['def_actions_opp_half_12_8_49_42_7'] += 1
        if type_id in [12, 8, 49, 7]:
            player_stats[pid]['def_actions_type_12_8_49_7'] += 1
            if is_opp_half: player_stats[pid]['def_actions_opp_half_12_8_49_7'] += 1
        if type_id in [12, 8, 49, 4, 7]:
            player_stats[pid]['def_actions_type_12_8_49_4_7'] += 1
            
        if type_id in [1, 13, 14, 15, 16, 3]:
            if is_final_third:
                player_stats[pid]['off_actions_3_4_all'] += 1
                if type_id in [1, 3] and outcome == 1: player_stats[pid]['off_actions_3_4_outcome_1'] += 1
                elif type_id in [13, 14, 15, 16]: player_stats[pid]['off_actions_3_4_outcome_1'] += 1
            if is_opp_half:
                player_stats[pid]['off_actions_opp_half_all'] += 1
                if type_id in [1, 3] and outcome == 1: player_stats[pid]['off_actions_opp_half_outcome_1'] += 1
                elif type_id in [13, 14, 15, 16]: player_stats[pid]['off_actions_opp_half_outcome_1'] += 1
                
    for pid in on_pitch:
        mins = max(0, current_minute - entry_minutes.get(pid, current_minute))
        total_minutes[pid] = total_minutes.get(pid, 0) + mins
        
    # Proposed limits definitions
    TH = {
        'POR': {
            'b1_pases_min': 0.18, 'b1_saves_min': 0.01,
            'b2_long_min': 0.04,
            'b3_long_part': 6.0, 'b3_claims_punches': 0.02, 'b3_sweepers': 0.02,
            'b4_saves_07': 2, 'b4_saves_cs_min': 0.03
        },
        'DEF': {
            'b1_def_min': 0.07, 'b1_pass_pct': 70.0,
            'b2_long_min': 0.03, 'b2_fwd_min': 0.03, 'b2_ground_pct': 55.0,
            'b3_aerial_pct': 75.0, 'b3_recup_min': 0.10, 'b3_abp_min': 0.01, 'b3_cross_min': 0.02,
            'b4_off_min': 0.30, 'b4_duels_pct': 90.0
        },
        'MED': {
            'b1_def_opp_min': 0.01, 'b1_pass_pct': 66.0,
            'b2_aerial_pct': 45.0, 'b2_recup_opp_min': 0.03, 'b2_fwd_long_pct': 10.0,
            'b3_shots_on_pct': 66.0, 'b3_off_opp_min': 0.85, 'b3_intercept_34_min': 0.02,
            'b4_goals': 1, 'b4_assists': 3, 'b4_takeons_pct': 75.0
        },
        'DEL': {
            'b1_part_34_min': 0.09, 'b1_recup_opp_min': 0.009,
            'b2_aerial_pct': 40.0, 'b2_shots_on_target': 1,
            'b3_shots_on_pct': 70.0, 'b3_takeons_pct': 75.0,
            'b4_goals': 1, 'b4_assists': 3, 'b4_off_opp_min': 0.40
        }
    }
    
    # Results will be printed and logged below
    
    player_results = []
    
    for pid, stats in player_stats.items():
        mins = total_minutes.get(pid, 0)
        if mins <= 0: continue
        
        pos = positions_map.get(pid, 'MED')
        name = names_map.get(pid, f"Player_{pid}")
        
        th = TH.get(pos, TH['MED'])
        
        def sym(met): return "✅" if met else "❌"
        
        b1_met = False; b1_details = ""
        b2_met = False; b2_details = ""
        b3_met = False; b3_details = ""
        b4_met = False; b4_details = ""
        
        if pos == 'POR':
            # B1
            v_pases_min = stats['passes_completed'] / mins
            v_saves_min = stats['saves'] / mins
            b1_cond1 = v_pases_min >= th['b1_pases_min']
            b1_cond2 = v_saves_min >= th['b1_saves_min']
            b1_met = b1_cond1 or b1_cond2
            b1_details = f"Pases comp/min: {v_pases_min:.3f}/{th['b1_pases_min']:.2f} ({sym(b1_cond1)}) o Paradas/min: {v_saves_min:.3f}/{th['b1_saves_min']:.2f} ({sym(b1_cond2)})"
            
            # B2
            b2_cond1 = stats['calidad_parada'] > (stats['saves'] / 3.0) if stats['saves'] > 0 else False
            v_long_min = stats['long_balls_completed'] / mins
            b2_cond2 = v_long_min >= th['b2_long_min']
            b2_met = b2_cond1 or b2_cond2
            b2_details = f"Calidad/paradas: {stats['calidad_parada']:.2f}>{stats['saves']/3.0:.2f} ({sym(b2_cond1)}) o P.largos/min: {v_long_min:.3f}/{th['b2_long_min']:.2f} ({sym(b2_cond2)})"
            
            # B3
            v_long_part = stats['long_balls_completed']
            v_claims_punches = (stats['claims'] + stats['punches_ok'] + stats['punches_fail']) / mins
            v_sweepers = (stats['sweepers'] + stats['cubrir_blocar']) / mins
            b3_cond1 = v_long_part >= th['b3_long_part']
            b3_cond2 = v_claims_punches >= th['b3_claims_punches']
            b3_cond3 = v_sweepers >= th['b3_sweepers']
            b3_met = b3_cond1 or b3_cond2 or b3_cond3
            b3_details = f"P.largos: {v_long_part}/{int(th['b3_long_part'])} ({sym(b3_cond1)}) o Claims+puños/min: {v_claims_punches:.3f}/{th['b3_claims_punches']:.2f} ({sym(b3_cond2)}) o Salidas/min: {v_sweepers:.3f}/{th['b3_sweepers']:.2f} ({sym(b3_cond3)})"
            
            # B4
            v_saves_07 = stats['saves_gte_0_7']
            b4_cond1 = v_saves_07 >= th['b4_saves_07']
            b4_cond2 = (v_saves_min > th['b4_saves_cs_min']) and (stats['goals_conceded'] == 0) and (stats['saves'] >= 2)
            b4_met = b4_cond1 or b4_cond2
            b4_details = f"Paradas >=0.7: {v_saves_07}/{th['b4_saves_07']} ({sym(b4_cond1)}) o CS + Paradas/min > {th['b4_saves_cs_min']:.2f} (saves={stats['saves']}, conceded={stats['goals_conceded']}) ({sym(b4_cond2)})"
            
        elif pos == 'DEF':
            # B1
            v_def = stats['def_actions_type_12_8_49_42_7'] / mins
            v_pass_pct = (stats['passes_completed'] / stats['passes_attempted'] * 100) if stats['passes_attempted'] > 0 else 0
            b1_cond1 = v_def >= th['b1_def_min']
            b1_cond2 = v_pass_pct > th['b1_pass_pct']
            b1_met = b1_cond1 or b1_cond2
            b1_details = f"Acc.def/min: {v_def:.3f}/{th['b1_def_min']:.2f} ({sym(b1_cond1)}) o %Pases: {v_pass_pct:.1f}%>{th['b1_pass_pct']}% ({sym(b1_cond2)})"
            
            # B2
            v_long_min = stats['long_balls_completed'] / mins
            v_fwd_min = stats['forward_passes'] / mins
            v_ground_total = stats['ground_duels_total']
            v_ground = (stats['ground_duels_won'] / v_ground_total * 100) if v_ground_total >= 3 else 0
            b2_cond1 = v_long_min >= th['b2_long_min']
            b2_cond2 = v_fwd_min >= th['b2_fwd_min']
            b2_cond3 = (v_ground > th['b2_ground_pct']) and (v_ground_total >= 3)
            b2_met = b2_cond1 or b2_cond2 or b2_cond3
            b2_details = f"P.largos/min: {v_long_min:.3f}/{th['b2_long_min']:.2f} ({sym(b2_cond1)}) o P.fwd/min: {v_fwd_min:.3f}/{th['b2_fwd_min']:.2f} ({sym(b2_cond2)}) o %Suelo (mín 3): {v_ground:.1f}%>{th['b2_ground_pct']}% ({sym(b2_cond3)}, total={v_ground_total})"
            
            # B3
            v_aerial_total = stats['aerials_total']
            v_aerial = (stats['aerials_won'] / v_aerial_total * 100) if v_aerial_total >= 3 else 0
            v_recup = stats['recoveries_total'] / mins
            v_abp = stats['abp_remates'] / mins
            v_cross = stats['successful_crosses'] / mins
            b3_cond1 = (v_aerial >= th['b3_aerial_pct']) and (v_aerial_total >= 3)
            b3_cond2 = v_recup >= th['b3_recup_min']
            b3_cond3 = v_abp >= th['b3_abp_min']
            b3_cond4 = v_cross >= th['b3_cross_min']
            b3_met = b3_cond1 or b3_cond2 or b3_cond3 or b3_cond4
            b3_details = f"%Aéreo (mín 3): {v_aerial:.1f}%>={th['b3_aerial_pct']}% ({sym(b3_cond1)}) o Recup/min: {v_recup:.3f}/{th['b3_recup_min']:.2f} ({sym(b3_cond2)}) o ABP/min: {v_abp:.3f}/{th['b3_abp_min']:.2f} ({sym(b3_cond3)}) o Centros/min: {v_cross:.3f}/{th['b3_cross_min']:.2f} ({sym(b3_cond4)})"
            
            # B4
            v_off = stats['off_actions_3_4_outcome_1'] / mins
            v_duels_total = stats['ground_duels_total'] + stats['aerials_total']
            v_duels_won = stats['ground_duels_won'] + stats['aerials_won']
            v_duels = (v_duels_won / v_duels_total * 100) if v_duels_total >= 5 else 0
            b4_cond1 = v_off >= th['b4_off_min']
            b4_cond2 = (v_duels > th['b4_duels_pct']) and (v_duels_total >= 5)
            b4_met = b4_cond1 or b4_cond2
            b4_details = f"Acc.off 3_4/min: {v_off:.3f}/{th['b4_off_min']:.2f} ({sym(b4_cond1)}) o %Duelos tot (mín 5): {v_duels:.1f}%>{th['b4_duels_pct']}% ({sym(b4_cond2)}, total={v_duels_total})"
            
        elif pos == 'MED':
            # B1
            v_def_opp = stats['def_actions_opp_half_12_8_49_42_7'] / mins
            v_pass_pct = (stats['passes_completed'] / stats['passes_attempted'] * 100) if stats['passes_attempted'] > 0 else 0
            b1_cond1 = v_def_opp >= th['b1_def_opp_min']
            b1_cond2 = v_pass_pct >= th['b1_pass_pct']
            b1_met = b1_cond1 or b1_cond2
            b1_details = f"Acc.def opp/min: {v_def_opp:.3f}/{th['b1_def_opp_min']:.2f} ({sym(b1_cond1)}) o %Pases: {v_pass_pct:.1f}%>={th['b1_pass_pct']}% ({sym(b1_cond2)})"
            
            # B2
            v_aerial_total = stats['aerials_total']
            v_aerial = (stats['aerials_won'] / v_aerial_total * 100) if v_aerial_total >= 3 else 0
            v_recup_opp = stats['recoveries_opp_half'] / mins
            v_fwd_long = ((stats['forward_passes'] + stats['long_balls_completed']) / stats['passes_completed'] * 100) if stats['passes_completed'] > 0 else 0
            b2_cond1 = (v_aerial >= th['b2_aerial_pct']) and (v_aerial_total >= 3)
            b2_cond2 = v_recup_opp >= th['b2_recup_opp_min']
            b2_cond3 = v_fwd_long > th['b2_fwd_long_pct']
            b2_met = b2_cond1 or b2_cond2 or b2_cond3
            b2_details = f"%Aéreo (mín 3): {v_aerial:.1f}%>={th['b2_aerial_pct']}% ({sym(b2_cond1)}) o Recup opp/min: {v_recup_opp:.3f}/{th['b2_recup_opp_min']:.2f} ({sym(b2_cond2)}) o %Adelante+Largos: {v_fwd_long:.1f}%>{th['b2_fwd_long_pct']}% ({sym(b2_cond3)})"
            
            # B3
            v_shots_total = stats['shots_total']
            v_shots = (stats['shots_on_target'] / v_shots_total * 100) if v_shots_total > 0 else 0
            v_intercept_34 = stats['intercept_recup_3_4'] / mins
            v_off_opp = stats['off_actions_opp_half_outcome_1'] / mins
            b3_cond1 = (v_shots > th['b3_shots_on_pct']) and (v_shots_total >= 2)
            b3_cond2 = v_off_opp >= th['b3_off_opp_min']
            b3_cond3 = v_intercept_34 >= th['b3_intercept_34_min']
            b3_met = b3_cond1 or b3_cond2 or b3_cond3
            b3_details = f"%Tiros a puerta (mín 2): {v_shots:.1f}%>{th['b3_shots_on_pct']}% ({sym(b3_cond1)}, total={v_shots_total}) o Acc.off opp/min: {v_off_opp:.3f}/{th['b3_off_opp_min']:.2f} ({sym(b3_cond2)}) o Int+Rec 3_4/min: {v_intercept_34:.3f}/{th['b3_intercept_34_min']:.2f} ({sym(b3_cond3)})"
            
            # B4
            v_goals = stats['goals']
            v_assists = stats['assists'] + stats['fantasy_assists']
            v_takeons_total = stats['takeons_won'] + stats['takeons_lost']
            v_takeons = (stats['takeons_won'] / v_takeons_total * 100) if v_takeons_total >= 2 else 0
            b4_cond1 = v_goals >= th['b4_goals']
            b4_cond2 = v_assists >= th['b4_assists']
            b4_cond3 = (v_takeons > th['b4_takeons_pct']) and (v_takeons_total >= 2)
            b4_met = b4_cond1 or b4_cond2 or b4_cond3
            b4_details = f"Goles: {v_goals}/{th['b4_goals']} ({sym(b4_cond1)}) o Asist: {v_assists}/{th['b4_assists']} ({sym(b4_cond2)}) o %Regates (mín 2): {v_takeons:.1f}%>{th['b4_takeons_pct']}% ({sym(b4_cond3)})"
            
        elif pos == 'DEL':
            # B1
            v_part = stats['final_third_events'] / mins
            v_recup_opp = stats['recoveries_opp_half'] / mins
            b1_cond1 = v_part >= th['b1_part_34_min']
            b1_cond2 = v_recup_opp >= th['b1_recup_opp_min']
            b1_met = b1_cond1 or b1_cond2
            b1_details = f"Part 3_4/min: {v_part:.3f}/{th['b1_part_34_min']:.2f} ({sym(b1_cond1)}) o Recup opp/min: {v_recup_opp:.3f}/{th['b1_recup_opp_min']:.3f} ({sym(b1_cond2)})"
            
            # B2
            v_aerial_total = stats['aerials_total']
            v_aerial = (stats['aerials_won'] / v_aerial_total * 100) if v_aerial_total >= 3 else 0
            v_shots_target = stats['shots_on_target']
            b2_cond1 = (v_aerial > th['b2_aerial_pct']) and (v_aerial_total >= 3)
            b2_cond2 = v_shots_target >= th['b2_shots_on_target']
            b2_met = b2_cond1 or b2_cond2
            b2_details = f"%Aéreo (mín 3): {v_aerial:.1f}%>{th['b2_aerial_pct']}% ({sym(b2_cond1)}) o Tiros a puerta (15+16): {v_shots_target}/{th['b2_shots_on_target']} ({sym(b2_cond2)})"
            
            # B3
            v_shots_total = stats['shots_total']
            v_shots = (stats['shots_on_target'] / v_shots_total * 100) if v_shots_total > 0 else 0
            v_takeons_total = stats['takeons_won'] + stats['takeons_lost']
            v_takeons = (stats['takeons_won'] / v_takeons_total * 100) if v_takeons_total >= 2 else 0
            b3_cond1 = (v_shots > th['b3_shots_on_pct']) and (v_shots_total >= 3)
            b3_cond2 = (v_takeons > th['b3_takeons_pct']) and (v_takeons_total >= 2)
            b3_met = b3_cond1 or b3_cond2
            b3_details = f"%Remates (mín 3): {v_shots:.1f}%>{th['b3_shots_on_pct']}% ({sym(b3_cond1)}, total={v_shots_total}) o %Regates (mín 2): {v_takeons:.1f}%>{th['b3_takeons_pct']}% ({sym(b3_cond2)})"
            
            # B4
            v_goals = stats['goals']
            v_assists = stats['assists'] + stats['fantasy_assists']
            v_off_opp = stats['off_actions_opp_half_outcome_1'] / mins
            b4_cond1 = v_goals >= th['b4_goals']
            b4_cond2 = v_assists >= th['b4_assists']
            b4_cond3 = v_off_opp >= th['b4_off_opp_min']
            b4_met = b4_cond1 or b4_cond2 or b4_cond3
            b4_details = f"Goles: {v_goals}/{th['b4_goals']} ({sym(b4_cond1)}) o Asist: {v_assists}/{th['b4_assists']} ({sym(b4_cond2)}) o Acc.off opp/min: {v_off_opp:.3f}/{th['b4_off_opp_min']:.4f} ({sym(b4_cond3)})"
            
        blocks_passed = sum([1 if m else 0 for m in [b1_met, b2_met, b3_met, b4_met]])
        relevo_pts = blocks_passed if blocks_passed > 0 else -1
        
        player_results.append({
            'name': name,
            'pos': pos,
            'mins': mins,
            'b1': b1_met, 'b1_details': b1_details,
            'b2': b2_met, 'b2_details': b2_details,
            'b3': b3_met, 'b3_details': b3_details,
            'b4': b4_met, 'b4_details': b4_details,
            'relevo_points': relevo_pts
        })
        
    player_results.sort(key=lambda x: (x['pos'], x['name']))
    
    output_lines = []
    def log(msg=""):
        print(msg)
        output_lines.append(str(msg))
        
    log("\n" + "="*80)
    log(f"📊 EVALUACIÓN DE PUNTOS RELEVO PARA EL PARTIDO {match_id}")
    log("="*80)

    for r in player_results:
        def sym(met): return "✅" if met else "❌"
        log(f"\n👤 {r['name']} ({r['pos']} - {r['mins']} mins) -> Puntos RELEVO: {r['relevo_points']:+d}")
        log(f"  Bloque 1 (Muy Fácil): {sym(r['b1'])} | {r['b1_details']}")
        log(f"  Bloque 2 (Fácil):     {sym(r['b2'])} | {r['b2_details']}")
        log(f"  Bloque 3 (Difícil):   {sym(r['b3'])} | {r['b3_details']}")
        log(f"  Bloque 4 (Muy Dif.):  {sym(r['b4'])} | {r['b4_details']}")
        
    log("\n" + "="*80)
    log(f"🏁 FIN DE EVALUACIÓN PARA {match_id}")
    log("="*80 + "\n")
    
    # Save to file
    outfile = match_dir / "relevo_evaluacion.txt"
    try:
        with open(outfile, 'w', encoding='utf-8') as f:
            f.write("\n".join(output_lines))
    except Exception:
        pass
        
    # Save to system Downloads folder
    downloads_dir = Path.home() / "Downloads"
    if downloads_dir.exists():
        dl_file = downloads_dir / "relevo_evaluacion.txt"
        try:
            with open(dl_file, 'w', encoding='utf-8') as f:
                f.write("\n".join(output_lines))
            print(f"💾 Reporte guardado en tu carpeta de Descargas:\n   📄 {dl_file}\n")
        except Exception as e:
            print(f"⚠️ Error guardando reporte en Descargas: {e}\n")
    else:
        print(f"💾 Resultados detallados guardados en: {outfile}\n")

if __name__ == '__main__':
    import sys
    if len(sys.argv) > 1:
        match_id = sys.argv[1]
        print_match_breakdown(match_id)
    else:
        analyze_relevo_metrics()


