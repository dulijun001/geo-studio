import urllib.request
import json
import time
import websocket

env_dict = {}
with open('/Users/dulijuner/projects/geo-studio/.env') as f:
    for line in f:
        if '=' in line and not line.strip().startswith('#'):
            k, v = line.strip().split('=', 1)
            env_dict[k] = v.strip('"\'')

url = env_dict['NEXT_PUBLIC_SUPABASE_URL']
key = env_dict['SUPABASE_SERVICE_ROLE_KEY']

req = urllib.request.Request('http://127.0.0.1:9222/json')
with urllib.request.urlopen(req) as resp:
    tabs = json.loads(resp.read().decode())
target = [t for t in tabs if 'doubao' in t.get('url', '').lower() and t.get('type') == 'page'][0]
ws = websocket.create_connection(target['webSocketDebuggerUrl'], suppress_origin=True)

msg_id = 1
def cdp_eval(expr):
    global msg_id
    payload = json.dumps({'id': msg_id, 'method': 'Runtime.evaluate', 'params': {'expression': expr, 'returnByValue': True}})
    msg_id += 1
    ws.send(payload)
    res = json.loads(ws.recv())
    return res.get('result', {}).get('result', {}).get('value')

# Inspect all items in sidebar
items = cdp_eval('''
  (() => {
    const list = Array.from(document.querySelectorAll('*'))
      .filter(e => e.children.length === 0 && e.innerText && e.innerText.length > 3)
      .map(e => e.innerText.trim());
    return Array.from(new Set(list));
  })()
''')
print("Distinct text tokens in page:")
for item in items:
    if '昆明' in item or '牙' in item:
        print(" -", item)

ws.close()
