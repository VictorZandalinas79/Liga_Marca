import json
import glob

files = glob.glob('data/Partidos_Individuales/*/events/*.json')
if files:
    with open(files[0], 'r', encoding='utf-8') as f:
        data = json.load(f)
        events = data.get('liveData', {}).get('event', [])
        for e in events:
            if e.get('eventId') == 90:
                print("Found eventId 90:", json.dumps(e, indent=2))
                break
