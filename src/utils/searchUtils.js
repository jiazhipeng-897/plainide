/**
 * 文本搜索匹配工具函数
 */

/**
 * 在文本内容中查找关键词匹配
 * @param {string} content - 文本内容
 * @param {string} keyword - 搜索关键词
 * @returns {Array} 匹配结果数组，每项含 line（行号）、content（行内容）
 */
export function findTextMatches(content, keyword) {
  if (!content || !keyword) return []

  const lines = content.split('\n')
  const matches = []
  const regex = new RegExp(keyword, 'gi')

  lines.forEach((line, index) => {
    regex.lastIndex = 0
    if (regex.test(line)) {
      matches.push({
        line: index + 1,
        content: line.trim() || line,
      })
    }
  })

  return matches
}
