import os
import requests

with open('.env.local') as f:
    env = dict(line.strip().split('=', 1) for line in f if '=' in line)

url = env.get('NEXT_PUBLIC_SUPABASE_URL')
key = env.get('NEXT_PUBLIC_SUPABASE_ANON_KEY')

headers = {
    'apikey': key,
    'Authorization': f'Bearer {key}',
    'Range': '0-5'
}

response = requests.get(f"{url}/rest/v1/fixtures?select=id,matchday,momento,status&order=id.desc", headers=headers)
print("Fixtures:", response.json())

response_scores = requests.get(f"{url}/rest/v1/player_scores?select=id,player_id,fixture_id,matchday,total_points&order=id.desc", headers=headers)
print("Scores:", response_scores.json())

