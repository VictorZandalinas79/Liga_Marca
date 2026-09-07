import os
import json

squads_dir = "frontend-web/data/Partidos_Individuales/7aptq9m7p1p3ezgnl011sdafo/squads"
for f in os.listdir(squads_dir):
    if f.endswith(".json"):
        filepath = os.path.join(squads_dir, f)
        with open(filepath, "r", encoding="utf-8") as file:
            data = json.load(file)
            print(f"\n==========================================")
            print(f"FILE: {f}")
            print(f"==========================================")
            players = data.get("players", [])
            for p in players:
                p_id = p.get("id") or p.get("personId") or p.get("matchId")
                name = p.get("matchName") or p.get("knownName") or p.get("shortName") or (p.get("firstName", "") + " " + p.get("lastName", ""))
                shirt = p.get("shirtNumber")
                if "6vv" in str(p_id) or "Gudelj" in str(name) or "Uche" in str(name):
                    print(f"--> TARGET MATCH: ID={p_id} | Name={name} | shirt={shirt}")
                    print(json.dumps(p, indent=2))
                else:
                    print(f"  ID={p_id} | Name={name} | shirt={shirt}")

