// electron/utils/path-guard.js
// 路径白名单守卫：只允许在【应用根】与【用户打开的项目根】范围内做文件操作，
// 拦截 ../../ 穿越与任意绝对路径读写（体检 TOP1 修复）。
const path = require('path')

// 允许的文件操作根目录集合
const allowedRoots = new Set()

// 应用根目录（项目根，保证 http.js 等相对路径读取可用）
const appRoot = path.resolve(__dirname, '..', '..')
allowedRoots.add(appRoot)

/**
 * 登记一个允许访问的根目录（如用户打开的项目目录）
 */
function registerRoot(root) {
  if (typeof root !== 'string' || !root.trim()) return false
  const abs = path.resolve(root.trim())
  allowedRoots.add(abs)
  return true
}

/**
 * 移除一个根目录（应用根不可移除）
 */
function removeRoot(root) {
  if (typeof root !== 'string') return
  const abs = path.resolve(root)
  if (abs === appRoot) return
  allowedRoots.delete(abs)
}

/**
 * 判断目标路径是否位于允许的根目录之内
 * Windows 下路径比较忽略大小写
 */
function isPathAllowed(target) {
  if (typeof target !== 'string' || !target.trim()) return false
  const abs = path.resolve(target.trim())
  const normalized = process.platform === 'win32' ? abs.toLowerCase() : abs
  for (const root of allowedRoots) {
    const rootNorm = process.platform === 'win32' ? root.toLowerCase() : root
    if (normalized === rootNorm || normalized.startsWith(rootNorm + path.sep)) {
      return true
    }
  }
  return false
}

module.exports = {
  registerRoot,
  removeRoot,
  isPathAllowed,
  getRoots: () => Array.from(allowedRoots),
}
