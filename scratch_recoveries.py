import json

ciss_id = None
with open("/Users/imac/Programas/LFM Vilafranca/data/LaLiga/2025/2026/squads/Rayo Vallecano de Madrid_3budh3j9xivsid3ptm8ptpy4k.json") as f:
    squad = json.load(f)
    for p in squad.get("squad", []):
        if p.get("matchName") == "P. Ciss":
            ciss_id = p.get("id")
            
koski_id = None
with open("/Users/imac/Programas/LFM Vilafranca/data/LaLiga/2025/2026/squads/Deportivo Alavés_4dtdjgnpdq9uw4sdutti0vaar.json") as f:
    squad = json.load(f)
    for p in squad.get("squad", []):
        if p.get("matchName") == "V. Koski":
            koski_id = p.get("id")

print(f"Ciss ID: {ciss_id}")
print(f"Koski ID: {koski_id}")

file_path = "./frontend-web/data/Partidos_Individuales/759wkks5e6lybl2205pedxgd0/events/759wkks5e6lybl2205pedxgd0.json"
with open(file_path, "r") as f:
    match = json.load(f)

ciss_stats = {"recovery": 0, "interception": 0, "tackle_won": 0, "tackle_all": 0, "ball_touch": 0}
koski_stats = {"recovery": 0, "interception": 0, "tackle_won": 0, "tackle_all": 0, "ball_touch": 0}

for ev in match.get("liveData", {}).get("event", []):
    pid = ev.get("playerId")
    type_id = ev.get("typeId")
    outcome = ev.get("outcome")
    
    if pid == ciss_id:
        target = ciss_stats
    elif pid == koski_id:
        target = koski_stats
    else:
        continue
        
    if type_id == 49:
        target["recovery"] += 1
    elif type_id == 8:
        target["interception"] += 1
    elif type_id == 7:
        target["tackle_all"] += 1
        if outcome == 1:
            target["tackle_won"] += 1
    elif type_id == 61:
        target["ball_touch"] += 1

print(f"P. Ciss: Recoveries={ciss_stats['recovery']}, Interceptions={ciss_stats['interception']}, Tackles={ciss_stats['tackle_won']}/{ciss_stats['tackle_all']}")
print(f"V. Koski: Recoveries={koski_stats['recovery']}, Interceptions={koski_stats['interception']}, Tackles={koski_stats['tackle_won']}/{koski_stats['tackle_all']}")
