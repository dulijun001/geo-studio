import urllib.request

env_dict = {}
with open('/Users/dulijuner/projects/geo-studio/.env') as f:
    for line in f:
        if '=' in line and not line.strip().startswith('#'):
            k, v = line.strip().split('=', 1)
            env_dict[k] = v.strip('"\'')

url = env_dict['NEXT_PUBLIC_SUPABASE_URL']
key = env_dict['SUPABASE_SERVICE_ROLE_KEY']

bid = 'd905287a-b0de-4652-b731-50d6a31f68bf'
del_req = urllib.request.Request(
    f"{url}/rest/v1/geo_snapshots?id=eq.{bid}",
    headers={'apikey': key, 'Authorization': 'Bearer ' + key},
    method='DELETE'
)
urllib.request.urlopen(del_req)
print("Deleted single snapshot.")
