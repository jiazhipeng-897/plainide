/**
 * Monaco 编辑器自定义主题配置
 */

let isCustomThemeRegistered = false

export const MY_DARK_THEME = {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: 'comment', foreground: '5A6A72', fontStyle: 'italic' },
    { token: 'keyword', foreground: '569CD6' },
    { token: 'string', foreground: 'CE9178' },
    { token: 'number', foreground: 'B5CEA8' },
    { token: 'function', foreground: 'DCDCAA' },
    { token: 'type', foreground: '4EC9B0' },
    { token: 'class', foreground: '4EC9B0' },
    { token: 'variable', foreground: 'CCCCCC' },
    { token: 'operator', foreground: 'CCCCCC' },
  ],
  colors: {
    'editor.background': '#0E1518',
    'editor.foreground': '#CCCCCC',
    'editor.lineHighlightBackground': '#0E1518',
    'editorLineNumber.foreground': '#3D4A52',
    'editorLineNumber.activeForeground': '#CCCCCC',
    'editor.selectionBackground': '#264F78',
    'editor.selectionForeground': '#FFFFFF',
    'editor.inactiveSelectionBackground': '#1A2329',
    'editor.selectionHighlightBackground': '#2A3840',
    'editor.wordHighlightBackground': '#2A3840',
    'editor.wordHighlightStrongBackground': '#3D4A52',
    'editor.findMatchBackground': '#2A3840',
    'editor.findMatchHighlightBackground': '#141C21',
    'editorBracketMatch.border': '#569CD6',
    'editorBracketMatch.background': '#141C21',
    // 滚动条颜色由 CodeEditor.vue 配置控制
    'editorIndentGuide.background': '#1A2329',
    'editorIndentGuide.activeBackground': '#2A3840',
    'editorGutter.modifiedBackground': '#569CD6',
    'editorGutter.addedBackground': '#4EC9B0',
    'editorGutter.deletedBackground': '#EF5350',
    'minimap.background': '#0E1518',
    // ===== Minimap 滑块 - 接近背景色 =====
    'minimapSlider.background': '#2A3840',
    'minimapSlider.hoverBackground': '#3D4A52',
    'minimapSlider.activeBackground': '#4A5A62',
    'editorOverviewRuler.border': '#0E1518',
  },
}

/**
 * 注册自定义主题（仅注册一次）
 * @param {import('monaco-editor')} monaco
 */
export function registerCustomTheme(monaco) {
  if (isCustomThemeRegistered) return
  monaco.editor.defineTheme('my-dark', MY_DARK_THEME)
  isCustomThemeRegistered = true
}