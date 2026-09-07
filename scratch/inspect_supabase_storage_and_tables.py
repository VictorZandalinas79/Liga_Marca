import os
import requests
from dotenv import load_dotenv
from supabase import create_client

load_dotenv('frontend-web/.env.local')
load_dotenv('frontend-web/.env')

url = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_KEY")

print("Connecting to Supabase at:", url)
client = create_client(url, key)

headers = {
    "apikey": key,
    "Authorization": f"Bearer {key}",
    "Content-Type": "application/json",
    "Prefer": "count=exact"
}

# 1. Storage Buckets and Objects size check
print("\n--- STORAGE BUCKETS ---")
try:
    buckets = client.storage.list_buckets()
    print(f"Found {len(buckets)} buckets:")
    for b in buckets:
        print(f" - Bucket ID: {b.id}, Name: {b.name}, Public: {b.public}")
except Exception as e:
    print("Error listing buckets:", e)

print("\n--- STORAGE OBJECTS (file sizes) ---")
try:
    # Query storage.objects via REST using service_role key
    res = requests.get(
        f"{url}/rest/v1/objects?select=bucket_id,name,metadata",
        headers=headers
    )
    if res.status_code == 200:
        objects = res.json()
        print(f"Total objects in storage: {len(objects)}")
        bucket_sizes = {}
        total_storage_bytes = 0
        for obj in objects:
            b_id = obj.get('bucket_id', 'unknown')
            meta = obj.get('metadata') or {}
            size = meta.get('size', 0) if isinstance(meta, dict) else 0
            bucket_sizes[b_id] = bucket_sizes.get(b_id, 0) + size
            total_storage_bytes += size
        
        print(f"Total Storage Size: {total_storage_bytes / (1024*1024):.2f} MB ({total_storage_bytes / (1024*1024*1024):.3f} GB)")
        for b_id, b_size in bucket_sizes.items():
            print(f"  Bucket '{b_id}': {b_size / (1024*1024):.2f} MB ({b_size} bytes)")
    else:
        print(f"Could not fetch storage objects: {res.status_code} {res.text}")
except Exception as e:
    print("Error checking storage objects:", e)

# 2. Check public tables and row counts
print("\n--- DATABASE TABLES AND ROW COUNTS ---")

# Let's get OpenAPI schema from REST endpoint to list all tables
try:
    swagger_res = requests.get(f"{url}/rest/v1/", headers=headers)
    if swagger_res.status_code == 200:
        schema = swagger_res.json()
        definitions = schema.get("definitions", {})
        print(f"Found {len(definitions)} tables in API schema:\n")
        
        table_stats = []
        for table_name in sorted(definitions.keys()):
            # Count rows
            c_res = requests.get(
                f"{url}/rest/v1/{table_name}?select=count",
                headers={**headers, "Range": "0-0"}
            )
            count_header = c_res.headers.get("Content-Range", "")
            total_rows = 0
            if "/" in count_header:
                total_rows = count_header.split("/")[-1]
                if total_rows != "*":
                    total_rows = int(total_rows)
                else:
                    total_rows = "Unknown"
            
            table_stats.append((table_name, total_rows))
        
        # Sort by total_rows if int
        table_stats.sort(key=lambda x: x[1] if isinstance(x[1], int) else -1, reverse=True)
        
        print(f"{'Table Name':<35} | {'Row Count':<15}")
        print("-" * 55)
        for t_name, r_count in table_stats:
            print(f"{t_name:<35} | {r_count:<15}")

except Exception as e:
    print("Error fetching tables:", e)
