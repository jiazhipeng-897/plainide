import sys
import traceback
from datetime import datetime
from typing import Optional

# 设置标准输出编码为 UTF-8（Windows 兼容）
if sys.platform == "win32":
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

from config import log_error


class Logger:
    """统一日志收集器，对接错误窗口"""

    @staticmethod
    def error(message: str, source: str = "python", stack: Optional[str] = None, details: Optional[dict] = None):
        """记录错误"""
        entry = {
            "level": "error",
            "message": message,
            "source": source,
            "stack": stack or traceback.format_exc(),
            "details": details,
        }
        log_error(entry)
        # 也打印到控制台
        print(f"[ERROR] {message}", file=sys.stderr)

    @staticmethod
    def warning(message: str, source: str = "python", details: Optional[dict] = None):
        """记录警告"""
        entry = {
            "level": "warning",
            "message": message,
            "source": source,
            "details": details,
        }
        log_error(entry)
        print(f"[WARN] {message}", file=sys.stderr)

    @staticmethod
    def info(message: str, source: str = "python", details: Optional[dict] = None):
        """记录信息"""
        entry = {
            "level": "info",
            "message": message,
            "source": source,
            "details": details,
        }
        log_error(entry)
        print(f"[INFO] {message}")