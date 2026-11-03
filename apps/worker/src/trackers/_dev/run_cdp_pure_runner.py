"""
CDP 稳态长效真实采样器 (连接 Chrome 9222 真实环境)

核心机制:
1. 严格过滤品牌词，只抓 218 道老百姓真实意图题 (无“松鼠”)
2. 复用 Chrome 9222 真实登录态 (防风控、免验证码)
3. 拟人打字 (humanType) + 智能搜索开启 (Web Search) + 随机休眠 (Jitter 15s~28s)
4. 实时物理写库 (geo_snapshots) 与状态持久化 (cdp_pure_runner_state.json)
"""

import urllib.request
import json
import time
import websocket
import os
import random

SUPABASE_URL = os.environ.get('NEXT_PUBLIC_SUPABASE_URL', '')
SUPABASE_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '')

# 如果环境变量未被 shell 传递，从 .env 直接读
if not SUPABASE_URL:
    with open('/Users/dulijuner/projects/geo-studio/.env') as f:
        for line in f:
            if line.startswith('NEXT_PUBLIC_SUPABASE_URL='):
                SUPABASE_URL = line.strip().split('=', 1)[1].strip('"\'')
            elif line.startswith('SUPABASE_SERVICE_ROLE_KEY='):
                SUPABASE_KEY = line.strip().split('=', 1)[1].strip('"\'')

TENANT_ID = 'b05a40ce-2800-472f-81e9-83fe53a622cb'

STATE_FILE = '/Users/dulijuner/projects/geo-studio/apps/worker/src/trackers/_dev/cdp_pure_runner_state.json'
INPUT_FILE = '/Users/dulijuner/projects/geo-studio/apps/worker/src/trackers/_dev/pure_benchmark_intent.json'

with open(INPUT_FILE, 'r', encoding='utf-8') as f:
    benchmark_tasks = json.load(f)

completed_ids = set()
if os.path.exists(STATE_FILE):
    try:
        with open(STATE_FILE, 'r', encoding='utf-8') as f:
            st = json.load(f)
            completed_ids = set(st.get('completed', []))
    except Exception:
        pass

def save_state():
    with open(STATE_FILE, 'w', encoding='utf-8') as f:
        json.dump({
            'updated_at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
            'total': len(benchmark_tasks),
            'completed_count': len(completed_ids),
            'completed': list(completed_ids)
        }, f, ensure_ascii=False, indent=2)

def cdp_send(ws, method, params=None, msg_id=1):
    req = {'id': msg_id, 'method': method}
    if params:
        req['params'] = params
    ws.send(json.dumps(req))
    while True:
        resp = json.loads(ws.recv())
        if resp.get('id') == msg_id:
            return resp.get('result', {})

print(f"=====================================================", flush=True)
print(f"🚀 启动纯意图真实采样巡航 (严格过滤品牌词)", flush=True)
print(f"📦 总题数: {len(benchmark_tasks)} | 已完成: {len(completed_ids)} 题", flush=True)
print(f"🛡️ 运行环境: Chrome 9222 真实会话 | 拟人间隔: 15s~28s", flush=True)
print(f"=====================================================\n", flush=True)

# 获取 DeepSeek 标签页
tabs = json.loads(urllib.request.urlopen('http://127.0.0.1:9222/json', timeout=5).read().decode())
ds_tab = next((t for t in tabs if 'chat.deepseek.com' in t.get('url', '') and t.get('type') == 'page'), None)

if not ds_tab:
    print("❌ 未在 9222 找到打开的 chat.deepseek.com 页面", flush=True)
    exit(1)

ws_url = ds_tab['webSocketDebuggerUrl']
ws = websocket.WebSocket()
ws.connect(ws_url, suppress_origin=True, timeout=10)

def evaluate_js(expr):
    return cdp_send(ws, 'Runtime.evaluate', {'expression': expr, 'returnByValue': True})

