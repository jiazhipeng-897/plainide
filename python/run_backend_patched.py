# -*- coding: utf-8 -*-
"""带 DNS 补丁的后端启动入口（仅测试机用）：先注入 dns_patch 再启动 main"""
import sys
import runpy
import os

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'cache'))
import dns_patch  # noqa: F401

runpy.run_path('main.py', run_name='__main__')
