import os
from pathlib import Path
from typing import List, Dict, Any


def get_file_info(file_path: str, root_path: str) -> Dict[str, Any]:
    """获取文件信息"""
    path = Path(file_path)
    stat = path.stat()
    rel_path = os.path.relpath(file_path, root_path)

    return {
        "path": file_path,
        "relativePath": rel_path.replace(os.sep, "/"),
        "name": path.name,
        "isDirectory": path.is_dir(),
        "size": stat.st_size if not path.is_dir() else 0,
        "modifiedTime": stat.st_mtime,
        "extension": path.suffix.lower(),
    }


def get_language_from_extension(ext: str) -> str:
    """根据扩展名获取语言"""
    lang_map = {
        ".py": "python",
        ".js": "javascript",
        ".mjs": "javascript",
        ".cjs": "javascript",
        ".ts": "typescript",
        ".jsx": "javascript",
        ".tsx": "typescript",
        ".vue": "vue",
        ".html": "html",
        ".htm": "html",
        ".css": "css",
        ".scss": "scss",
        ".less": "less",
        ".json": "json",
        ".md": "markdown",
        ".yaml": "yaml",
        ".yml": "yaml",
        ".toml": "toml",
        ".sh": "shell",
        ".bash": "shell",
        ".txt": "plaintext",
    }
    return lang_map.get(ext, "plaintext")


def is_code_file(ext: str) -> bool:
    """判断是否为代码文件（用于 AST 解析）"""
    code_exts = {".py", ".js", ".mjs", ".cjs", ".ts", ".jsx", ".tsx", ".vue"}
    return ext in code_exts