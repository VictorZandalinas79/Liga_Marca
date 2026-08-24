import os
from supabase import create_client

url = "https://hjzdbnjdgludsaqbcrfl.supabase.co"
key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhqemRibmpkZ2x1ZHNhcWJjcmZsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTM2NDY5MywiZXhwIjoyMDk0OTQwNjkzfQ.8UuR2bcw8KCPmRopHCnkE2NIh7MDjSdSWB7adFC4TX8"

supabase = create_client(url, key)

def fill_missing_players():
    # Obtener todas las plantillas de la jornada 3 (actual)
    res = supabase.table('team_players').select('team_id, player_id, order').eq('matchday', 3).eq('is_starter', True).execute()
    
    teams = {}
    for row in res.data:
        tid = row['team_id']
        if tid not in teams:
            teams[tid] = []
        teams[tid].append(row)
        
    all_teams = supabase.table('user_teams').select('id, name').execute()
    
    # Todos los jugadores posibles
    players_res = supabase.table('players').select('id').execute()
    all_player_ids = [p['id'] for p in players_res.data]
    
    import random
    total_added = 0
    
    for team in all_teams.data:
        tid = team['id']
        team_players = teams.get(tid, [])
        if len(team_players) < 11:
            print(f"Equipo {team['name']} tiene {len(team_players)} jugadores. Rellenando hasta 11...")
            
            existing_pids = {p['player_id'] for p in team_players}
            available_pids = [p for p in all_player_ids if p not in existing_pids]
            random.shuffle(available_pids)
            
            needed = 11 - len(team_players)
            used_orders = {p['order'] for p in team_players if p['order'] is not None}
            
            next_order = 0
            for _ in range(needed):
                while next_order in used_orders:
                    next_order += 1
                
                new_pid = available_pids.pop()
                
                # Insertar
                supabase.table('team_players').insert({
                    'team_id': tid,
                    'player_id': new_pid,
                    'is_starter': True,
                    'is_captain': next_order == 0,
                    'order': next_order,
                    'matchday': 3
                }).execute()
                
                print(f"  -> Añadido jugador {new_pid} en orden {next_order}")
                used_orders.add(next_order)
                total_added += 1
                
    print(f"Fin. Añadidos {total_added} jugadores en total.")

if __name__ == '__main__':
    fill_missing_players()
