# core/tree_sitter_parser.py
"""
tree-sitter 真实解析器封装（v3：嵌套树输出）
支持 Python, JavaScript, TypeScript, TSX, Vue（script 部分走 TypeScript 语法）

输出约定（v3 变更：直接输出嵌套树，不再依赖前端按行号构树）：
- root: { type, nodeType, text, start{line,column}, end{line,column}, children:[顶层节点] }
- 节点: { type, nodeType, name, text, start{line,column}, end{line,column},
          children:[子节点], params? }
  - class 节点 children = [方法, 字段]
  - function 节点 children = [嵌套函数]
  - line 为 1-based，column 为 0-based
"""

from pathlib import Path
from typing import Optional, Dict, Any, List
import re

from tree_sitter import Language, Parser
import tree_sitter_python
import tree_sitter_javascript
import tree_sitter_typescript


# ========== 语言对象（真实 tree-sitter grammar） ==========
_LANGUAGES = {
    "python": Language(tree_sitter_python.language()),
    "javascript": Language(tree_sitter_javascript.language()),
    "typescript": Language(tree_sitter_typescript.language_typescript()),
    "tsx": Language(tree_sitter_typescript.language_tsx()),
}


# ========== 语言映射 ==========
LANGUAGE_MAP = {
    ".py": "python",
    ".js": "javascript",
    ".mjs": "javascript",
    ".cjs": "javascript",
    ".jsx": "tsx",
    ".ts": "typescript",
    ".tsx": "tsx",
    ".vue": "vue",
}


def get_language_for_file(file_path: str) -> Optional[str]:
    """根据文件扩展名获取语言"""
    ext = Path(file_path).suffix.lower()
    return LANGUAGE_MAP.get(ext)


def _resolve_grammar(lang: Optional[str]) -> Optional[Language]:
    """把对外语言名解析为 tree-sitter Language 对象（不支持返回 None）"""
    if not lang:
        return None
    key = {
        "python": "python", "py": "python",
        "javascript": "javascript", "js": "javascript",
        "typescript": "typescript", "ts": "typescript",
        "tsx": "tsx", "jsx": "tsx",
        "vue": "typescript",  # vue 的 script 部分用 TypeScript 语法解析
    }.get(str(lang).lower())
    return _LANGUAGES.get(key)


# ========== 节点工具 ==========

def _node_text(node, source_bytes: bytes, limit: int = 500) -> str:
    """提取节点源码文本（截断防止超长 payload）"""
    if node is None:
        return ''
    try:
        text = source_bytes[node.start_byte:node.end_byte].decode('utf-8')
    except Exception:
        text = ''
    if len(text) > limit:
        text = text[:limit] + '…'
    return text


def _point_start(node) -> Dict[str, int]:
    return {"line": node.start_point[0] + 1, "column": node.start_point[1]}


def _point_end(node) -> Dict[str, int]:
    return {"line": node.end_point[0] + 1, "column": node.end_point[1]}


def _name_of(node, source_bytes: bytes) -> str:
    """提取具名节点（class/function/interface 等）的名字"""
    if node.type in ("identifier", "type_identifier", "property_identifier"):
        return _node_text(node, source_bytes, 200).strip()
    c = node.child_by_field_name("name")
    if c is not None:
        name = _node_text(c, source_bytes, 200).strip()
        if name:
            return name
    for c in node.children:
        if c.type in ("identifier", "type_identifier", "property_identifier"):
            name = _node_text(c, source_bytes, 200).strip()
            if name:
                return name
    return ''


def _params_of(node, source_bytes: bytes) -> List[str]:
    """提取函数参数列表（参数名或参数文本，精简）"""
    p = node.child_by_field_name("parameters")
    if p is None:
        return []
    params: List[str] = []
    for c in p.named_children:
        if c.type in ("identifier", "typed_parameter", "required_parameter",
                      "optional_parameter", "default_parameter", "formal_parameter",
                      "pattern", "rest_pattern"):
            text = _node_text(c, source_bytes, 100).strip()
            if text:
                params.append(text)
    return params


