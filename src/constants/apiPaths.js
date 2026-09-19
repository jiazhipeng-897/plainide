/**
 * Python 后端接口路径常量
 * 统一管理所有后端接口地址，消除硬编码与尾斜杠不一致问题
 */

// AST 解析相关
export const API_PARSE_AST = '/parse'

// 项目扫描
export const API_SCAN_PROJECT = '/scan'

// AI 翻译
export const API_TRANSLATE = '/translate'

// 代码医生格式化
export const API_DOCTOR_FORMAT = '/doctor/format'

// 连接测试
export const API_TEST_CONNECTION = '/test-connection'

// AI 代码补全
export const API_COMPLETE = '/orchestrator/complete'

// AI 选区操作（解释/优化/重构/找Bug）
export const API_AI_EDIT = '/orchestrator/ai-edit'
