# -*- coding: utf-8 -*-
"""分诊（triage）语义化回归测试：
分诊是零 token 本地规则，必须"换说法也认得"——不同表达稳定落到正确档位。
运行：python -m pytest python/tests/test_triage.py -q
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from orchestrator.triage import triage

CASES = [
    # (需求, 期望档位, 说明)
    ('帮我写一个 HTML 计算器', 't1', '裸 html + 工具词'),
    ('做一个HTML单计算机', 't1', 'HTML 单计算机（用户原话）'),
    ('写个 htm 的锁屏计时器', 't1', 'htm 变体'),
    ('帮我写一个单html的计算器', 't1', '单html'),
    ('帮我写一个计算器', 't2', '桌面小工具，无单页词'),
    ('帮我写一个美容店前端页面', 't1', '页面级 + 简短 + 无复杂信号'),
    ('写一个网页版计算器', 't1', '网页版 + 简短'),
    ('帮我写一个静态页面', 't1', '静态页强信号'),
    ('帮我写一个单文件的小工具', 't1', '单文件强信号'),
    ('帮我写一个页面', 't1', '单个页面（组合信号）'),
    ('做一个静态网站', 't1', '静态网站强信号'),
    ('帮我写一个 Vue 商城，带登录和支付', 't4', '复杂信号×3'),
    ('写一个网页版管理系统', 't3', '网页 + 管理系统复杂信号 → 不降 t1'),
    ('帮我做一个官网', 't3', '官网是站点语义 → 不降 t1'),
    ('帮我写一个博客', 't3', '博客 → 不降 t1'),
    ('写一个文件管理器', 't2', '文件管理器是完整应用，不能单文件'),
    ('帮我写一个桌面记事本', 't2', '桌面小工具'),
    ('帮我写一个 Python 脚本处理 Excel', 't2', '脚本小任务，无单页词'),
    ('帮我写一个全栈电商平台', 't4', '全栈+电商+平台'),
]


def test_triage_semantic():
    fails = []
    for req, want, note in CASES:
        tier, reason = triage(req, scale='standard', mode='full')
        if tier != want:
            fails.append(f'{req}: got {tier} (want {want}) [{note}] reason={reason}')
    assert not fails, '\n'.join(fails)


if __name__ == '__main__':
    test_triage_semantic()
    print(f'[OK] 分诊语义化用例 {len(CASES)} 条全部通过')