def _mk_node(node, source_bytes: bytes, node_type: str, name: str,
             params: Optional[List[str]] = None) -> Dict[str, Any]:
    return {
        "type": node_type,
        "nodeType": node_type,
        "name": name,
        "text": _node_text(node, source_bytes),
        "start": _point_start(node),
        "end": _point_end(node),
        "children": [],
        **( {"params": params} if params else {} ),
    }


# ========== Python 收集（嵌套） ==========

def _append_nested_python_functions(fn: Dict, fn_ts_node, source: bytes):
    """函数/方法节点内收集嵌套函数定义"""
    body = fn_ts_node.child_by_field_name("body")
    if body is None:
        return
    for stmt in body.named_children:
        if stmt.type == "function_definition":
            fn["children"].append(
                _mk_node(stmt, source, "function_definition",
                         _name_of(stmt, source), _params_of(stmt, source)))


def _collect_python(node, source: bytes) -> List[Dict]:
    """Python 模块 → 嵌套节点：import / class(方法+字段) / function(内嵌函数)"""
    out: List[Dict] = []

    def walk(n):
        t = n.type
        if t == "import_statement":
            out.append(_mk_node(n, source, "import_statement", "import", []))
        elif t == "decorated_definition":
            inner = next((c for c in n.children if c.type in
                          ("class_definition", "function_definition")), None)
            if inner is not None:
                walk(inner)
        elif t == "class_definition":
            cls = _mk_node(n, source, "class_definition", _name_of(n, source), [])
            block = n.child_by_field_name("body")
            if block is not None:
                for stmt in block.named_children:
                    if stmt.type == "function_definition":
                        m = _mk_node(stmt, source, "function_definition",
                                     _name_of(stmt, source), _params_of(stmt, source))
                        _append_nested_python_functions(m, stmt, source)
                        cls["children"].append(m)
                    elif stmt.type in ("expression_statement", "assignment", "annotated_assignment"):
                        # 类字段：a = 1 / a: int = 1
                        assign = stmt if stmt.type in ("assignment", "annotated_assignment") else None
                        if assign is None:
                            assign = next((c for c in stmt.children if c.type in ("assignment", "annotated_assignment")), None)
                        if assign is not None:
                            left = assign.child_by_field_name("left")
                            name = _name_of(left, source) if left is not None else ''
                            if name:
                                cls["children"].append(
                                    _mk_node(assign, source, "field_definition", name, []))
            out.append(cls)
        elif t == "function_definition":
            fn = _mk_node(n, source, "function_definition",
                          _name_of(n, source), _params_of(n, source))
            _append_nested_python_functions(fn, n, source)
            out.append(fn)

    for child in node.named_children:
        walk(child)
    return out


# ========== JS / TS / TSX 收集（嵌套） ==========

