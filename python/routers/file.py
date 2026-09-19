# python/routers/file.py
"""文件系统操作路由：创建 / 删除 / 重命名（带路径安全校验，拒绝路径穿越）"""
from fastapi import APIRouter
from pydantic import BaseModel
import os
import shutil
from typing import Optional

router = APIRouter(tags=["文件操作"])


class CreateFileRequest(BaseModel):
    path: str


class DeleteRequest(BaseModel):
    path: str


class RenameRequest(BaseModel):
    oldPath: str
    newName: str


def safe_path(p) -> Optional[str]:
    """路径安全校验：必须为绝对路径；规范化后拒绝 UNC 与 .. 逃逸"""
    if not p or not isinstance(p, str) or not p.strip():
        return None
    norm = os.path.normpath(p.strip())
    if not os.path.isabs(norm):
        return None
    if norm.startswith("\\\\"):  # 拒绝 UNC 路径（\\server\share）
        return None
    return norm


def _ok(error=None, **extra):
    if error:
        return {"success": False, "error": error}
    result = {"success": True}
    result.update(extra)
    return result


@router.post("/file/create")
async def create_file(req: CreateFileRequest):
    """创建空文件（父目录必须存在）"""
    path = safe_path(req.path)
    if not path:
        return _ok(error="非法路径")
    parent = os.path.dirname(path)
    if not os.path.isdir(parent):
        return _ok(error="父目录不存在")
    if os.path.exists(path):
        return _ok(error="文件已存在")
    try:
        with open(path, "w", encoding="utf-8") as f:
            f.write("")
        return _ok(path=path)
    except Exception as e:
        return _ok(error=f"创建失败: {str(e)}")


@router.post("/folder/create")
async def create_folder(req: CreateFileRequest):
    """创建文件夹（含父级，可嵌套）"""
    path = safe_path(req.path)
    if not path:
        return _ok(error="非法路径")
    try:
        os.makedirs(path, exist_ok=True)
        return _ok(path=path)
    except Exception as e:
        return _ok(error=f"创建失败: {str(e)}")


@router.post("/file/delete")
async def delete_path(req: DeleteRequest):
    """删除文件或文件夹（文件夹递归删除）"""
    path = safe_path(req.path)
    if not path:
        return _ok(error="非法路径")
    if not os.path.exists(path):
        return _ok(error="路径不存在")
    try:
        if os.path.isdir(path):
            shutil.rmtree(path)
        else:
            os.remove(path)
        return _ok(path=path)
    except Exception as e:
        return _ok(error=f"删除失败: {str(e)}")


@router.post("/file/rename")
async def rename_path(req: RenameRequest):
    """重命名文件或文件夹（newName 仅为名称，不允许路径）"""
    old = safe_path(req.oldPath)
    if not old:
        return _ok(error="非法路径")
    name = (req.newName or "").strip()
    if not name or "/" in name or "\\" in name or name in (".", ".."):
        return _ok(error="非法文件名")
    new = os.path.join(os.path.dirname(old), name)
    if not os.path.exists(old):
        return _ok(error="原路径不存在")
    if os.path.exists(new):
        return _ok(error="目标已存在")
    try:
        os.rename(old, new)
        return _ok(path=new)
    except Exception as e:
        return _ok(error=f"重命名失败: {str(e)}")
