import os
import json

data_dir = '/Users/imac/Programas/LFM Vilafranca/frontend-web/data/Partidos_Individuales'

# typeIds that count as participation (ball involvement)
participation_type_ids = {1, 2, 3, 13, 14, 15, 16, 42, 50, 61}

player_stats = {} # pid -> {'participations': 0, 'mins': 0, 'matches': 0}
player_names = {}
forwards = set()

for match_dir in os.listdir(data_dir):
    match_path = os.path.join(data_dir, match_dir)
    if not os.path.isdir(match_path):
        continue
    
    # 1. Load squads to identify forwards
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
                        if 'forward' in pos or 'fwd' in pos or 'attacker' in pos or 'striker' in pos:
                            forwards.add(pid)
    
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
        if not pid or pid not in forwards:
            continue
            
        if pid not in match_player_stats:
            match_player_stats[pid] = {'participations': 0, 'in_min': None, 'out_min': None}
            
        typeId = ev.get('typeId')
        minute = ev.get('timeMin', 0)
        x = ev.get('x', 0.0)
        
        if typeId in participation_type_ids:
            if x > 66.6:
                match_player_stats[pid]['participations'] += 1
                
        elif typeId == 18: # Sub out
            match_player_stats[pid]['out_min'] = minute
        elif typeId == 19: # Sub in
            match_player_stats[pid]['in_min'] = minute

    # Calculate minutes for this match and add to totals
    for pid, st in match_player_stats.items():
        if pid not in player_stats:
            player_stats[pid] = {'participations': 0, 'mins': 0, 'matches': 0}
            
        in_min = st['in_min'] if st['in_min'] is not None else 0
        out_min = st['out_min'] if st['out_min'] is not None else 90
        
        mins_played = out_min - in_min
        if mins_played < 0: mins_played = 0
        
        player_stats[pid]['participations'] += st['participations']
        player_stats[pid]['mins'] += mins_played
        player_stats[pid]['matches'] += 1

# Aggregate global stats for forwards
total_participations = sum(st['participations'] for st in player_stats.values())
total_mins = sum(st['mins'] for st in player_stats.values())
total_forwards = len([st for st in player_stats.values() if st['participations'] > 0])

print("--- ESTADÍSTICAS DE PARTICIPACIÓN DE DELANTEROS (Tercio final: X > 66.6) ---")
print(f"Total delanteros con eventos en el tercio final: {total_forwards}")
print(f"Media de participaciones en tercio final por jugador: {total_participations / max(1, total_forwards):.2f}")
    
if total_mins > 0:
    print(f"Media global de participaciones por minuto jugado (X > 66.6): {total_participations / total_mins:.4f}")
else:
    print("Media global de participaciones por minuto jugado: 0.0000")

# Top 10 delanteros por participaciones por minuto (min 100 mins jugados)
print("\n--- TOP 10 DELANTEROS (Participaciones en Tercio Final / Minuto) ---")
valid_players = [
    (pid, st) for pid, st in player_stats.items() 
    if st['mins'] >= 100
]
valid_players.sort(key=lambda x: x[1]['participations'] / max(1, x[1]['mins']), reverse=True)

for pid, st in valid_players[:10]:
    ppm = st['participations'] / max(1, st['mins'])
    print(f"{player_names.get(pid, pid)}: {ppm:.2f} participaciones/min ({st['participations']} en {st['mins']} min)")

