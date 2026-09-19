import subprocess
import json
import sys
from typing import Dict, Any, List, Tuple


class Flake8Checker:
    """Flake8 代码检查封装"""

    @staticmethod
    def check(file_path: str) -> Dict[str, Any]:
        """
        执行 flake8 检查
        返回: {"has_errors": bool, "errors": list, "output": str}
        """
        try:
            result = subprocess.run(
                [sys.executable, "-m", "flake8", file_path, "--format=json"],
                capture_output=True,
                text=True,
                timeout=30,
            )

            # flake8 --format=json 在有错误时返回非0退出码，但 stdout 有 JSON
            if result.stdout:
                try:
                    errors = json.loads(result.stdout)
                    # errors 格式: { "file_path": [{"line": 10, "column": 5, "code": "E123", "text": "..."}] }
                    has_errors = len(errors.get(file_path, [])) > 0
                    return {
                        "has_errors": has_errors,
                        "errors": errors.get(file_path, []),
                        "output": result.stdout,
                    }
                except json.JSONDecodeError:
                    pass

            # 无错误时返回空
            return {"has_errors": False, "errors": [], "output": ""}

        except subprocess.TimeoutExpired:
            return {"has_errors": True, "errors": [{"code": "TIMEOUT", "text": "flake8 检查超时"}], "output": ""}
        except FileNotFoundError:
            return {"has_errors": True, "errors": [{"code": "NOT_FOUND", "text": "flake8 未安装，请运行: pip install flake8"}], "output": ""}
        except Exception as e:
            return {"has_errors": True, "errors": [{"code": "ERROR", "text": str(e)}], "output": ""}