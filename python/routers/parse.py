import os
from pathlib import Path
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, Dict, Any, List

from core.tree_sitter_parser import (
    get_language_for_file,
    parse_code,
    parse_vue_sfc,
    extract_outline,
)
from core.code_map_extractor import extract_code_map
from utils.logger import Logger

router = APIRouter(prefix="/parse", tags=["AST解析"])


class ParseRequest(BaseModel):
    fullPath: str
    source: Optional[str] = None
    includeTemplateAst: bool = True
    includeStyleAst: bool = False


class ParseResponse(BaseModel):
    success: bool
    lang: Optional[str] = None
    root: Optional[Dict[str, Any]] = None
    codeMap: Optional[Dict[str, Any]] = None
    outline: Optional[Dict[str, Any]] = None
    vueBlocks: Optional[Dict[str, Any]] = None
    error: Optional[str] = None


@router.post("/")
async def parse_code_file(req: ParseRequest) -> ParseResponse:
    """解析代码文件，返回 AST + CodeMap"""
    try:
        file_path = req.fullPath
        lang = get_language_for_file(file_path)

        if not lang:
            return ParseResponse(
                success=False,
                error=f"不支持的文件类型: {Path(file_path).suffix}"
            )

        # 读取源码
        if req.source is not None:
            code = req.source
        else:
            if not os.path.exists(file_path):
                return ParseResponse(
                    success=False,
                    error=f"文件不存在: {file_path}"
                )
            with open(file_path, "r", encoding="utf-8") as f:
                code = f.read()

        Logger.info(f"解析文件: {file_path} ({lang})", source="parse")

        # ========== 1. 提取 CodeMap（从源代码，独立于AST） ==========
        code_map = extract_code_map(code, lang)

        # ========== 2. 生成语法树（用于其他用途） ==========
        if lang == "vue":
            result = parse_vue_sfc(code)
            root = result.get("root")
            vue_blocks = result.get("vueBlocks")
            
            # Vue的script部分可能包含额外的函数/类，合并到code_map
            if vue_blocks and vue_blocks.get("script") and vue_blocks["script"].get("content"):
                script_code = vue_blocks["script"]["content"]
                script_code_map = extract_code_map(script_code, "typescript")
                # 合并（注意行号偏移）
                if script_code_map.get("classes"):
                    script_start_line = vue_blocks["script"].get("start_line", 0)
                    for cls in script_code_map["classes"]:
                        cls["start_line"] += script_start_line - 1
                        cls["end_line"] += script_start_line - 1
                        for method in cls.get("methods", []):
                            method["start_line"] += script_start_line - 1
                            method["end_line"] += script_start_line - 1
                    code_map["classes"] = code_map.get("classes", []) + script_code_map["classes"]
                if script_code_map.get("functions"):
                    script_start_line = vue_blocks["script"].get("start_line", 0)
                    for func in script_code_map["functions"]:
                        func["start_line"] += script_start_line - 1
                        func["end_line"] += script_start_line - 1
                    code_map["functions"] = code_map.get("functions", []) + script_code_map["functions"]
                if script_code_map.get("imports"):
                    script_start_line = vue_blocks["script"].get("start_line", 0)
                    for imp in script_code_map["imports"]:
                        imp["line"] += script_start_line - 1
                    code_map["imports"] = code_map.get("imports", []) + script_code_map["imports"]

            outline = None
            if vue_blocks and vue_blocks.get("script") and vue_blocks["script"].get("content"):
                outline = extract_outline(vue_blocks["script"]["content"], "typescript")
                script_start_line = vue_blocks["script"].get("start_line", 1)
                for cls in outline.get("classes", []):
                    cls["start_line"] += script_start_line - 1
                    cls["end_line"] += script_start_line - 1
                    for m in cls.get("methods", []):
                        m["start_line"] += script_start_line - 1
                        m["end_line"] += script_start_line - 1
                for func in outline.get("functions", []):
                    func["start_line"] += script_start_line - 1
                    func["end_line"] += script_start_line - 1

            if root is not None:
                root["file"] = file_path

            return ParseResponse(
                success=True,
                lang="vue",
                root=root,
                codeMap=code_map,
                outline=outline,
                vueBlocks=vue_blocks,
            )

        # ========== 其他语言 ==========
        ast_root = parse_code(code, lang)
        if not ast_root:
            return ParseResponse(
                success=False,
                error=f"解析失败: {lang}"
            )

        ast_root["file"] = file_path
        outline = extract_outline(code, lang)

        return ParseResponse(
            success=True,
            lang=lang,
            root=ast_root,
            codeMap=code_map,
            outline=outline,
        )

    except Exception as e:
        Logger.error(f"AST解析失败: {str(e)}", source="parse", stack=True)
        return ParseResponse(
            success=False,
            error=str(e),
        )