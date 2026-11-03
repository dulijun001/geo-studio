import urllib.request
import json
import time
import websocket

# Connect to Doubao Tab
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

test_q = "昆明种植牙技术实力强的三个医院"

print("1. Typing query...")
cdp_eval(f'''
  const editor = document.querySelector('.tiptap.ProseMirror');
  editor.focus();
  document.execCommand('selectAll', false, null);
  document.execCommand('insertText', false, '{test_q}');
''')
time.sleep(1)

print("2. Clicking send button...")
cdp_eval('''
  const sendBtn = document.querySelector('[data-testid*="send"], [aria-label*="发送"]') || 
                  Array.from(document.querySelectorAll('button')).find(b => b.querySelector('svg') && !b.disabled && b.offsetWidth > 0);
  if (sendBtn) sendBtn.click();
''')

print("3. Waiting for URL to change to conversation thread (/chat/xxxxxxxx)...")
chat_url = ""
for _ in range(20):
    time.sleep(1)
    cur_url = cdp_eval('window.location.href')
    if '/chat/' in cur_url and not cur_url.endswith('/chat/') and not 'from_login' in cur_url:
        chat_url = cur_url
        break

print("Detected conversation URL:", chat_url)

if chat_url:
    print("4. Waiting for answer completion in conversation thread...")
    last_len = 0
    stable_count = 0
    full_answer = ""
    for wait_i in range(45):
        time.sleep(2)
        # Extract messages inside the conversation container
        text = cdp_eval('''
          (() => {
            // Find all message containers or main article text
            const msgs = Array.from(document.querySelectorAll('article, [data-testid*="receive"], [class*="receive"], [class*="message-content"]'));
            if (msgs.length > 0) {
              return msgs.map(m => m.innerText).join('\\n---MSG---\\n');
            }
            return document.body.innerText;
          })()
        ''') or ""
        
        cur_len = len(text)
        print(f"   [{wait_i*2}s] Text length: {cur_len} chars...")
        
        # Check if output is finished
        if cur_len > 400 and cur_len == last_len:
            stable_count += 1
            if stable_count >= 3:
                full_answer = text
                break
        else:
            stable_count = 0
            last_len = cur_len
            
    print("\n✅ Generation finished!")
    print(f"Answer snippet:\n{full_answer[:300]}...\n---\n{full_answer[-300:]}")
    
ws.close()
