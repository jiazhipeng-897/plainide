import os
import re
from pathlib import Path
from typing import List, Set, Optional
import pathspec


class GitignoreParser:
    """解析 .gitignore 文件，提供路径过滤"""

    def __init__(self, project_root: str):
        self.project_root = Path(project_root).resolve()
        self.spec = None
        self._load_gitignore()

    def _load_gitignore(self):
        """加载项目根目录下的 .gitignore"""
        gitignore_path = self.project_root / ".gitignore"
        if gitignore_path.exists():
            with open(gitignore_path, "r", encoding="utf-8") as f:
                patterns = f.read().splitlines()
            self.spec = pathspec.PathSpec.from_lines("gitwildmatch", patterns)
        else:
            # 默认忽略常见目录（无 .gitignore 时兜底）
            default_patterns = [
                "node_modules/",
                ".git/",
                "__pycache__/",
                "*.pyc",
                ".DS_Store",
                "dist/",
                "build/",
                ".vscode/",
                ".idea/",
                "venv/",
                ".venv/",
                "env/",
                ".env",
                "*.log",
                "coverage/",
                ".pytest_cache/",
                ".mypy_cache/",
                ".ruff_cache/",
            ]
            self.spec = pathspec.PathSpec.from_lines("gitwildmatch", default_patterns)

    def is_ignored(self, file_path: str) -> bool:
        """判断文件是否应该被忽略"""
        rel_path = os.path.relpath(file_path, self.project_root)
        # 统一为 POSIX 风格
        rel_path = rel_path.replace(os.sep, "/")
        return self.spec.match_file(rel_path)

    def filter_files(self, files: List[str]) -> List[str]:
        """过滤掉被忽略的文件"""
        return [f for f in files if not self.is_ignored(f)]