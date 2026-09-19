# -*- coding: utf-8 -*-
"""HTML 计算器端到端实测：提交任务 → 分诊 → 开发 → 冒烟，检查产物"""
import asyncio
import json
import os
import shutil
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from orchestrator.engine import PipelineEngine


async def main():
    tmp = tempfile.mkdtemp(prefix='calc_test_')
    print('目标目录:', tmp)
    print('提交需求: 帮我写一个 HTML 计算器')
    engine = PipelineEngine()
    events = []
    async for evt in engine.run('帮我写一个 HTML 计算器', project_path=tmp, scale='slim', mode='full'):
        events.append(evt)
        if isinstance(evt, dict):
            e = evt.get('event')
            if e in ('stage_started', 'stage_completed', 'artifacts_written', 'smoke_result',
                     'pipeline_completed', 'pipeline_failed', 'error', 'review_result'):
                data = evt.get('data', {})
                print(f"[{e}] {json.dumps(data, ensure_ascii=False)[:220]}")

    # 检查产物
    real = []
    for root, dirs, fnames in os.walk(tmp):
        dirs[:] = [d for d in dirs if d not in ('.mycode', '.memory', '__pycache__',
                                                '.code_rag', '.pytest_cache', 'node_modules')]
        for fn in fnames:
            p = os.path.join(root, fn)
            real.append((os.path.relpath(p, tmp), os.path.getsize(p)))
    print('产物清单:', real)

    htmls = [r for r in real if r[0].lower().endswith(('.html', '.htm'))]
    for rel, size in htmls:
        content = open(os.path.join(tmp, rel), encoding='utf-8').read()
        print(f'--- {rel} ({size}B, {len(content)} 字符) ---')
        print(content[:1200])

    # HTML 完整性冒烟
    for rel, _ in htmls:
        content = open(os.path.join(tmp, rel), encoding='utf-8').read()
        checks = {
            '有 <html>': '<html' in content.lower(),
            '有 <script>': '<script' in content.lower(),
            '有 </html>': '</html>' in content.lower(),
            '含计算器字样/符号': any(k in content for k in ('计算器', 'calculator', '=', '+')),
        }
        print(f'[检查] {rel}: {checks}')
        assert all(checks.values()), f'{rel} 完整性检查失败'

    shutil.rmtree(tmp, ignore_errors=True)
    print('\n[MOCK 链路验证通过]')


if __name__ == '__main__':
    asyncio.run(main())
