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
TENANT_ID = 'b05a40ce-2800-472f-81e9-83fe53a622cb'

# Connect to Doubao tab
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

# 1. Fetch benchmark questions
with open('/Users/dulijuner/projects/geo-studio/apps/worker/src/trackers/_dev/pure_benchmark_intent.json') as f:
    pure_qs = json.load(f)

# 2. Get recent conversations list from sidebar
recent_items = cdp_eval('''
  (() => {
    // Find items in recent list
    const items = Array.from(document.querySelectorAll('*'))
      .filter(e => e.children.length === 0 && e.innerText && e.innerText.length > 4)
      .map(e => e.innerText.trim());
    return Array.from(new Set(items));
  })()
''')

print("Recent items detected in Doubao:", len(recent_items))

matched_count = 0
for title in recent_items:
    # Match with pure_qs
    matched_q = None
    for q in pure_qs:
        # Check if text starts with or contains
        q_text = q['text'].strip()
        if title in q_text or q_text in title or (len(title) > 6 and title[:6] in q_text):
            matched_q = q
            break
            
    if not matched_q:
        continue

    print(f"\nHarvesting: '{title}' -> Matched Q: '{matched_q['text']}' (ID: {matched_q['id']})")
    
    # Click on the conversation title
    safe_title = title.replace("'", "\\'")
    cdp_eval(f'''
      (() => {{
        const el = Array.from(document.querySelectorAll('*')).find(e => e.children.length === 0 && e.innerText && e.innerText.trim() === '{safe_title}');
        if (el) el.click();
      }})()
    ''')
    time.sleep(3)
    
    chat_url = cdp_eval('window.location.href')
    doc_text = cdp_eval('''
      (() => {
        const sidebar = document.querySelector('aside, [class*="sidebar-wrapper"]');
        const allText = document.body.innerText;
        if (sidebar) return allText.replace(sidebar.innerText, '').trim();
        return allText;
      })()
    ''') or ""

    if len(doc_text) > 400:
        is_songshu = '松鼠' in doc_text
        print(f"   ✅ 成功提取 ({len(doc_text)} 字符) | 松鼠提及: {'🎯 命中!' if is_songshu else '⚪ 未提及'}")
        
        # Write to Supabase
        post_data = json.dumps({
            'tenant_id': TENANT_ID,
            'question_id': matched_q['id'],
            'engine': 'doubao',
            'raw_response': doc_text,
            'session_url': chat_url,
            'status': 'done',
            'asked_at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
            'meta': {
                'text_len': len(doc_text),
                'source': 'doubao_live_harvest'
            }
        }).encode('utf-8')

        req_post = urllib.request.Request(
            f"{url}/rest/v1/geo_snapshots",
            data=post_data,
            headers={
                'apikey': key,
                'Authorization': f'Bearer {key}',
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal'
            },
            method='POST'
        )
        try:
            with urllib.request.urlopen(req_post) as resp_post:
                pass
            print("   💾 物理快照已写入 geo_snapshots")
            matched_count += 1
        except Exception as e:
            print("   ⚠️ 写入失败:", e)

ws.close()
print(f"\n🎉 现场新鲜批次抓取入库完成！成功抓取: {matched_count} 题。")
