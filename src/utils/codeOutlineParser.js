/**
 * 纯 JS 代码大纲解析器
 * 不依赖任何后端 API，纯正则匹配
 * @param {string} code - 源代码内容
 * @param {string} filePath - 文件路径（用于判断语言）
 * @returns {Array} [{ name, type, startLine, endLine? }]
 */
export function parseCodeOutline(code, filePath) {
  if (!code || !filePath) return []

  const ext = filePath.split('.').pop()?.toLowerCase() || ''
  const lines = code.split('\n')

  switch (ext) {
    case 'py':
      return parsePython(lines)
    case 'go':
      return parseGo(lines)
    case 'js':
    case 'jsx':
    case 'ts':
    case 'tsx':
      return parseJavaScript(lines)
    case 'java':
      return parseJava(lines)
    case 'vue':
      return parseVue(code, lines)
    case 'c':
    case 'cpp':
    case 'h':
    case 'hpp':
      return parseCpp(lines)
    default:
      return []
  }
}

// ============ Python ============
function parsePython(lines) {
  const result = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    const trimmed = line.trim()

    const classMatch = trimmed.match(/^class\s+(\w+)\s*[:\(]/)
    if (classMatch) {
      const endLine = findPythonBlockEnd(lines, i)
      result.push({ name: classMatch[1], type: 'class', startLine: i + 1, endLine })
      i = endLine
      continue
    }

    const funcMatch = trimmed.match(/^(async\s+)?def\s+(\w+)\s*\(/)
    if (funcMatch) {
      const endLine = findPythonBlockEnd(lines, i)
      result.push({ name: funcMatch[2], type: 'function', startLine: i + 1, endLine })
      i = endLine
      continue
    }

    i++
  }
  return result
}

function findPythonBlockEnd(lines, startIdx) {
  let indent = null
  for (let i = startIdx + 1; i < lines.length; i++) {
    const line = lines[i]
    if (line.trim() === '') continue
    const currentIndent = line.match(/^\s*/)[0].length
    if (indent === null) {
      indent = currentIndent
      continue
    }
    if (currentIndent <= indent) {
      return i
    }
  }
  return lines.length
}

// ============ Go ============
function parseGo(lines) {
  const result = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    const trimmed = line.trim()

    const structMatch = trimmed.match(/^type\s+(\w+)\s+struct\s*\{/)
    if (structMatch) {
      const endLine = findGoBlockEnd(lines, i)
      result.push({ name: structMatch[1], type: 'class', startLine: i + 1, endLine })
      i = endLine
      continue
    }

    const funcMatch = trimmed.match(/^func\s+(\w+)\s*\(/)
    if (funcMatch) {
      const endLine = findGoBlockEnd(lines, i)
      result.push({ name: funcMatch[1], type: 'function', startLine: i + 1, endLine })
      i = endLine
      continue
    }

    i++
  }
  return result
}

function findGoBlockEnd(lines, startIdx) {
  let braceCount = 0
  let started = false
  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i]
    for (const ch of line) {
      if (ch === '{') { braceCount++; started = true }
      else if (ch === '}') { braceCount-- }
    }
    if (started && braceCount === 0) {
      return i + 1
    }
  }
  return lines.length
}

// ============ JavaScript / TypeScript ============
function parseJavaScript(lines) {
  const result = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    const trimmed = line.trim()

    const classMatch = trimmed.match(/^(export\s+)?(default\s+)?class\s+(\w+)/)
    if (classMatch) {
      const endLine = findJSBlockEnd(lines, i)
      result.push({ name: classMatch[3], type: 'class', startLine: i + 1, endLine })
      i = endLine
      continue
    }

    const funcMatch = trimmed.match(/^(export\s+)?(async\s+)?function\s+(\w+)\s*\(/)
    if (funcMatch) {
      const endLine = findJSBlockEnd(lines, i)
      result.push({ name: funcMatch[3], type: 'function', startLine: i + 1, endLine })
      i = endLine
      continue
    }

    const arrowMatch = trimmed.match(/^(export\s+)?(const|let|var)\s+(\w+)\s*=\s*(async\s*)?\([^)]*\)\s*=>/)
    if (arrowMatch) {
      const endLine = findJSBlockEnd(lines, i)
      result.push({ name: arrowMatch[3], type: 'function', startLine: i + 1, endLine })
      i = endLine
      continue
    }

    i++
  }
  return result
}

