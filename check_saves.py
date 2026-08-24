import json
import glob

files = glob.glob('data/Partidos_Individuales/*/events/*.json')
if files:
    with open(files[0], 'r', encoding='utf-8') as f:
        data = json.load(f)
        events = data.get('liveData', {}).get('event', [])
        for e in events:
            if e.get('typeId') == 10:
                print("Save Event ID:", e.get('id'))
                print("Qualifiers:")
                for q in e.get('qualifier', []):
                    if q.get('qualifierId') == 233:
                        print("  -> FOUND 233! Value:", q.get('value'))
                break