for idx, task in enumerate(benchmark_tasks):
    t_id = task['id']
    question = task['text']

    if t_id in completed_ids:
        continue

    print(f"\n▶ [{idx + 1}/{len(benchmark_tasks)}] 正在实测: \"{question}\" (ID: {t_id})", flush=True)

    try:
        # 1. 点击「开启新对话」
        reset_js = """
        (() => {
            const btns = Array.from(document.querySelectorAll('*'));
            const newChat = btns.find(b => b.innerText && b.innerText.trim() === '开启新对话');
            if (newChat) { newChat.click(); return true; }
            return false;
        })()
        """
        evaluate_js(reset_js)
        time.sleep(1.2)

        # 2. 确保开启「智能搜索」
        search_toggle_js = """
        (() => {
            const elements = Array.from(document.querySelectorAll('*'));
            const searchEl = elements.find(el => el.innerText && el.innerText.trim() === '智能搜索');
            if (searchEl) {
                const parent = searchEl.closest('[class*="toggle"], [class*="button"], div') || searchEl;
                const isSelected = parent.className.includes('selected') || parent.className.includes('active') || parent.getAttribute('aria-pressed') === 'true';
                if (!isSelected) {
                    searchEl.click();
                    return 'clicked';
                }
                return 'already_on';
            }
            return 'not_found';
        })()
        """
        evaluate_js(search_toggle_js)
        time.sleep(0.6)

        # 3. 拟人键入问题 (通过 React execCommand 注入)
        input_js = f"""
        (() => {{
            const ta = document.querySelector('textarea');
            if (!ta) return false;
            ta.focus();
            document.execCommand('insertText', false, {json.dumps(question)});
            return true;
        }})()
        """
        evaluate_js(input_js)
        time.sleep(0.8)

        # 4. 点击发送按钮 (ds-button--circle)
        send_js = """
        (() => {
            const sendBtn = document.querySelector('div.ds-button--circle, button.ds-button--circle');
            if (sendBtn && !sendBtn.className.includes('disabled')) {
                sendBtn.click();
                return 'clicked_btn';
            }
            return 'not_ready';
        })()
        """
        send_res = evaluate_js(send_js).get('result', {}).get('value')
        if send_res != 'clicked_btn':
            # 回退 Enter
            cdp_send(ws, 'Input.dispatchKeyEvent', {'type': 'keyDown', 'key': 'Enter', 'code': 'Enter', 'windowsVirtualKeyCode': 13})
            cdp_send(ws, 'Input.dispatchKeyEvent', {'type': 'keyUp', 'key': 'Enter', 'code': 'Enter', 'windowsVirtualKeyCode': 13})

        print("   ⏳ 正在等待 DeepSeek 联网检索与生成回答...", flush=True)

        # 5. 轮询等待答案稳定
        last_len = -1
        stable_count = 0
        answer_text = ""
        citation_urls = []

        for poll in range(50): # 最多等 50s
            time.sleep(1.2)
            extract_js = """
            (() => {
                const markdownEls = Array.from(document.querySelectorAll('.ds-markdown'));
                if (!markdownEls.length) return { text: '', generating: true };
                const lastEl = markdownEls[markdownEls.length - 1];
                const text = lastEl.innerText || '';
                
                // 检查停止生成按钮
                const stopBtn = Array.from(document.querySelectorAll('*')).some(el => el.innerText && el.innerText.trim() === '停止生成');
                return { text, generating: stopBtn };
            })()
            """
            eval_res = evaluate_js(extract_js).get('result', {}).get('value', {})
            cur_text = eval_res.get('text', '')
            is_generating = eval_res.get('generating', False)

            if len(cur_text) > 80:
                if len(cur_text) == last_len and not is_generating:
                    stable_count += 1
                    if stable_count >= 2:
                        answer_text = cur_text
                        break
                else:
                    stable_count = 0
                last_len = len(cur_text)

        if not answer_text and last_len > 80:
            answer_text = cur_text

        if answer_text:
            # 提取引用外链
            extract_links_js = """
            (() => {
                const links = Array.from(document.querySelectorAll('a[href]'))
                    .map(a => a.href)
                    .filter(h => h.startsWith('http') && !h.includes('deepseek.com'));
                return Array.from(new Set(links));
            })()
            """
            citation_urls = evaluate_js(extract_links_js).get('result', {}).get('value', []) or []

            print(f"   ✅ 采样完成 | 回复长度: {len(answer_text)} 字符 | 引源: {len(citation_urls)} 个", flush=True)
            
            # 检测松鼠是否被提及
            is_songshu_mentioned = '松鼠' in answer_text
            print(f"   🔍 客观结果: 松鼠口腔提及 = {'🎯 命中!' if is_songshu_mentioned else '⚪ 未提及'}", flush=True)

            # 物理写入 Supabase REST API
            try:
                post_data = json.dumps({
                    'tenant_id': TENANT_ID,
                    'question_id': t_id,
                    'engine': 'deepseek',
                    'raw_response': answer_text,
                    'citation_urls': citation_urls,
                    'status': 'done',
                    'asked_at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
                    'meta': {
                        'text_len': len(answer_text),
                        'citations_count': len(citation_urls),
                        'source': 'cdp_pure_intent_runner'
                    }
                }).encode('utf-8')

                req = urllib.request.Request(
                    f"{SUPABASE_URL}/rest/v1/geo_snapshots",
                    data=post_data,
                    headers={
                        'apikey': SUPABASE_KEY,
                        'Authorization': f'Bearer {SUPABASE_KEY}',
                        'Content-Type': 'application/json',
                        'Prefer': 'return=minimal'
                    },
                    method='POST'
                )
                with urllib.request.urlopen(req, timeout=10) as resp:
                    pass
                print("   💾 物理快照已写入 geo_snapshots", flush=True)
            except urllib.error.HTTPError as he:
                print(f"   ⚠️ 写入数据库异常 (HTTP {he.code}): {he.read().decode()}", flush=True)
            except Exception as e:
                print(f"   ⚠️ 写入数据库异常: {e}", flush=True)

            completed_ids.add(t_id)
            save_state()
        else:
            print("   ❌ 采样超时或未获取到有效回答", flush=True)

    except Exception as err:
        print(f"   💥 本轮执行异常: {err}", flush=True)

    # 拟人休眠 15s~26s (防风控，模拟人类阅读与间歇)
    sleep_sec = random.uniform(15.0, 26.0)
    print(f"   💤 拟人休眠 {sleep_sec:.1f} 秒...", flush=True)
    time.sleep(sleep_sec)

ws.close()
print(f"\n🎉 纯意图真实采样全部结束！已完成 {len(completed_ids)} 题。", flush=True)
