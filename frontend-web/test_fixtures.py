import os
import json
from supabase import create_client

with open('.env.local', 'r') as f:
    lines = f.readlines()
    env = dict(line.strip().split('=') for line in lines if '=' in line)

supabase = create_client(env['NEXT_PUBLIC_SUPABASE_URL'], env['NEXT_PUBLIC_SUPABASE_ANON_KEY'])
data = supabase.table('fixtures').select('*').limit(1).execute()
print(data.data)