def _collect_js(node, source: bytes) -> List[Dict]:
    """JS/TS 模块 → 嵌套节点：import / class(方法+字段) / function(嵌套) / interface / type alias"""
    out: List[Dict] = []

    def walk(n):
        t = n.type
        if t == "import_statement":
            out.append(_mk_node(n, source, "import_statement", "import", []))
        elif t == "export_statement":
            decl = n.child_by_field_name("declaration")
            if decl is not None and decl.type in (
                    "class_declaration", "function_declaration",
                    "variable_declaration", "lexical_declaration",
                    "interface_declaration", "type_alias_declaration",
                    "abstract_class_declaration"):
                walk(decl)
        elif t in ("class_declaration", "abstract_class_declaration"):
            cls = _mk_node(n, source, "class_declaration", _name_of(n, source), [])
            body = n.child_by_field_name("body")
            if body is not None:
                for stmt in body.named_children:
                    if stmt.type == "method_definition":
                        cls["children"].append(
                            _mk_node(stmt, source, "method_definition",
                                     _name_of(stmt, source), _params_of(stmt, source)))
                    elif stmt.type in ("field_definition", "property_definition",
                                       "public_field_definition"):
                        name = _name_of(stmt, source)
                        if name:
                            cls["children"].append(
                                _mk_node(stmt, source, "field_definition", name, []))
            out.append(cls)
        elif t == "function_declaration":
            fn = _mk_node(n, source, "function_declaration",
                          _name_of(n, source), _params_of(n, source))
            _collect_nested_js_functions(fn, n, source)
            out.append(fn)
        elif t in ("variable_declaration", "lexical_declaration"):
            # const foo = () => {} / const foo = function () {} → 函数节点
            for decl in n.named_children:
                if decl.type == "variable_declarator":
                    value = decl.child_by_field_name("value")
                    name = _name_of(decl, source)
                    if value is not None and value.type in (
                            "arrow_function", "function_expression", "generator_function"):
                        fn = _mk_node(decl, source, "function_declaration",
                                      name, _params_of(value, source))
                        _collect_nested_js_functions(fn, value, source)
                        out.append(fn)
        elif t == "interface_declaration":
            out.append(_mk_node(n, source, "interface_declaration", _name_of(n, source), []))
        elif t == "type_alias_declaration":
            out.append(_mk_node(n, source, "type_alias_declaration", _name_of(n, source), []))

    for child in node.named_children:
        walk(child)
    return out


def _collect_nested_js_functions(fn_node: Dict, fn_ts_node, source: bytes):
    """函数节点内收集嵌套函数（闭包/内部声明）"""
    body = fn_ts_node.child_by_field_name("body")
    if body is None:
        return
    for stmt in body.named_children:
        t = stmt.type
        if t == "function_declaration":
            fn_node["children"].append(
                _mk_node(stmt, source, "function_declaration",
                         _name_of(stmt, source), _params_of(stmt, source)))
        elif t in ("variable_declaration", "lexical_declaration"):
            for decl in stmt.named_children:
                if decl.type == "variable_declarator":
                    value = decl.child_by_field_name("value")
                    name = _name_of(decl, source)
                    if value is not None and value.type in (
                            "arrow_function", "function_expression"):
                        fn_node["children"].append(
                            _mk_node(decl, source, "function_declaration",
                                     name, _params_of(value, source)))
        elif t == "expression_statement":
            # IIFE 等表达式内嵌函数（适度，只收直接 function_expression）
            expr = stmt.child_by_field_name("expression")
            if expr is not None and expr.type == "call_expression":
                callee = expr.child_by_field_name("function")
                if callee is not None and callee.type == "function_expression":
                    fn_node["children"].append(
                        _mk_node(callee, source, "function_declaration",
                                 "anonymous", _params_of(callee, source)))


# ========== Vue script 块提取 ==========

def _extract_script_block(code: str):
    """提取 Vue SFC 的 <script> 块内容与内容起始行号（1-based）。
    返回 (content, start_line)；无 script 块时返回 ('', 1)。"""
    m = re.search(r'<script[^>]*>(.*?)</script>', code, re.S)
    if not m:
        return '', 1
    content = m.group(1)
    start_line = code[:m.start()].count('\n') + 2
    return content, start_line


# ========== 通用回退 ==========

def _collect_generic(text: str, out: List[Dict]):
    """通用：无语法树时按行提取非注释行（仅作兜底，不会命中已支持语言）"""
    for i, line in enumerate(text.split('\n')):
        stripped = line.strip()
        if stripped and not stripped.startswith(('#', '//', '/*')):
            out.append({
                "type": "statement", "nodeType": "statement", "name": "statement",
                "text": stripped[:200], "start": {"line": i + 1, "column": 0},
                "end": {"line": i + 1, "column": len(line)}, "children": [],
            })


# ========== 对外入口 ==========

