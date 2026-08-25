import os
import json

data_dir = '/Users/imac/Programas/LFM Vilafranca/frontend-web/data/Partidos_Individuales'

player_stats = {} # pid -> {'passes': 0, 'good': 0, 'bad': 0, 'mins': 0, 'matches': 0}
player_names = {}
midfielders = set()

for match_dir in os.listdir(data_dir):
    match_path = os.path.join(data_dir, match_dir)
    if not os.path.isdir(match_path):
        continue
    
    # 1. Load squads to identify midfielders
    squads_dir = os.path.join(match_path, 'squads')
    if os.path.exists(squads_dir):
        for squad_file in os.listdir(squads_dir):
            if not squad_file.endswith('.json'):
                continue
            with open(os.path.join(squads_dir, squad_file), 'r') as f:
                squad_data = json.load(f)
                if 'players' in squad_data:
                    for p in squad_data['players']:
                        pid = p['id']
                        pos = p.get('position', '').lower()
                        player_names[pid] = p.get('matchName', str(pid))
                        if pos == 'midfielder' or pos == 'mid':
                            midfielders.add(pid)
    
    # 2. Parse events
    events_file = os.path.join(match_path, 'events', f"{match_dir}.json")
    if not os.path.exists(events_file):
        continue
        
    with open(events_file, 'r') as f:
        match_data = json.load(f)
        
    if 'liveData' not in match_data or 'event' not in match_data['liveData']:
        continue
        
    events = match_data['liveData']['event']
    
    match_player_stats = {} # pid -> stats for this match
    
    for ev in events:
        pid = ev.get('playerId')
        if not pid or pid not in midfielders:
            continue
            
        if pid not in match_player_stats:
            match_player_stats[pid] = {'passes': 0, 'good': 0, 'bad': 0, 'in_min': None, 'out_min': None, 'has_events': True}
            
        typeId = ev.get('typeId')
        outcome = ev.get('outcome')
        minute = ev.get('timeMin', 0)
        
        if typeId == 1:
            match_player_stats[pid]['passes'] += 1
            if outcome == 1:
                match_player_stats[pid]['good'] += 1
            else:
                match_player_stats[pid]['bad'] += 1
                
        elif typeId == 18: # Sub out
            match_player_stats[pid]['out_min'] = minute
        elif typeId == 19: # Sub in
            match_player_stats[pid]['in_min'] = minute

    # Calculate minutes for this match and add to totals
    for pid, st in match_player_stats.items():
        if pid not in player_stats:
            player_stats[pid] = {'passes': 0, 'good': 0, 'bad': 0, 'mins': 0, 'matches': 0}
            
        in_min = st['in_min'] if st['in_min'] is not None else 0
        out_min = st['out_min'] if st['out_min'] is not None else 90
        
        mins_played = out_min - in_min
        if mins_played < 0: mins_played = 0
        
        player_stats[pid]['passes'] += st['passes']
        player_stats[pid]['good'] += st['good']
        player_stats[pid]['bad'] += st['bad']
        player_stats[pid]['mins'] += mins_played
        player_stats[pid]['matches'] += 1

# Aggregate global stats for midfielders
total_passes = sum(st['passes'] for st in player_stats.values())
total_good = sum(st['good'] for st in player_stats.values())
total_bad = sum(st['bad'] for st in player_stats.values())
total_mins = sum(st['mins'] for st in player_stats.values())
total_midfielders = len([st for st in player_stats.values() if st['passes'] > 0])

print("--- ESTADÍSTICAS GLOBALES DE MEDIOCAMPISTAS ---")
print(f"Total mediocampistas que han participado: {total_midfielders}")
print(f"Media de pases totales por jugador: {total_passes / max(1, total_midfielders):.2f}")
print(f"Media de pases buenos por jugador: {total_good / max(1, total_midfielders):.2f}")
print(f"Media de pases malos por jugador: {total_bad / max(1, total_midfielders):.2f}")
if total_passes > 0:
    print(f"Porcentaje de pases buenos global: {(total_good / total_passes) * 100:.2f}%")
else:
    print("Porcentaje de pases buenos global: 0.00%")
    
if total_mins > 0:
    print(f"Media de pases por minuto jugado: {total_passes / total_mins:.4f}")
else:
    print("Media de pases por minuto jugado: 0.0000")

# Top 5 jugadores por pases por minuto (min 100 mins jugados)
print("\n--- TOP 5 MEDIOS (Pases / Minuto) ---")
valid_players = [
    (pid, st) for pid, st in player_stats.items() 
    if st['mins'] >= 100
]
valid_players.sort(key=lambda x: x[1]['passes'] / max(1, x[1]['mins']), reverse=True)

for pid, st in valid_players[:5]:
    ppm = st['passes'] / max(1, st['mins'])
    print(f"{player_names.get(pid, pid)}: {ppm:.2f} pases/min ({st['passes']} pases en {st['mins']} min)")

