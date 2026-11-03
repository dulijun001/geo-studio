import json

with open('/Users/dulijuner/projects/geo-studio/apps/worker/src/trackers/_dev/benchmark_224.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

# 过滤掉任何包含“松鼠”的词（完全模拟普通老百姓在不知晓松鼠的前提下的客观泛需求提问）
pure_queries = [x for x in data if '松鼠' not in x['text']]

print(f"原题库: {len(data)} 题")
print(f"过滤后纯意图题库 (无品牌词): {len(pure_queries)} 题")

out_path = '/Users/dulijuner/projects/geo-studio/apps/worker/src/trackers/_dev/pure_benchmark_intent.json'
with open(out_path, 'w', encoding='utf-8') as f:
    json.dump(pure_queries, f, ensure_ascii=False, indent=2)

print(f"已生成: {out_path}")
