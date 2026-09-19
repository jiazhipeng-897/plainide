# -*- coding: utf-8 -*-
"""接口层：bug_kb CLI（调试/运维用）。

用法：
  python -m bug_kb.interface.cli recall <项目路径> <错误文本> [--top-n 3]
  python -m bug_kb.interface.cli record <项目路径> --error <文本> [--cause 根因] [--patch '{"file":...}'] [--scope global|project]
  python -m bug_kb.interface.cli list <项目路径>
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

# 允许从 python/ 根直接跑：python -m bug_kb.interface.cli
# cli.py → interface → bug_kb → python → 项目根；parents[2] 是 python/（包根）
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from ..application.recall_service import recall_bug          # noqa: E402
from ..application.record_service import record_bug          # noqa: E402
from ..infrastructure.store import load_global, load_project  # noqa: E402


def main(argv=None):
    ap = argparse.ArgumentParser(prog="bug_kb")
    sub = ap.add_subparsers(dest="cmd", required=True)

    p_recall = sub.add_parser("recall", help="报错召回历史案例")
    p_recall.add_argument("project", help="项目路径")
    p_recall.add_argument("error", help="错误文本")
    p_recall.add_argument("--top-n", type=int, default=3)

    p_record = sub.add_parser("record", help="修复成功后入库")
    p_record.add_argument("project", help="项目路径")
    p_record.add_argument("--error", required=True, help="错误文本")
    p_record.add_argument("--cause", default="", help="根因分析")
    p_record.add_argument("--patch", action="append", default=[], help="补丁 JSON（可多次）")
    p_record.add_argument("--scope", choices=["global", "project"], default=None)
    p_record.add_argument("--verified", action="store_true", default=True)
    p_record.add_argument("--no-verified", action="store_false", dest="verified")

    p_list = sub.add_parser("list", help="列出当前项目的库内容")
    p_list.add_argument("project", help="项目路径")

    args = ap.parse_args(argv)
    if args.cmd == "recall":
        out = recall_bug(args.project, args.error, top_n=args.top_n)
        print(out if out else "（无命中）")
    elif args.cmd == "record":
        patches = [json.loads(p) for p in args.patch] if args.patch else []
        r = record_bug(args.project, args.error, root_cause=args.cause,
                       patches=patches, scope=args.scope, verified=args.verified)
        print(json.dumps(r, ensure_ascii=False))
    elif args.cmd == "list":
        proj = load_project(args.project)
        glob = load_global()
        print(f"项目库 {len(proj)} 条 / 全局库 {len(glob)} 条")
        for r in proj:
            print(f"  [project] {r.fingerprint} · {r.root_cause[:60]}")
        for r in glob:
            print(f"  [global ] {r.fingerprint} · {r.root_cause[:60]}")


if __name__ == "__main__":
    main()
