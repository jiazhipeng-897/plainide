/**
 * AST 语法树工具函数
 * 处理 AST 节点的树形结构构建
 */

/**
 * 将扁平 AST 节点数组转换为嵌套树形结构
 * 根据节点的起止行号自动计算父子层级关系
 * @param {Array} nodes - 扁平的 AST 节点数组
 * @returns {Array} 嵌套树形结构的节点数组
 */
export function buildASTTree(nodes) {
  if (!nodes || nodes.length === 0) return []

  const flat = JSON.parse(JSON.stringify(nodes))

  flat.forEach(n => {
    if (!n.children) n.children = []
  })

  const result = []
  const stack = []

  for (const node of flat) {
    const start = node.start?.line || 0
    const end = node.end?.line || 0

    while (stack.length > 0 && stack[stack.length - 1].end <= start) {
      stack.pop()
    }

    if (stack.length === 0) {
      result.push(node)
    } else {
      const parent = stack[stack.length - 1]
      parent.children.push(node)
    }

    if (end > start) {
      stack.push(node)
    }
  }

  return result
}
