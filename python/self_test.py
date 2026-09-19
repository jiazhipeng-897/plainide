# -*- coding: utf-8 -*-
"""真实 API 端到端自测：单 HTML 计算器 → 观察全链路事件 + 产物 + 报告，找 BUG"""
import asyncio
import json
import os
import shutil
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from orchestrator.engine import PipelineEngine

WORK = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'generated', 'self_test')


async def main():
    shutil.rmtree(WORK, ignore_errors=True)
    os.makedirs(WORK, exist_ok=True)
    print('目标目录:', WORK)
    print('需求: 帮我写一个单HTML的计算器\n' + '=' * 60)

    engine = PipelineEngine()
    t0 = time.time()
    events = []
    key = ('pipeline_started', 'stage_started', 'stage_completed', 'artifacts_written',
           'pipeline_completed', 'pipeline_failed', 'error', 'review_result',
           'file_created', 'file_written', 'tool_exec_started', 'tool_exec_completed')
    async for evt in engine.run('帮我写一个单HTML的计算器', project_path=WORK,
                                scale='slim', mode='full'):
        # engine 直接 yield SSE 文本（event: xxx\ndata: {...}\n\n）
        if isinstance(evt, str) and evt.startswith('event: '):
            etype = ''
            data = {}
            for line in evt.splitlines():
                if line.startswith('event:'):
                    etype = line[6:].strip()
                elif line.startswith('data:'):
                    try:
                        data = json.loads(line[5:].strip())
                    except Exception:
                        pass
            events.append({'event': etype, 'data': data})
            if etype in key:
                line = json.dumps(data, ensure_ascii=False)
                print(f"[{etype}] {line[:260]}")
        else:
            events.append(evt)
    cost = time.time() - t0
    print('=' * 60)
    print(f'总耗时: {cost:.1f}s  事件总数: {len(events)}')

    # 事件类型统计
    from collections import Counter
    types = Counter(e.get('event') for e in events if isinstance(e, dict))
    print('事件分布:', dict(types))    # 检查产物
    real = []
    for root, dirs, fnames in os.walk(WORK):
        dirs[:] = [d for d in dirs if d not in ('.mycode', '.memory', '__pycache__',
                                                '.code_rag', '.pytest_cache', 'node_modules', '.git')]
        for fn in fnames:
            p = os.path.join(root, fn)
            real.append((os.path.relpath(p, WORK), os.path.getsize(p)))
    print('\n产物清单:', real)

    # 关键报告文件
    for name in ('执行明细.txt', '流水线报告.txt', 'changelog.jsonl'):
        p = os.path.join(WORK, name)
        if not os.path.exists(p):
            # 可能在 .mycode 下
            p2 = os.path.join(WORK, '.mycode', name)
            p = p2 if os.path.exists(p2) else p
        print(f'报告文件 {name}: {"存在" if os.path.exists(p) else "缺失"}')

    # HTML 完整性
    htmls = [r for r in real if r[0].lower().endswith(('.html', '.htm'))]
    for rel, size in htmls:
        content = open(os.path.join(WORK, rel), encoding='utf-8').read()
        checks = {
            '<html': '<html' in content.lower(),
            '</html>': '</html>' in content.lower(),
            '<script': '<script' in content.lower(),
            '计算器/calculator/=/+': any(k in content for k in ('计算器', 'calculator', '=', '+')),
        }
        print(f'[HTML检查] {rel} ({size}B): {checks}')
        # 打印关键片段
        print(content[:500].replace('\n', ' ')[:500])

    # 执行明细内容（token 去向）
    detail = os.path.join(WORK, '执行明细.txt')
    if os.path.exists(detail):
        txt = open(detail, encoding='utf-8').read()
        print('\n--- 执行明细.txt 前 800 字 ---')
        print(txt[:800])

    # 检查是否有 error/failed 事件
    bad = [e for e in events if isinstance(e, dict) and e.get('event') in ('error', 'pipeline_failed')]
    print('\n' + '=' * 60)
    if bad:
        print(f'发现异常事件 {len(bad)} 个:')
        for b in bad:
            print(' ', json.dumps(b, ensure_ascii=False)[:500])
    else:
        print('无 error / pipeline_failed 事件')
    # 冒烟/验证执行事件
    execs = [e for e in events if isinstance(e, dict) and e.get('event') == 'tool_exec_completed']
    print('验证执行事件数:', len(execs))
    for s in execs:
        d = s.get('data', {})
        print(' ', json.dumps({k: d.get(k) for k in ('cmd', 'exit_code', 'round')}, ensure_ascii=False),
              '| output:', str(d.get('output', ''))[:160])


if __name__ == '__main__':
    asyncio.run(main())
