/**
 * 文件图标映射工具
 * 根据文件后缀返回对应图标
 */

const ICON_MAP = {
  '.py': '🐍',
  '.js': '📜',
  '.vue': '🟢',
  '.json': '📋',
  '.md': '📖',
  '.html': '🌐',
  '.css': '🎨',
  '.scss': '🎨',
  '.less': '🎨',
  '.ts': '📘',
  '.tsx': '📘',
  '.jsx': '📘',
  '.go': '🐹',
  '.rs': '🦀',
  '.java': '☕',
  '.cpp': '⚙️',
  '.c': '⚙️',
  '.h': '⚙️',
  '.sh': '📜',
  '.bash': '📜',
  '.zsh': '📜',
  '.yml': '📋',
  '.yaml': '📋',
  '.toml': '📋',
  '.xml': '📋',
  '.svg': '🖼️',
  '.png': '🖼️',
  '.jpg': '🖼️',
  '.jpeg': '🖼️',
  '.gif': '🖼️',
  '.ico': '🖼️',
  '.mp4': '🎬',
  '.mp3': '🎵',
  '.wav': '🎵',
  '.zip': '📦',
  '.tar': '📦',
  '.gz': '📦',
  '.7z': '📦',
  '.exe': '⚙️',
  '.dll': '⚙️',
  '.so': '⚙️',
  '.dylib': '⚙️',
  '.lock': '🔒',
  '.gitignore': '🚫',
  '.env': '🔑',
  '.dockerfile': '🐳',
  '.toml': '📋',
}

const DEFAULT_ICON = '📄'
const FOLDER_OPEN = '📂'
const FOLDER_CLOSED = '📁'

/**
 * 根据文件名获取图标
 * @param {string} fileName - 文件名
 * @param {boolean} isDirectory - 是否是目录
 * @param {boolean} isExpanded - 目录是否展开
 * @returns {string} 图标字符
 */
export function getFileIcon(fileName, isDirectory = false, isExpanded = false) {
  if (isDirectory) {
    return isExpanded ? FOLDER_OPEN : FOLDER_CLOSED
  }

  if (!fileName || typeof fileName !== 'string') return DEFAULT_ICON

  const ext = fileName.includes('.') ? '.' + fileName.split('.').pop().toLowerCase() : ''
  return ICON_MAP[ext] || DEFAULT_ICON
}