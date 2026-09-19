/**
 * 编辑器语言映射表
 * 全项目唯一语言映射，统一维护，新增语言只需在此处添加
 * 统一维护，新增语言只需在此处添加
 */
export const LANGUAGE_MAP = {
  // 前端
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  vue: 'html', // Monaco 无内置 vue 语言，按 html 处理以获得高亮
  html: 'html',
  htm: 'html',
  css: 'css',
  scss: 'scss',
  sass: 'scss',
  less: 'less',
  styl: 'stylus',

  // 后端
  py: 'python',
  pyw: 'python',
  java: 'java',
  kt: 'kotlin',
  go: 'go',
  rs: 'rust',
  rb: 'ruby',
  php: 'php',
  cs: 'csharp',
  c: 'c',
  cpp: 'cpp',
  cxx: 'cpp',
  h: 'c',
  hpp: 'cpp',

  // 脚本/配置
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  bat: 'bat',
  cmd: 'bat',
  ps1: 'powershell',
  json: 'json',
  jsonc: 'json',
  yaml: 'yaml',
  yml: 'yaml',
  toml: 'toml',
  ini: 'ini',
  conf: 'ini',
  env: 'ini',
  xml: 'xml',
  svg: 'xml',

  // 数据/文档
  md: 'markdown',
  markdown: 'markdown',
  sql: 'sql',
  csv: 'plaintext',

  // 其他
  txt: 'plaintext',
  log: 'plaintext',
}

/**
 * 默认语言（识别失败时回退）
 */
export const DEFAULT_LANGUAGE = 'plaintext'

/**
 * 根据文件名获取对应的 Monaco 语言标识
 * @param {string} fileName - 文件名或完整路径
 * @returns {string} Monaco 语言标识，未知类型返回 'plaintext'
 */
export function detectLanguage(fileName) {
  if (!fileName || typeof fileName !== 'string') return DEFAULT_LANGUAGE
  const ext = fileName.split('.').pop().toLowerCase()
  return LANGUAGE_MAP[ext] || DEFAULT_LANGUAGE
}