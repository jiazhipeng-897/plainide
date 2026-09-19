# core/ast_traverser.py
"""
AST 遍历器 - 只负责语法树的遍历和基础操作
不涉及大纲提取
"""

from typing import List, Dict, Any, Optional


def get_language_config(lang: str) -> Dict[str, Any]:
    """各语言的节点类型配置"""
    lang = lang.lower()
    
    configs = {
        "python": {
            "function_types": {"function_definition", "async_function_definition"},
            "class_types": {"class_definition"},
            "name_types": {"identifier", "name"},
            "param_types": {"parameters", "formal_parameters"},
            "param_name_types": {"identifier", "name", "parameter"},
            "decorator_types": {"decorator"},
        },
        "go": {
            "function_types": {"function_declaration", "method_declaration"},
            "class_types": {"struct_declaration", "interface_declaration"},
            "name_types": {"identifier", "field_identifier", "type_identifier"},
            "param_types": {"parameter_declaration", "parameter_list"},
            "param_name_types": {"identifier", "field_identifier"},
            "decorator_types": {},
        },
        "javascript": {
            "function_types": {"function_declaration", "function_expression", "arrow_function"},
            "class_types": {"class_declaration"},
            "name_types": {"identifier", "name", "property_identifier"},
            "param_types": {"formal_parameters", "parameters"},
            "param_name_types": {"identifier", "name"},
            "decorator_types": {},
        },
        "typescript": {
            "function_types": {"function_declaration", "function_expression", "arrow_function"},
            "class_types": {"class_declaration"},
            "name_types": {"identifier", "name", "property_identifier"},
            "param_types": {"formal_parameters", "parameters"},
            "param_name_types": {"identifier", "name"},
            "decorator_types": {},
        },
        "vue": {
            "function_types": {"function_declaration", "function_expression", "arrow_function"},
            "class_types": {"class_declaration"},
            "name_types": {"identifier", "name", "property_identifier"},
            "param_types": {"formal_parameters", "parameters"},
            "param_name_types": {"identifier", "name"},
            "decorator_types": {},
        },
    }
    
    for key in configs:
        if lang.startswith(key):
            return configs[key]
    
    return configs.get("python", {})


def traverse_ast(ast_node: Dict[str, Any], lang: str = "python") -> Dict[str, Any]:
    """
    遍历AST，只做基础处理
    不修改原始AST结构
    """
    if not ast_node:
        return {}
    
    # 复制一份，避免修改原始AST
    result = _copy_node(ast_node)
    
    # 递归处理子节点
    if "children" in result:
        result["children"] = [traverse_ast(child, lang) for child in result["children"]]
    
    return result


def _copy_node(node: Dict[str, Any]) -> Dict[str, Any]:
    """复制节点（浅拷贝，但足够用）"""
    if not node:
        return {}
    
    # 只复制需要的字段，避免污染
    return {
        "type": node.get("type", ""),
        "nodeType": node.get("nodeType", ""),
        "text": node.get("text", ""),
        "start": node.get("start", {}),
        "end": node.get("end", {}),
        "children": node.get("children", []),
        # 保留其他可能需要的字段
        **{k: v for k, v in node.items() if k not in ["type", "nodeType", "text", "start", "end", "children"]}
    }


def get_node_type(ast_node: Dict[str, Any]) -> str:
    """获取节点类型"""
    return ast_node.get("nodeType", "") or ast_node.get("type", "")


def get_node_text(ast_node: Dict[str, Any]) -> str:
    """获取节点文本"""
    return ast_node.get("text", "")


def get_node_location(ast_node: Dict[str, Any]) -> Dict[str, int]:
    """获取节点位置"""
    return {
        "start_line": ast_node.get("start", {}).get("line", 0),
        "start_col": ast_node.get("start", {}).get("column", 0),
        "end_line": ast_node.get("end", {}).get("line", 0),
        "end_col": ast_node.get("end", {}).get("column", 0),
    }


def find_nodes_by_type(ast_node: Dict[str, Any], node_type: str) -> List[Dict[str, Any]]:
    """在AST中查找指定类型的节点（只读）"""
    result = []
    
    if get_node_type(ast_node) == node_type:
        result.append(ast_node)
    
    for child in ast_node.get("children", []):
        result.extend(find_nodes_by_type(child, node_type))
    
    return result


def get_ast_summary(ast_node: Dict[str, Any]) -> Dict[str, Any]:
    """
    获取AST摘要信息（不提取大纲）
    只返回节点数量、深度等统计信息
    """
    if not ast_node:
        return {"total_nodes": 0, "max_depth": 0}
    
    stats = _count_nodes(ast_node)
    return stats


def _count_nodes(node: Dict[str, Any], depth: int = 0) -> Dict[str, Any]:
    """统计节点数量"""
    stats = {
        "total_nodes": 1,
        "max_depth": depth,
        "node_types": {get_node_type(node): 1}
    }
    
    for child in node.get("children", []):
        child_stats = _count_nodes(child, depth + 1)
        stats["total_nodes"] += child_stats["total_nodes"]
        stats["max_depth"] = max(stats["max_depth"], child_stats["max_depth"])
        
        for ntype, count in child_stats["node_types"].items():
            stats["node_types"][ntype] = stats["node_types"].get(ntype, 0) + count
    
    return stats
