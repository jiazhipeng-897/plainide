/**
 * 文件树构建工具
 * 将扁平的文件列表构建为嵌套树形结构
 */

/**
 * 根据扁平文件列表构建树形目录结构
 * @param {Array} files - 扁平的文件列表
 * @param {string} rootPath - 根目录路径
 * @returns {Array} 树形结构的文件节点数组
 */
export function buildFileTree(files, rootPath) {
  if (!files || files.length === 0) return []

  const tree = []
  const map = new Map()

  const sortedFiles = [...files].sort((a, b) => {
    const depthA = (a.relativePath || '').split('/').length
    const depthB = (b.relativePath || '').split('/').length
    return depthA - depthB
  })

  sortedFiles.forEach((file) => {
    let relPath = file.relativePath || file.path
    if (relPath.startsWith(rootPath)) {
      relPath = relPath.substring(rootPath.length).replace(/^[\\/]/, '')
    }
    relPath = relPath.replace(/\\/g, '/')
    
    const parts = relPath.split('/').filter(p => p !== '')
    if (parts.length === 0) return

    let currentLevel = tree
    let currentPath = ''

    parts.forEach((part, index) => {
      const isLast = index === parts.length - 1
      currentPath = currentPath ? `${currentPath}/${part}` : part

      if (isLast) {
        let existing = currentLevel.find(node => node.name === part)
        
        if (existing) {
          if (file.isDirectory) {
            existing.isDirectory = true
            existing.children = existing.children || []
            existing.path = file.path
            existing.size = file.size || 0
            existing.modifiedTime = file.modifiedTime
            existing.extension = file.extension || ''
            existing.isCode = file.isCode || false
          }
        } else {
          const node = {
            path: file.path,
            name: part,
            isDirectory: file.isDirectory || false,
            size: file.size || 0,
            modifiedTime: file.modifiedTime || Date.now(),
            extension: file.extension || '',
            isCode: file.isCode || false,
            children: file.isDirectory ? [] : undefined
          }
          currentLevel.push(node)
          if (node.isDirectory) {
            map.set(currentPath, node)
          }
        }
      } else {
        let existing = currentLevel.find(node => node.name === part && node.isDirectory === true)
        
        if (!existing) {
          const virtualPath = parts.slice(0, index + 1).join('/')
          let realPath = rootPath + '/' + virtualPath
          const childFile = sortedFiles.find(f => {
            const r = (f.relativePath || f.path).replace(/\\/g, '/')
            return r.startsWith(virtualPath + '/') || r === virtualPath
          })
          if (childFile) {
            const childRel = (childFile.relativePath || childFile.path).replace(/\\/g, '/')
            const base = childRel.substring(0, childRel.lastIndexOf('/'))
            if (base === virtualPath) {
              realPath = childFile.path.substring(0, childFile.path.lastIndexOf('/'))
            }
          }
          
          existing = {
            path: realPath || rootPath + '/' + virtualPath,
            name: part,
            isDirectory: true,
            children: [],
            isCode: false,
            extension: '',
            size: 0,
            modifiedTime: Date.now()
          }
          currentLevel.push(existing)
          map.set(currentPath, existing)
        }
        
        currentLevel = existing.children
      }
    })
  })

  return tree
}