def parse_code(code: str, lang: str) -> Optional[Dict[str, Any]]:
    """
    真实 tree-sitter 解析代码为嵌套 AST 树。
    不支持的语法树语言回退为行级兜底。
    """
    if not code:
        return None
    source = code.encode('utf-8')
    grammar = _resolve_grammar(lang)
    root = {
        "type": "module",
        "nodeType": "module",
        "text": code[:500],
        "start": {"line": 1, "column": 0},
        "end": {"line": code.count('\n') + 1, "column": len(code.rsplit('\n', 1)[-1])},
        "children": [],
    }

    if grammar is None:
        _collect_generic(code, root["children"])
        return root

    if str(lang).lower() == 'vue':
        # Vue SFC：只解析 <script> 块内容（TypeScript 语法），并偏移行号
        script_content, script_start_line = _extract_script_block(code)
        if not script_content:
            return root
        try:
            script_source = script_content.encode('utf-8')
            parser = Parser(_LANGUAGES['typescript'])
            tree = parser.parse(script_source)
            root["children"] = _collect_js(tree.root_node, script_source)
            for child in root["children"]:
                _shift_lines(child, script_start_line - 1)
        except Exception:
            pass
        return root

    try:
        parser = Parser(grammar)
        tree = parser.parse(source)
        tree_root = tree.root_node
        if lang.lower() in ("python", "py"):
            root["children"] = _collect_python(tree_root, source)
        elif lang.lower() in ("javascript", "js", "typescript", "ts", "tsx", "jsx"):
            root["children"] = _collect_js(tree_root, source)
    except Exception:
        # 解析失败时兜底为行级结构，保证接口不崩
        _collect_generic(code, root["children"])
    return root


def _shift_lines(node: Dict, delta: int):
    """递归偏移节点行号（vue script 块对齐用）"""
    node["start"]["line"] += delta
    node["end"]["line"] += delta
    for child in node.get("children", []):
        _shift_lines(child, delta)


def extract_outline(code: str, lang: str) -> Optional[Dict[str, Any]]:
    """
    从真实语法树提取大纲：{classes, functions, imports}
    - classes: [{name, start_line, end_line, methods:[{name,start_line,end_line,params}]}]
    - functions: 顶层函数 [{name, start_line, end_line, params}]
    - imports: [{line, text}]
    """
    if not code:
        return None
    source = code.encode('utf-8')
    grammar = _resolve_grammar(lang)
    if grammar is None:
        return {"classes": [], "functions": [], "imports": []}

    classes: List[Dict[str, Any]] = []
    functions: List[Dict[str, Any]] = []
    imports: List[Dict[str, Any]] = []

    try:
        parser = Parser(grammar)
        tree = parser.parse(source)
        tree_root = tree.root_node

        def walk_py(n):
            t = n.type
            if t == "import_statement":
                imports.append({"line": n.start_point[0] + 1, "text": _node_text(n, source, 200)})
            elif t == "decorated_definition":
                inner = next((c for c in n.children if c.type in
                              ("class_definition", "function_definition")), None)
                if inner is not None:
                    walk_py(inner)
            elif t == "class_definition":
                cls = {"name": _name_of(n, source),
                       "start_line": n.start_point[0] + 1, "end_line": n.end_point[0] + 1,
                       "methods": []}
                block = n.child_by_field_name("body")
                if block is not None:
                    for stmt in block.named_children:
                        if stmt.type == "function_definition":
                            cls["methods"].append({
                                "name": _name_of(stmt, source),
                                "start_line": stmt.start_point[0] + 1,
                                "end_line": stmt.end_point[0] + 1,
                                "params": _params_of(stmt, source),
                            })
                classes.append(cls)
            elif t == "function_definition":
                functions.append({
                    "name": _name_of(n, source),
                    "start_line": n.start_point[0] + 1,
                    "end_line": n.end_point[0] + 1,
                    "params": _params_of(n, source),
                })

        def walk_js(n):
            t = n.type
            if t == "import_statement":
                imports.append({"line": n.start_point[0] + 1, "text": _node_text(n, source, 200)})
            elif t == "export_statement":
                decl = n.child_by_field_name("declaration")
                if decl is not None and decl.type in (
                        "class_declaration", "function_declaration",
                        "interface_declaration", "type_alias_declaration",
                        "variable_declaration", "lexical_declaration",
                        "abstract_class_declaration"):
                    walk_js(decl)
            elif t in ("class_declaration", "abstract_class_declaration"):
                cls = {"name": _name_of(n, source),
                       "start_line": n.start_point[0] + 1, "end_line": n.end_point[0] + 1,
                       "methods": []}
                body = n.child_by_field_name("body")
                if body is not None:
                    for stmt in body.named_children:
                        if stmt.type == "method_definition":
                            cls["methods"].append({
                                "name": _name_of(stmt, source),
                                "start_line": stmt.start_point[0] + 1,
                                "end_line": stmt.end_point[0] + 1,
                                "params": _params_of(stmt, source),
                            })
                classes.append(cls)
            elif t == "function_declaration":
                functions.append({
                    "name": _name_of(n, source),
                    "start_line": n.start_point[0] + 1,
                    "end_line": n.end_point[0] + 1,
                    "params": _params_of(n, source),
                })
            elif t in ("variable_declaration", "lexical_declaration"):
                for decl in n.named_children:
                    if decl.type == "variable_declarator":
                        value = decl.child_by_field_name("value")
                        if value is not None and value.type in (
                                "arrow_function", "function_expression", "generator_function"):
                            functions.append({
                                "name": _name_of(decl, source),
                                "start_line": decl.start_point[0] + 1,
                                "end_line": decl.end_point[0] + 1,
                                "params": _params_of(value, source),
                            })

        if lang.lower() in ("python", "py"):
            for child in tree_root.named_children:
                walk_py(child)
        else:
            for child in tree_root.named_children:
                walk_js(child)
    except Exception:
        return {"classes": [], "functions": [], "imports": []}

    return {"classes": classes, "functions": functions, "imports": imports}


