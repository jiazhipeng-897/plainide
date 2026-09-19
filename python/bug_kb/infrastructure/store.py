# -*- coding: utf-8 -*-
"""基础设施层：全局库 + 项目私有库落盘。

落盘位置：
- 全局库：%APPDATA%/my-ide/bug_kb/bug_records.json
- 项目私有库：<项目>/.mycode/bug_kb/bug_records.json

原子写：先写临时文件再 replace，避免半写损坏。
"""
from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path
from typing import List, Optional

from ..domain.schema import BugRecord

_KB_FILE = "bug_records.json"
_MAX_RECORDS = 500          # 单库上限，防无限膨胀
_OLDEST_KEEP = 300          # 超上限时清理最老记录


def global_kb_dir() -> Path:
    """全局库目录 %APPDATA%/my-ide/bug_kb（不存在则创建）。"""
    appdata = os.environ.get("APPDATA") or os.environ.get("HOME") or str(Path.home())
    d = Path(appdata) / "my-ide" / "bug_kb"
    d.mkdir(parents=True, exist_ok=True)
    return d


def project_kb_dir(project_path: str) -> Path:
    """项目私有库目录 <项目>/.mycode/bug_kb（不存在则创建）。"""
    d = Path(project_path) / ".mycode" / "bug_kb"
    try:
        d.mkdir(parents=True, exist_ok=True)
    except Exception:
        pass
    return d


def _load_records(kb_file: Path) -> List[BugRecord]:
    if not kb_file.exists():
        return []
    try:
        data = json.loads(kb_file.read_text(encoding="utf-8"))
    except Exception:
        return []
    out = []
    for d in data if isinstance(data, list) else []:
        try:
            r = BugRecord.from_dict(d)
            if r.verified:
                out.append(r)
        except Exception:
            continue
    return out


def _save_records(kb_file: Path, records: List[BugRecord]) -> None:
    try:
        kb_file.parent.mkdir(parents=True, exist_ok=True)
    except Exception:
        return
    # 超上限清理最老记录
    if len(records) > _MAX_RECORDS:
        records = sorted(records, key=lambda r: r.created_at)[-_OLDEST_KEEP:]
    payload = [r.to_dict() for r in records]
    try:
        fd, tmp = tempfile.mkstemp(prefix=".kb_", dir=str(kb_file.parent))
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=1)
        os.replace(tmp, kb_file)
    except Exception:
        try:
            os.unlink(tmp)  # type: ignore
        except Exception:
            pass


def load_global() -> List[BugRecord]:
    return _load_records(global_kb_dir() / _KB_FILE)


def load_project(project_path: str) -> List[BugRecord]:
    return _load_records(project_kb_dir(project_path) / _KB_FILE)


def save_global(records: List[BugRecord]) -> None:
    _save_records(global_kb_dir() / _KB_FILE, records)


def save_project(project_path: str, records: List[BugRecord]) -> None:
    _save_records(project_kb_dir(project_path) / _KB_FILE, records)


def add_record(project_path: Optional[str], record: BugRecord,
               scope: Optional[str] = None) -> bool:
    """入库（去重：同指纹同作用域已存在 → 跳过，不重复堆积）。
    仅允许 verified: true；返回是否实际写入。"""
    if not record.verified:
        return False
    scope = scope or record.scope
    if scope == "global":
        records = load_global()
        for r in records:
            if r.fingerprint == record.fingerprint:
                return False
        records.append(record)
        save_global(records)
        return True
    if project_path:
        records = load_project(project_path)
        for r in records:
            if r.fingerprint == record.fingerprint:
                return False
        records.append(record)
        save_project(project_path, records)
        return True
    return False
