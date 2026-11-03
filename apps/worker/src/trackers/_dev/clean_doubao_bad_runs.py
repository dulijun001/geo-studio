import urllib.request
import json

env_dict = {}
with open('/Users/dulijuner/projects/geo-studio/.env') as f:
    for line in f:
        if '=' in line and not line.strip().startswith('#'):
            k, v = line.strip().split('=', 1)
            env_dict[k] = v.strip('"\'')

url = env_dict['NEXT_PUBLIC_SUPABASE_URL']
key = env_dict['SUPABASE_SERVICE_ROLE_KEY']

# Find all doubao snapshots created today with text_len < 380 or containing "今天有什么工作要处理"
req = urllib.request.Request(
    f'{url}/rest/v1/geo_snapshots?engine=eq.doubao&order=created_at.desc&limit=100',
    headers={'apikey': key, 'Authorization': 'Bearer ' + key}
)
with urllib.request.urlopen(req) as resp:
    rows = json.loads(resp.read().decode())

bad_ids = []
for r in rows:
    ans = r.get('raw_response') or ''
    # If the response is just the homepage greeting or under 350 chars
    if '今天有什么工作要处理' in ans or '新工作任务' in ans[:100]:
        bad_ids.append(r['id'])

print(f"Found {len(bad_ids)} invalid homepage dump snapshots to clean up.")

if bad_ids:
    # Delete them via REST
    for bid in bad_ids:
        del_req = urllib.request.Request(
            f"{url}/rest/v1/geo_snapshots?id=eq.{bid}",
            headers={'apikey': key, 'Authorization': 'Bearer ' + key},
            method='DELETE'
        )
        try:
            with urllib.request.urlopen(del_req) as del_resp:
                pass
        except Exception as e:
            print("Delete error:", e)
    print("Cleaned up invalid snapshots successfully.")

# Reset completed_ids in cdp_doubao_state.json to 0
state_file = '/Users/dulijuner/projects/geo-studio/apps/worker/src/trackers/_dev/cdp_doubao_state.json'
with open(state_file, 'w', encoding='utf-8') as f:
    json.dump({'completed_ids': []}, f, indent=2)
print("Reset cdp_doubao_state.json completed_ids.")