# ========== Vue SFC 支持 ==========

def parse_vue_sfc(code: str) -> Dict[str, Any]:
    """
    解析 Vue 单文件组件
    返回: {"root": ast, "vueBlocks": {...}}
    script 块内容用真实 tree-sitter TypeScript 语法解析，并做行号偏移
    """
    lines = code.split('\n')
    vue_blocks = {"template": None, "script": None, "style": None}

    current_block = None
    block_start = 0
    block_content: List[str] = []
    block_tag_start = 0

    for i, line in enumerate(lines):
        stripped = line.strip()

        if stripped.startswith('<template'):
            current_block = 'template'
            block_start = i
            block_tag_start = i
            block_content = []
            continue
        if stripped.startswith('<script'):
            current_block = 'script'
            block_start = i
            block_tag_start = i
            block_content = []
            continue
        if stripped.startswith('<style'):
            current_block = 'style'
            block_start = i
            block_tag_start = i
            block_content = []
            continue

        if stripped.startswith('</template>') or stripped.startswith('</script>') or stripped.startswith('</style>'):
            if current_block:
                content_start = block_start + 1
                for j in range(block_start + 1, i):
                    if lines[j].strip():
                        content_start = j
                        break

                vue_blocks[current_block] = {
                    "content": '\n'.join(block_content),
                    "start_line": content_start + 1,
                    "end_line": i + 1,
                    "tag_start_line": block_tag_start + 1,
                }
                current_block = None
            continue

        if current_block:
            block_content.append(line)

    # root：parse_code 已对 vue 走 script 块真实解析（含行号偏移）
    root = parse_code(code, "vue")
    if root is None:
        root = {"type": "module", "nodeType": "module", "text": code[:500],
                "start": {"line": 1, "column": 0},
                "end": {"line": len(lines), "column": len(lines[-1]) if lines else 0},
                "children": []}
    if root.get("children"):
        vue_blocks["script"]["ast"] = root

    return {"root": root, "vueBlocks": vue_blocks}
