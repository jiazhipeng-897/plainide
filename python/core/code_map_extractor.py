# core/code_map_extractor.py

"""
大纲提取器 - 独立于语法树
只负责从源代码中提取：类、函数、导入 的位置（行号范围）
用于代码导航、高亮、折叠
"""

from typing import List, Dict, Any
import re


def extract_code_map(code: str, lang: str = "python") -> Dict[str, Any]:
    """
    从源代码提取大纲（完全不依赖AST）
    
    返回：
    {
        "classes": [
            {
                "name": "UserService",
                "start_line": 10,
                "end_line": 85,
                "methods": [
                    {"name": "login", "start_line": 15, "end_line": 30},
                    {"name": "logout", "start_line": 35, "end_line": 50}
                ]
            }
        ],
        "functions": [
            {"name": "helper", "start_line": 100, "end_line": 120}
        ],
        "imports": [
            {"text": "import os", "line": 1}
        ]
    }
    """
    if lang.lower() in ["python", "py"]:
        return _extract_python_outline(code)
    elif lang.lower() in ["javascript", "js", "typescript", "ts"]:
        return _extract_js_outline(code)
    elif lang.lower() in ["go", "golang"]:
        return _extract_go_outline(code)
    elif lang.lower() in ["vue"]:
        return _extract_vue_outline(code)
    else:
        # 默认用Python方式
        return _extract_python_outline(code)


def _extract_python_outline(code: str) -> Dict[str, Any]:
    """Python大纲提取（基于缩进）"""
    lines = code.split('\n')
    outline = {
        "classes": [],
        "functions": [],
        "imports": []
    }
    
    i = 0
    while i < len(lines):
        line = lines[i]
        stripped = line.strip()
        
        # 提取导入
        if stripped.startswith(('import ', 'from ')):
            outline["imports"].append({
                "text": stripped,
                "line": i + 1
            })
            i += 1
            continue
        
        # 提取类
        class_match = re.match(r'^(\s*)class\s+(\w+)', line)
        if class_match:
            indent = len(class_match.group(1))
            class_name = class_match.group(2)
            start_line = i + 1
            
            # 找类结束
            end_line = _find_block_end(lines, i, indent)
            
            # 提取类里面的方法
            methods = _extract_methods(lines, i + 1, end_line - 1, indent + 4)
            
            outline["classes"].append({
                "name": class_name,
                "start_line": start_line,
                "end_line": end_line,
                "methods": methods
            })
            i = end_line
            continue
        
        # 提取顶层函数
        func_match = re.match(r'^(\s*)def\s+(\w+)', line) or re.match(r'^(\s*)async\s+def\s+(\w+)', line)
        if func_match:
            indent = len(func_match.group(1))
            # 处理 async def 的情况
            if func_match.group(1) == '' and line.strip().startswith('async def'):
                # 重新匹配 async def
                async_match = re.match(r'^(\s*)async\s+def\s+(\w+)', line)
                if async_match:
                    func_name = async_match.group(2)
                else:
                    func_name = func_match.group(2) if len(func_match.groups()) == 2 else func_match.group(2)
            else:
                func_name = func_match.group(2) if len(func_match.groups()) == 2 else func_match.group(2)
            
            start_line = i + 1
            
            # 找函数结束
            end_line = _find_block_end(lines, i, indent)
            
            outline["functions"].append({
                "name": func_name,
                "start_line": start_line,
                "end_line": end_line
            })
            i = end_line
            continue
        
        i += 1
    
    return outline


def _extract_methods(lines: List[str], start: int, end: int, base_indent: int) -> List[Dict]:
    """提取类里面的方法"""
    methods = []
    i = start
    
    while i <= end and i < len(lines):
        line = lines[i]
        stripped = line.strip()
        
        # 匹配方法定义
        func_match = re.match(r'^(\s*)def\s+(\w+)', line) or re.match(r'^(\s*)async\s+def\s+(\w+)', line)
        if func_match:
            indent = len(func_match.group(1))
            if indent >= base_indent:
                func_name = func_match.group(2) if len(func_match.groups()) == 2 else func_match.group(2)
                start_line = i + 1
                end_line = _find_block_end(lines, i, indent)
                methods.append({
                    "name": func_name,
                    "start_line": start_line,
                    "end_line": end_line
                })
                i = end_line
                continue
        
        i += 1
    
    return methods


def _find_block_end(lines: List[str], start_idx: int, base_indent: int) -> int:
    """根据缩进找代码块结束行号（从1开始）"""
    i = start_idx + 1
    while i < len(lines):
        line = lines[i]
        if line.strip() == '':
            i += 1
            continue
        
        current_indent = len(line) - len(line.lstrip())
        if current_indent <= base_indent:
            return i  # 返回行号（从0开始，转成从1开始在外面处理）
        i += 1
    
    return len(lines)  # 文件结束


# ==================== 其他语言 ====================

