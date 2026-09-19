import os
import subprocess
import hashlib
import sys
import re
from pathlib import Path
from typing import Dict, Any, Tuple, Optional

from .flake8_checker import Flake8Checker
from utils.logger import Logger


class CodeDoctor:
    """代码医生：自动格式化 + 代码检查"""

    def __init__(self):
        self.last_hash = None
        self.is_perfect = False

    def _get_file_hash(self, file_path: str) -> str:
        """计算文件 MD5"""
        with open(file_path, "rb") as f:
            return hashlib.md5(f.read()).hexdigest()

    def _run_autopep8(self, file_path: str) -> Tuple[bool, str]:
        """执行 autopep8 自动格式化"""
        try:
            result = subprocess.run(
                [sys.executable, "-m", "autopep8", "-i", "--aggressive", file_path],
                capture_output=True,
                text=True,
                timeout=30,
            )
            if result.returncode == 0:
                return True, "✅ autopep8 格式化完成"
            else:
                return False, f"⚠️ autopep8 失败: {result.stderr}"
        except FileNotFoundError:
            return False, "⚠️ autopep8 未安装，请运行: pip install autopep8"
        except subprocess.TimeoutExpired:
            return False, "⚠️ autopep8 超时"
        except Exception as e:
            return False, f"⚠️ autopep8 异常: {e}"

    def _apply_tools_fix(self, content: str) -> Tuple[str, bool]:
        """
        基础工具链修复（简单正则，后续可扩展）
        修复：中文标点→英文标点、多余空格、括号配对等
        """
        modified = False
        original = content

        # 1. 中文标点转英文标点（仅代码场景）
        punct_map = {
            "，": ", ",
            "；": "; ",
            "！": "! ",
            "？": "? ",
            "（": "(",
            "）": ")",
            "【": "[",
            "】": "]",
            "“": '"',
            "”": '"',
            "‘": "'",
            "’": "'",
        }
        for cn, en in punct_map.items():
            if cn in content:
                content = content.replace(cn, en)
                modified = True

        # 2. 去除行尾多余空格
        lines = content.split("\n")
        new_lines = []
        for line in lines:
            stripped = line.rstrip()
            if stripped != line:
                modified = True
            new_lines.append(stripped)
        content = "\n".join(new_lines)

        # 3. 替换连续空行（>2）为2行
        content = re.sub(r"\n{4,}", "\n\n\n", content)

        return content, modified

    def auto_format(self, file_path: str) -> Dict[str, Any]:
        """
        执行自动格式化全流程
        返回: {
            success: bool,
            message: str,
            has_errors: bool,
            errors: list,
            autopep8_ok: bool,
        }
        """
        result = {
            "success": False,
            "message": "",
            "has_errors": False,
            "errors": [],
            "autopep8_ok": False,
        }

        try:
            # 1. 缓存检查
            current_hash = self._get_file_hash(file_path)
            if current_hash == self.last_hash and self.is_perfect:
                result["success"] = True
                result["message"] = "✅ 代码已完美，无需重复格式化"
                return result

            Logger.info(f"开始格式化: {file_path}", source="doctor")

            # 2. 备份
            backup_path = file_path + ".bak"
            if os.path.exists(backup_path):
                os.remove(backup_path)
            os.rename(file_path, backup_path)

            try:
                # 3. 读取并做基础修复
                with open(backup_path, "r", encoding="utf-8") as f:
                    content = f.read()

                fixed_content, has_changes = self._apply_tools_fix(content)

                if has_changes:
                    with open(file_path, "w", encoding="utf-8") as f:
                        f.write(fixed_content)
                    result["message"] = "🛡️ 基础修复已完成"
                    Logger.info("基础修复完成", source="doctor")
                else:
                    # 无变化，直接复制备份
                    os.rename(backup_path, file_path)
                    result["message"] = "✅ 无需修复"

                # 4. autopep8 格式化
                autopep8_ok, autopep8_msg = self._run_autopep8(file_path)
                result["autopep8_ok"] = autopep8_ok
                if autopep8_ok:
                    result["message"] += " | ✅ autopep8 完成"
                else:
                    result["message"] += f" | {autopep8_msg}"

                # 5. Flake8 检查
                flake8_result = Flake8Checker.check(file_path)
                result["has_errors"] = flake8_result["has_errors"]
                result["errors"] = flake8_result["errors"]

                # 6. 更新缓存
                if not flake8_result["has_errors"]:
                    self.last_hash = self._get_file_hash(file_path)
                    self.is_perfect = True
                    # 删除备份
                    if os.path.exists(backup_path):
                        os.remove(backup_path)
                    result["success"] = True
                    result["message"] += " | ✅ 代码检查通过"
                    Logger.info("格式化完成，代码检查通过", source="doctor")
                else:
                    result["success"] = True
                    result["message"] += f" | ⚠️ 发现 {len(flake8_result['errors'])} 个问题，需手动修复"
                    Logger.warning(f"格式化完成，发现 {len(flake8_result['errors'])} 个问题", source="doctor")

            except Exception as inner_e:
                # 恢复备份
                if os.path.exists(backup_path):
                    if os.path.exists(file_path):
                        os.remove(file_path)
                    os.rename(backup_path, file_path)
                raise inner_e

            return result

        except Exception as e:
            Logger.error(f"格式化失败: {str(e)}", source="doctor", stack=True)
            return {
                "success": False,
                "message": f"❌ 格式化失败: {str(e)}",
                "has_errors": True,
                "errors": [{"code": "DOCTOR_ERROR", "text": str(e)}],
                "autopep8_ok": False,
            }