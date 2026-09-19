import os
from pathlib import Path
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional, Dict, Any

from core.gitignore import GitignoreParser
from utils.file_utils import get_file_info, is_code_file
from utils.logger import Logger
router = APIRouter(prefix="/scan", tags=["文件扫描"])


class ScanRequest(BaseModel):
    path: str


class ScanResponse(BaseModel):
    success: bool
    files: List[Dict[str, Any]]
    total: int
    codeFiles: int
    error: Optional[str] = None


def _walk_directory(
    root_path: str,
    current_path: str,
    gitignore: GitignoreParser,
    max_depth: int = 20,
    current_depth: int = 0,
) -> List[Dict[str, Any]]:
    """递归遍历目录"""
    if current_depth > max_depth:
        return []

    result = []
    try:
        entries = sorted(os.listdir(current_path))
    except PermissionError:
        return result

    for entry in entries:
        full_path = os.path.join(current_path, entry)

        # 跳过被 .gitignore 忽略的
        if gitignore.is_ignored(full_path):
            continue

        is_dir = os.path.isdir(full_path)

        # 跳过空目录
        if is_dir:
            try:
                if not os.listdir(full_path):
                    continue
            except PermissionError:
                continue

        file_info = get_file_info(full_path, root_path)
        file_info["isCode"] = is_code_file(file_info["extension"])

        result.append(file_info)

        # 递归子目录
        if is_dir:
            sub_files = _walk_directory(
                root_path, full_path, gitignore,
                max_depth, current_depth + 1
            )
            result.extend(sub_files)

    return result


@router.post("/")
async def scan_directory(req: ScanRequest) -> ScanResponse:
    """扫描项目目录，返回文件树"""
    try:
        root_path = req.path

        if not os.path.exists(root_path):
            return ScanResponse(
                success=False,
                files=[],
                total=0,
                codeFiles=0,
                error=f"路径不存在: {root_path}"
            )

        if not os.path.isdir(root_path):
            return ScanResponse(
                success=False,
                files=[],
                total=0,
                codeFiles=0,
                error=f"不是目录: {root_path}"
            )

        Logger.info(f"开始扫描目录: {root_path}", source="scan")

        gitignore = GitignoreParser(root_path)
        files = _walk_directory(root_path, root_path, gitignore)

        code_files = [f for f in files if f.get("isCode", False)]

        Logger.info(f"扫描完成: 总计 {len(files)} 个文件, 代码文件 {len(code_files)} 个", source="scan")

        return ScanResponse(
            success=True,
            files=files,
            total=len(files),
            codeFiles=len(code_files),
        )

    except Exception as e:
        Logger.error(f"扫描失败: {str(e)}", source="scan", stack=True)
        return ScanResponse(
            success=False,
            files=[],
            total=0,
            codeFiles=0,
            error=str(e),
        )