/**
 * 树形结构通用工具函数
 * 文件树遍历、扁平化、提取等通用操作
 */

/**
 * 将文件树扁平化为所有文件节点数组（仅文件，不含目录）
 * @param {Array} tree - 文件树节点数组
 * @returns {Array} 所有文件节点的扁平数组
 */
export function flattenFileTree(tree) {
  const files = []

  const traverse = (nodes) => {
    if (!nodes || !Array.isArray(nodes)) return
    for (const node of nodes) {
      if (node.isDirectory) {
        traverse(node.children || [])
      } else {
        files.push(node)
      }
    }
  }

  traverse(tree)
  return files
}

/**
 * 从文件树中提取所有文件名
 * @param {Array} fileTree - 文件树
 * @returns {Array} 文件名数组
 */
export function extractFileNames(fileTree) {
  const names = []

  const traverse = (node) => {
    if (!node) return
    if (!node.isDirectory && node.name) {
      names.push(node.name)
    }
    if (node.children) {
      node.children.forEach(traverse)
    }
  }

  if (Array.isArray(fileTree)) {
    fileTree.forEach(traverse)
  } else {
    traverse(fileTree)
  }

  return names
}

/**
 * 构建文件树（从路径列表构建嵌套目录结构）
 * @param {Array} files - 文件路径列表
 * @param {string} rootPath - 根路径
 * @returns {Array} 文件树
 */
export function buildFileTree(files, rootPath) {
  const root = []
  const map = new Map()

  const ensureDir = (dirPath) => {
    if (map.has(dirPath)) return map.get(dirPath)

    const dirName = dirPath === rootPath ? '' : dirPath.split(/[\\/]/).pop()
    const dirNode = {
      name: dirName,
      path: dirPath,
      isDirectory: true,
      children: [],
    }
    map.set(dirPath, dirNode)

    if (dirPath === rootPath) {
      root.push(dirNode)
    } else {
      const parentPath = dirPath.substring(0, dirPath.lastIndexOf(/[\\/]/.exec(dirPath)?.index ?? dirPath.length - 1))
      const parent = ensureDir(parentPath)
      parent.children.push(dirNode)
    }

    return dirNode
  }

  for (const filePath of files) {
    const lastSep = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'))
    const dirPath = lastSep > -1 ? filePath.substring(0, lastSep) : ''
    const fileName = lastSep > -1 ? filePath.substring(lastSep + 1) : filePath

    const parent = dirPath ? ensureDir(dirPath) : root
    parent.children.push({
      name: fileName,
      path: filePath,
      isDirectory: false,
    })
  }

  return root
}