function findJSBlockEnd(lines, startIdx) {
  let braceCount = 0
  let started = false
  let foundBrace = false
  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i]
    for (const ch of line) {
      if (ch === '{') { braceCount++; started = true; foundBrace = true }
      else if (ch === '}') { braceCount-- }
    }
    if (started && braceCount === 0 && foundBrace) {
      return i + 1
    }
  }
  return lines.length
}

// ============ Java ============
function parseJava(lines) {
  const result = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    const trimmed = line.trim()

    const classMatch = trimmed.match(/^(public\s+)?(abstract\s+)?class\s+(\w+)/)
    if (classMatch) {
      const endLine = findJavaBlockEnd(lines, i)
      result.push({ name: classMatch[3], type: 'class', startLine: i + 1, endLine })
      i = endLine
      continue
    }

    const methodMatch = trimmed.match(/^(public|private|protected)\s+(\w+)\s+(\w+)\s*\(/)
    if (methodMatch) {
      const endLine = findJavaBlockEnd(lines, i)
      result.push({ name: methodMatch[3], type: 'function', startLine: i + 1, endLine })
      i = endLine
      continue
    }

    i++
  }
  return result
}

function findJavaBlockEnd(lines, startIdx) {
  let braceCount = 0
  let started = false
  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i]
    for (const ch of line) {
      if (ch === '{') { braceCount++; started = true }
      else if (ch === '}') { braceCount-- }
    }
    if (started && braceCount === 0) {
      return i + 1
    }
  }
  return lines.length
}

// ============ Vue ============
function parseVue(code, lines) {
  const scriptMatch = code.match(/<script[^>]*>([\s\S]*?)<\/script>/)
  if (!scriptMatch) return []
  return parseJavaScript(scriptMatch[1].split('\n'))
}

// ============ C / C++ ============
function parseCpp(lines) {
  const result = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    const trimmed = line.trim()

    const classMatch = trimmed.match(/^class\s+(\w+)\s*\{?/)
    if (classMatch) {
      const endLine = findCppBlockEnd(lines, i)
      result.push({ name: classMatch[1], type: 'class', startLine: i + 1, endLine })
      i = endLine
      continue
    }

    const structMatch = trimmed.match(/^struct\s+(\w+)\s*\{?/)
    if (structMatch) {
      const endLine = findCppBlockEnd(lines, i)
      result.push({ name: structMatch[1], type: 'class', startLine: i + 1, endLine })
      i = endLine
      continue
    }

    const funcMatch = trimmed.match(/^(\w+)\s+(\w+)\s*\([^)]*\)\s*\{?$/)
    if (funcMatch && !isCppKeyword(funcMatch[1])) {
      const endLine = findCppBlockEnd(lines, i)
      result.push({ name: funcMatch[2], type: 'function', startLine: i + 1, endLine })
      i = endLine
      continue
    }

    i++
  }
  return result
}

function isCppKeyword(word) {
  const keywords = ['if', 'for', 'while', 'switch', 'return', 'void', 'int', 'char', 'float', 'double', 'bool', 'auto', 'const', 'static', 'inline', 'virtual', 'override', 'final', 'public', 'private', 'protected']
  return keywords.includes(word)
}

function findCppBlockEnd(lines, startIdx) {
  let braceCount = 0
  let started = false
  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i]
    for (const ch of line) {
      if (ch === '{') { braceCount++; started = true }
      else if (ch === '}') { braceCount-- }
    }
    if (started && braceCount === 0) {
      return i + 1
    }
  }
  return lines.length
}