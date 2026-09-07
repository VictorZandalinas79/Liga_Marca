import os
import json
import requests
from dotenv import load_dotenv

load_dotenv('frontend-web/.env.local')
load_dotenv('frontend-web/.env')

url = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_KEY")

headers = {
    "apikey": key,
    "Authorization": f"Bearer {key}",
    "Content-Type": "application/json"
}

swagger_res = requests.get(f"{url}/rest/v1/", headers=headers)
if swagger_res.status_code == 200:
    schema = swagger_res.json()
    paths = schema.get("paths", {})
    rpc_paths = [p for p in paths if p.startswith("/rpc/")]
    print(f"Found {len(rpc_paths)} RPC functions:")
    for r in rpc_paths:
        print("  -", r)

# Let's inspect storage.objects directly via Postgres or storage API
storage_res = requests.get(f"{url}/storage/v1/bucket", headers=headers)
print("\nStorage V1 Buckets API:")
print(storage_res.status_code, storage_res.text)

# Let's check if storage/v1/object/list or storage buckets have files
if storage_res.status_code == 200:
    buckets = storage_res.json()
    total_storage = 0
    for b in buckets:
        b_id = b.get("id")
        print(f"\nChecking objects in bucket '{b_id}'...")
        # list objects in bucket
        list_res = requests.post(
            f"{url}/storage/v1/object/list/{b_id}",
            headers=headers,
            json={"prefix": "", "limit": 1000, "offset": 0}
        )
        if list_res.status_code == 200:
            files = list_res.json()
            b_size = sum(f.get("metadata", {}).get("size", 0) for f in files if isinstance(f.get("metadata"), dict))
            print(f"Bucket '{b_id}' contains {len(files)} files, total size: {b_size / (1024*1024):.2f} MB")
            total_storage += b_size
        else:
            print(f"Failed to list objects in '{b_id}': {list_res.status_code} {list_res.text}")
    print(f"\nTOTAL Storage across all buckets: {total_storage / (1024*1024):.2f} MB")

# Now let's calculate estimated data size for each table in public schema
print("\n--- ESTIMATING DATA SIZES FOR TOP PUBLIC TABLES ---")

definitions = schema.get("definitions", {})
table_data_sizes = []

for table_name in sorted(definitions.keys()):
    # fetch first 100 rows to estimate avg size per row
    t_res = requests.get(f"{url}/rest/v1/{table_name}?limit=100", headers=headers)
    
    # get row count
    c_res = requests.get(
        f"{url}/rest/v1/{table_name}?select=count",
        headers={**headers, "Prefer": "count=exact", "Range": "0-0"}
    )
    count_header = c_res.headers.get("Content-Range", "")
    total_rows = 0
    if "/" in count_header:
        tr = count_header.split("/")[-1]
        total_rows = int(tr) if tr != "*" else 0

    if t_res.status_code == 200 and total_rows > 0:
        rows = t_res.json()
        if len(rows) > 0:
            sample_json = json.dumps(rows)
            avg_row_size = len(sample_json) / len(rows)
            est_total_bytes = avg_row_size * total_rows
            table_data_sizes.append((table_name, total_rows, avg_row_size, est_total_bytes))
        else:
            table_data_sizes.append((table_name, total_rows, 0, 0))

table_data_sizes.sort(key=lambda x: x[3], reverse=True)

print(f"{'Table Name':<30} | {'Row Count':<10} | {'Avg Row Size':<12} | {'Est. Data Size':<15}")
print("-" * 75)
for t_name, r_count, avg_sz, est_sz in table_data_sizes:
    size_str = f"{est_sz / (1024*1024):.2f} MB" if est_sz > 1024*1024 else f"{est_sz / 1024:.2f} KB"
    print(f"{t_name:<30} | {r_count:<10} | {avg_sz:<12.1f} | {size_str:<15}")

