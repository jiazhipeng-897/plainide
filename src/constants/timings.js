/**
 * 超时时间与延迟常量
 * 统一管理全项目的 setTimeout / setInterval 延迟数值
 */

// Monaco 编辑器布局延迟（短）
export const EDITOR_LAYOUT_DELAY_SHORT = 50

// Monaco 编辑器布局延迟（中）
export const EDITOR_LAYOUT_DELAY_MEDIUM = 100

// Monaco 编辑器布局延迟（挂载后初始化）
export const EDITOR_LAYOUT_DELAY_INIT = 300

// AST 解析防抖延迟
export const PARSE_DEBOUNCE_DELAY = 500

// 翻译请求间隔
export const TRANSLATION_INTERVAL = 150

// 保存成功提示消失时间
export const SAVE_SUCCESS_HIDE_DELAY = 2000

// 搜索关闭动画延迟
export const SEARCH_CLOSE_ANIMATION_DELAY = 200

// 文件树单击/双击区分延迟
export const FILE_TREE_CLICK_DELAY = 300

// 后端端口探测超时
export const PORT_DISCOVERY_TIMEOUT = 500