def _extract_js_outline(code: str) -> Dict[str, Any]:
    """JavaScript/TypeScript大纲提取"""
    lines = code.split('\n')
    outline = {"classes": [], "functions": [], "imports": []}
    
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        
        # 提取导入
        if line.startswith(('import ', 'from ', 'const ', 'let ', 'var ')) and ('require' in line or 'from' in line):
            outline["imports"].append({"text": line, "line": i + 1})
            i += 1
            continue
        
        # 提取类
        class_match = re.match(r'^(export\s+)?class\s+(\w+)', line)
        if class_match:
            start_line = i + 1
            end_line = _find_brace_end(lines, i)
            outline["classes"].append({
                "name": class_match.group(2),
                "start_line": start_line,
                "end_line": end_line,
                "methods": []  # JS方法提取较复杂，简化处理
            })
            i = end_line
            continue
        
        # 提取函数
        func_match = re.match(r'^(export\s+)?function\s+(\w+)', line) or re.match(r'^(export\s+)?async\s+function\s+(\w+)', line)
        if func_match:
            start_line = i + 1
            end_line = _find_brace_end(lines, i)
            outline["functions"].append({
                "name": func_match.group(2) if len(func_match.groups()) == 2 else func_match.group(2),
                "start_line": start_line,
                "end_line": end_line
            })
            i = end_line
            continue
        
        # 箭头函数赋值
        arrow_match = re.match(r'^(export\s+)?(const|let|var)\s+(\w+)\s*=\s*(async\s+)?\(?[^)]*\)?\s*=>', line)
        if arrow_match:
            func_name = arrow_match.group(3)
            start_line = i + 1
            # 找箭头函数结束（找行尾或分号）
            end_line = _find_arrow_function_end(lines, i)
            outline["functions"].append({
                "name": func_name,
                "start_line": start_line,
                "end_line": end_line
            })
            i = end_line
            continue
        
        i += 1
    
    return outline


def _find_brace_end(lines: List[str], start_idx: int) -> int:
    """找匹配的 } 结束行"""
    brace_count = 0
    found_open = False
    
    for i in range(start_idx, len(lines)):
        line = lines[i]
        for ch in line:
            if ch == '{':
                brace_count += 1
                found_open = True
            elif ch == '}':
                brace_count -= 1
                if found_open and brace_count == 0:
                    return i + 1  # 返回行号（从1开始）
    
    return len(lines)


def _find_arrow_function_end(lines: List[str], start_idx: int) -> int:
    """找箭头函数结束"""
    i = start_idx
    while i < len(lines):
        if ';' in lines[i] or (i > start_idx and lines[i].strip() and not lines[i].strip().endswith(',')):
            # 如果下一行缩进减小，也结束
            if i + 1 < len(lines):
                next_line = lines[i + 1]
                if next_line.strip() and len(next_line) - len(next_line.lstrip()) <= 0:
                    return i + 1
            return i + 1
        i += 1
    return len(lines)


def _extract_go_outline(code: str) -> Dict[str, Any]:
    """Go大纲提取"""
    lines = code.split('\n')
    outline = {"classes": [], "functions": [], "imports": []}
    
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        
        # 提取导入
        if line.startswith('import '):
            outline["imports"].append({"text": line, "line": i + 1})
            i += 1
            continue
        
        # 提取struct
        struct_match = re.match(r'^type\s+(\w+)\s+struct', line)
        if struct_match:
            start_line = i + 1
            end_line = _find_brace_end(lines, i)
            outline["classes"].append({
                "name": struct_match.group(1),
                "start_line": start_line,
                "end_line": end_line,
                "methods": []
            })
            i = end_line
            continue
        
        # 提取interface
        interface_match = re.match(r'^type\s+(\w+)\s+interface', line)
        if interface_match:
            start_line = i + 1
            end_line = _find_brace_end(lines, i)
            outline["classes"].append({
                "name": interface_match.group(1),
                "start_line": start_line,
                "end_line": end_line,
                "methods": []
            })
            i = end_line
            continue
        
        # 提取函数
        func_match = re.match(r'^func\s+(\w+)', line) or re.match(r'^func\s+\([^)]+\)\s+(\w+)', line)
        if func_match:
            start_line = i + 1
            end_line = _find_brace_end(lines, i)
            outline["functions"].append({
                "name": func_match.group(1),
                "start_line": start_line,
                "end_line": end_line
            })
            i = end_line
            continue
        
        i += 1
    
    return outline


def _extract_vue_outline(code: str) -> Dict[str, Any]:
    """Vue大纲提取"""
    lines = code.split('\n')
    outline = {"classes": [], "functions": [], "imports": []}
    
    in_script = False
    script_lines = []
    script_start = 0
    
    for i, line in enumerate(lines):
        if '<script' in line:
            in_script = True
            script_start = i
            continue
        if '</script>' in line:
            in_script = False
            continue
        if in_script:
            script_lines.append(line)
    
    if script_lines:
        script_code = '\n'.join(script_lines)
        js_outline = _extract_js_outline(script_code)
        # 调整行号偏移
        for item in js_outline.get("classes", []):
            item["start_line"] += script_start + 1
            item["end_line"] += script_start + 1
            for method in item.get("methods", []):
                method["start_line"] += script_start + 1
                method["end_line"] += script_start + 1
        for item in js_outline.get("functions", []):
            item["start_line"] += script_start + 1
            item["end_line"] += script_start + 1
        for item in js_outline.get("imports", []):
            item["line"] += script_start + 1
        
        outline = js_outline
    
    return outline