import sys, json
sys.path.append('frontend-web')
from trigger_descarga_eventos import MatchEventDownloader
dl = MatchEventDownloader('4pz87gsel7183b7kcadw1dwzv', '4pz87gsel7183b7kcadw1dwzv')
print(json.dumps(dl.scoring_rules.get('events', {}), indent=2))
print("--- BONUSES ---")
print(json.dumps(dl.scoring_rules.get('bonuses_per_X', {}), indent=2))
print("--- PENALTIES ---")
print(json.dumps(dl.scoring_rules.get('penalties_per_X', {}), indent=2))
