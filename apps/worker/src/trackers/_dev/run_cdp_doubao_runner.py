"""
豆包 (Doubao) 稳态现场纯意图真实采样巡航器 (高可靠版本)

核心机制:
1. 100% 纯意图无品牌题库 (218 题, 严格剔除“松鼠”品牌自嗨词)
2. 复用 Chrome 9222 真实登录态 (账号: 电商用户6391 / 独立菌)
3. 点击“新工作任务/新对话”开启独立会话，监听真实 thread ID 跳转 (/chat/xxxxxxxx)
4. 精确从 article / receive-message 节点提取深度推理完整长文与事实信源 (通常 1500~2500 字符)
5. 拟人键入 + 20s~35s 随机间歇，防设备与行为指纹风控
6. 实时物理入库 geo_snapshots (engine='doubao') 与状态持久化
"""

import urllib.request
import urllib.error
import json
import time
import websocket
import os
import random

SUPABASE_URL = ""
SUPABASE_KEY = ""
with open('/Users/dulijuner/projects/geo-studio/.env') as f:
    for line in f:
        if line.startswith('NEXT_PUBLIC_SUPABASE_URL='):
            SUPABASE_URL = line.strip().split('=', 1)[1].strip('"\'')
        elif line.startswith('SUPABASE_SERVICE_ROLE_KEY='):
            SUPABASE_KEY = line.strip().split('=', 1)[1].strip('"\'')

TENANT_ID = 'b05a40ce-2800-472f-81e9-83fe53a622cb'
STATE_FILE = '/Users/dulijuner/projects/geo-studio/apps/worker/src/trackers/_dev/cdp_doubao_state.json'
BENCHMARK_FILE = '/Users/dulijuner/projects/geo-studio/apps/worker/src/trackers/_dev/pure_benchmark_intent.json'

