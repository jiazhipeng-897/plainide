# -*- coding: utf-8 -*-
"""orchestrator.code_context 桥接层测试（code_rag → agent 链路）。

覆盖：
- 首次 retrieve 自动建索引并返回格式化参考块（含 文件:行号 [节点类型]）
- 空 query / 非法路径 / 索引不可用时静默返回 ''
- 字符预算截断生效
- ensure / refresh 幂等
"""
import os
import shutil
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

import pytest

from orchestrator.code_context import (
    CodeRagProvider,
    ensure_project_index,
    refresh_project_index,
    retrieve_code_context,
)

FIXTURES = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                        "code_rag", "tests", "fixtures")


@pytest.fixture()
def project(tmp_path):
    proj = tmp_path / "proj"
    shutil.copytree(FIXTURES, proj)
    return str(proj)


# ---------- 基础检索 ----------

def test_retrieve_auto_index_and_format(project):
    ref = retrieve_code_context("readConfig file parse", project)
    assert ref, "应检索到内容"
    assert "【项目相关代码参考" in ref
    assert "sample.js" in ref and "readConfig" in ref
    assert "---" in ref and "[export_statement]" in ref, "应带 文件:行号 [节点类型] 头"
    # 索引库被自动创建
    assert os.path.exists(os.path.join(project, ".code_rag", "index.db"))


def test_retrieve_chinese(project):
    ref = retrieve_code_context("加载配置", project)
    assert ref and "sample.py" in ref and "load_config" in ref


def test_retrieve_empty_query(project):
    assert retrieve_code_context("", project) == ""
    assert retrieve_code_context("   ", project) == ""


def test_retrieve_invalid_path():
    assert retrieve_code_context("anything", r"C:\nonexistent_dir_xyz") == ""


# ---------- 预算 ----------

def test_retrieve_budget_truncation(project):
    small = retrieve_code_context("readConfig", project, max_chars=300)
    big = retrieve_code_context("readConfig", project, max_chars=5000)
    assert small, "小预算也应有内容"
    assert len(small) <= 300 + 200, "小预算应被截断到预算量级"
    assert len(big) > len(small), "大预算应返回更多内容"


# ---------- 幂等 / 刷新 ----------

def test_ensure_and_refresh_idempotent(project):
    assert ensure_project_index(project) is True
    # 已索引再 ensure → True 且不报错
    assert ensure_project_index(project) is True
    assert refresh_project_index(project) is True


def test_provider_dedup_service(project):
    provider = CodeRagProvider()
    provider.ensure_indexed(project)
    svc1 = provider._service(project)
    svc2 = provider._service(project)
    assert svc1 is svc2, "同一项目应复用同一 service 实例"


# ---------- 并发预热 ----------

def test_concurrent_ensure_single_index(project):
    """多线程同时首次 ensure：锁保证只建一次索引，不重复建库/不交叉"""
    import threading
    from concurrent.futures import ThreadPoolExecutor

    # 换一个全新项目目录（fixtures 副本），确保首次未索引
    fresh = os.path.join(os.path.dirname(project), "fresh_concurrent")
    shutil.copytree(FIXTURES, fresh)
    provider = CodeRagProvider()

    def do_ensure():
        return provider.ensure_indexed(fresh)

    with ThreadPoolExecutor(max_workers=4) as ex:
        results = list(ex.map(lambda _: do_ensure(), range(8)))
    assert all(results), "所有并发 ensure 都应成功"
    # 索引只建了一次：chunks 恰好 20（若重复建库会出现重复切片或异常）
    assert provider._service(fresh).store.count_chunks() == 20
    shutil.rmtree(fresh, ignore_errors=True)


# ---------- 渲染头信息 ----------

def test_render_has_location_and_type(project):
    provider = CodeRagProvider(top_k=5, max_chars=8000)
    ref = provider.retrieve("config port server", project)
    lines = [l for l in ref.splitlines() if l.startswith("--- ")]
    assert lines, "至少一条带位置头的切片"
    for line in lines:
        assert ":" in line and "[" in line, f"头信息缺行号或节点类型: {line}"