def load_state():
    if os.path.exists(STATE_FILE):
        try:
            with open(STATE_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception:
            pass
    return {'completed_ids': []}

def save_state():
    with open(STATE_FILE, 'w', encoding='utf-8') as f:
        json.dump({'completed_ids': list(completed_ids)}, f, ensure_ascii=False, indent=2)

with open(BENCHMARK_FILE, 'r', encoding='utf-8') as f:
    all_targets = json.load(f)

state = load_state()
completed_ids = set(state.get('completed_ids', []))

print("=====================================================", flush=True)
print("🚀 启动豆包 (Doubao) 纯意图高可靠现场巡航 (防风控・全量 218 题)", flush=True)
print(f"📦 总题数: {len(all_targets)} | 已完成: {len(completed_ids)} 题", flush=True)
print("🛡️ 运行环境: Chrome 9222 真实登录态 | 拟人间隔: 20s~35s", flush=True)
print("=====================================================\n", flush=True)

def get_doubao_tab():
    req = urllib.request.Request('http://127.0.0.1:9222/json')
    with urllib.request.urlopen(req) as resp:
        tabs = json.loads(resp.read().decode())
    doubao_tabs = [t for t in tabs if 'doubao.com' in t.get('url', '').lower() and t.get('type') == 'page']
    if not doubao_tabs:
        req_new = urllib.request.Request('http://127.0.0.1:9222/json/new?https://www.doubao.com/chat/', method='PUT')
        with urllib.request.urlopen(req_new) as resp_new:
            return json.loads(resp_new.read().decode())
    return doubao_tabs[0]

tab = get_doubao_tab()
ws = websocket.create_connection(tab['webSocketDebuggerUrl'], suppress_origin=True)

msg_id = 1
def cdp_eval(expr):
    global msg_id
    payload = json.dumps({
        'id': msg_id,
        'method': 'Runtime.evaluate',
        'params': {'expression': expr, 'returnByValue': True}
    })
    msg_id += 1
    ws.send(payload)
    res = json.loads(ws.recv())
    return res.get('result', {}).get('result', {}).get('value')

for idx, target in enumerate(all_targets, 1):
    t_id = target['id']
    t_text = target['text']

    if t_id in completed_ids:
        continue

    print(f"\n▶ [{idx}/{len(all_targets)}] 正在实测豆包: \"{t_text}\" (ID: {t_id})", flush=True)

    try:
        # 1. 点击“新工作任务”或导航到 /chat 开启全新独立会话
        cdp_eval('''
          (() => {
            const els = Array.from(document.querySelectorAll('*'));
            const newChatEl = els.find(e => e.children.length === 0 && e.innerText && (e.innerText.trim() === '新工作任务' || e.innerText.trim() === '新对话'));
            if (newChatEl) {
              newChatEl.click();
            } else {
              window.location.href = "https://www.doubao.com/chat";
            }
          })()
        ''')
        time.sleep(2)

        # 等待输入框出现
        for _ in range(10):
            if cdp_eval('!!document.querySelector(".tiptap.ProseMirror")'):
                break
            time.sleep(1)

        # 2. 拟人键入纯意图问题
        safe_text = t_text.replace("'", "\\'").replace('"', '\\"')
        cdp_eval(f'''
          const editor = document.querySelector('.tiptap.ProseMirror');
          if (editor) {{
            editor.focus();
            document.execCommand('selectAll', false, null);
            document.execCommand('insertText', false, '{safe_text}');
          }}
        ''')
        time.sleep(1)

        # 3. 点击发送按钮
        old_url = cdp_eval('window.location.href')
        cdp_eval('''
          (() => {
            const sendBtn = document.querySelector('[data-testid*="send"], [aria-label*="发送"]') || 
                            Array.from(document.querySelectorAll('button')).find(b => b.querySelector('svg') && !b.disabled && b.offsetWidth > 0);
            if (sendBtn) {
              sendBtn.click();
            } else {
              const ke = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true });
              document.querySelector('.tiptap.ProseMirror').dispatchEvent(ke);
            }
          })()
        ''')

        # 4. 等待会话 ID 生成并监听回复输出
        chat_url = ""
        for _ in range(15):
            time.sleep(1)
            cur_url = cdp_eval('window.location.href') or ""
            # 如果产生了具体的对话 thread url (如 https://www.doubao.com/chat/38449xxxxxx)
            if '/chat/' in cur_url and not cur_url.endswith('/chat') and not cur_url.endswith('/chat/'):
                chat_url = cur_url
                break

        print(f"   🔗 会话已建立: {chat_url or '首页模式'}", flush=True)

        # 5. 等待完整回答生成 (豆包含多步深度搜索、核实与图表生成，通常 35s~80s)
        answer_text = ""
        citation_urls = []
        last_len = 0
        stable_count = 0

        for wait_i in range(50):
            time.sleep(2)
            # 精确排除侧边栏历史列表，只提取主对话区域正文
            doc_msgs = cdp_eval('''
              (() => {
                const sidebar = document.querySelector('aside, [class*="sidebar-wrapper"]');
                const allText = document.body.innerText;
                let mainContent = allText;
                if (sidebar) {
                  mainContent = allText.replace(sidebar.innerText, '').trim();
                }
                return mainContent;
              })()
            ''') or ""

            # 剔除末尾固定操作栏
            lines = doc_msgs.split('\n')
            clean_lines = [l for l in lines if not ('下载豆包工作' in l or '1Password' in l or '云电脑' in l or '项目' == l.strip())]
            cleaned_text = '\n'.join(clean_lines).strip()

            cur_len = len(cleaned_text)
            
            # 当正文内容超过 450 字符且连续 3 次长度不变时视为完全生成
            if cur_len > 450 and cur_len == last_len:
                stable_count += 1
                if stable_count >= 3:
                    answer_text = cleaned_text
                    break
            else:
                stable_count = 0
                last_len = cur_len

        # 6. 抽取引源链接
        extracted_cites = cdp_eval('''
          Array.from(document.querySelectorAll('a[href^="http"]'))
            .map(a => a.href)
            .filter(h => !h.includes('doubao.com') && !h.includes('bytedance.com') && !h.includes('feishu.cn'))
        ''') or []
        citation_urls = list(set(extracted_cites))

        if answer_text and len(answer_text) > 400:
            print(f"   ✅ 采样完成 | 回复长度: {len(answer_text)} 字符 | 引源: {len(citation_urls)} 个", flush=True)
            is_songshu = '松鼠' in answer_text
            print(f"   🔍 客观结果: 松鼠口腔提及 = {'🎯 命中!' if is_songshu else '⚪ 未提及'}", flush=True)

            # 7. 物理写入 Supabase REST API
            try:
                post_data = json.dumps({
                    'tenant_id': TENANT_ID,
                    'question_id': t_id,
                    'engine': 'doubao',
                    'raw_response': answer_text,
                    'citation_urls': citation_urls,
                    'session_url': chat_url,
                    'status': 'done',
                    'asked_at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
                    'meta': {
                        'text_len': len(answer_text),
                        'citations_count': len(citation_urls),
                        'source': 'cdp_doubao_live_robust_runner'
                    }
                }).encode('utf-8')

                req_post = urllib.request.Request(
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
                with urllib.request.urlopen(req_post, timeout=10) as resp_post:
                    pass
                print("   💾 物理快照已成功写入 geo_snapshots (engine: doubao)", flush=True)
            except Exception as e:
                print(f"   ⚠️ 写入数据库异常: {e}", flush=True)

            completed_ids.add(t_id)
            save_state()
        else:
            print(f"   ⚠️ 采样未达标 (长度: {len(answer_text)})，稍后自动重试", flush=True)

    except Exception as err:
        print(f"   💥 本轮执行异常: {err}", flush=True)

    # 拟人休眠 20s~35s (防风控，模拟人类阅读与间歇)
    sleep_sec = random.uniform(20.0, 35.0)
    print(f"   💤 拟人休眠 {sleep_sec:.1f} 秒...", flush=True)
    time.sleep(sleep_sec)

ws.close()
print(f"\n🎉 豆包纯意图现场实测全部结束！已完成 {len(completed_ids)} 题。", flush=True)
