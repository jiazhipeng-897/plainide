# 🧠 My Code IDE - 项目文档

## 🚀 项目概览

My Code IDE 是一个基于 **Electron + Vue 3 + FastAPI** 的轻量级 AI 代码编辑器，已实现「需求 → 计划 → 架构 → 开发 → 验证 → 交付」的完整 AI 编码流水线。

核心能力：

- **AI 编码流水线（orchestrator）**：多角色 Agent 协作（需求/UX/规划/架构/前后端开发/调试/审查/QA/验收/沙箱/部署/打包），任务异步执行 + SSE 实时进度
- **职责分离 + 规模档位硬约束**：卡片定档（精简 1-3 / 标准 5-10 / 完整）→ 架构师产出文件树+架构+大纲+最终文件清单（超限打回重写）→ 开发只按清单执行、不自行规划 → 出错点对点补丁修复
- **Chat AI 双通道**：自由聊天（架构讨论）与任务触发分离，计划报告卡片 + 规模档位 + 确认后执行
- **AI 代码补全**：基础词法（输入 p → print）→ FIM 幽灵文本（Tab 接受）→ 仓库感知 RAG 注入
- **AI 选区操作**：选中代码 → 浮动条（解释/优化/重构/找Bug）→ 结果可一键应用到编辑器
- **代码 RAG 检索（code_rag）**：tree-sitter 语法树切片 + 向量 + BM25 混合检索 + 增量索引
- **文件树扫描与过滤**（支持 .gitignore）
- **Python AST 语法解析**（语法树可视化、可复制）
- **代码翻译**（Agent 翻译，多服务商）
- **代码诊断与修复**（代码医生）
- **终端命令执行**（node-pty 真实 PTY）
- **Git 面板**（变更查看 / Diff 确认）
- **错误日志收集**（独立错误窗口）
- **透明启动页**（预加载缓冲动画）
- **前置分诊（Tier 链路）**：按需求体量自动分级（T1 单文件 → T4 完整链路），小任务跳过后端分析链，大幅省 token
- **技术栈自动兜底**：用户没指定技术栈时，自动识别 CLI/脚本/Web/桌面，不用用户选
- **最小体量原则**：小工具/脚本类自动判 t2，跳过架构师，Dev 直接单文件写，token 从 13 万降到 4 千
- **任务追溯与审计**：Shadow 快照 / 变更日志 / Token 记账 / 单步回滚
- **编码技能体系（coding-skills）**：8 个方法论技能按角色注入（代码库分析/方案设计/前后端开发/单元测试/诊断修复/代码审查/性能优化）
- **Token 透明**：每次任务在项目根落盘「执行明细.txt」——思维链摘要 + 每次 LLM 调用的耗时 / Token / 输出摘要，花钱花在哪一目了然

## 🛠 技术栈

| 层 | 技术 |
|---|---|
| 前端 | Vue 3.5 + Vite 7 + Element Plus 2.14 + Monaco Editor 0.56 + Pinia 3 |
| 桌面框架 | Electron 44（IPC 主通道 + HTTP 调试备用） |
| 后端 | Python 3.11 + FastAPI 0.141（端口 8765） |
| 终端 | node-pty + xterm.js（xterm-addon-fit / webgl） |
| 代码检索 | tree-sitter（c/html/js/python/typescript）+ BM25 + 向量检索 |

## 📁 目录结构

```
my-ide/
├── electron/                  # Electron 主进程
│   ├── main.js                # 入口：进程管理、IPC 注册、窗口、启动页
│   ├── preload.js             # 渲染进程桥接（contextBridge）
│   ├── preload-error.js       # 错误窗口桥接
│   ├── splash.html            # 透明启动页动画
│   ├── splash-logo.png        # 启动页徽标（AI 生成 + 抠图）
│   ├── error-collector.js     # 错误收集器
│   ├── error-window.js        # 错误窗口管理
│   ├── ipc/
│   │   ├── parser-api.js      # Python API 转发（含路径白名单校验）
│   │   ├── agent-chat.js      # Agent 对话
│   │   ├── agent-translate.js # Agent 翻译 + 翻译映射读写
│   │   ├── terminal.js        # node-pty 终端控制
│   │   └── git.js             # Git 操作
│   ├── services/vite-manager.js  # Vite 开发服务管理
│   └── utils/path-guard.js    # 路径守卫（文件操作白名单）
│
├── src/                       # 前端源码（Vue 3）
│   ├── main.js / App.vue
│   ├── views/                 # Layout.vue（主布局）ErrorWindow.vue
│   ├── components/
│   │   ├── agent/             # Agent 面板：agent.vue / PipelineView / 计划/交付卡片
│   │   ├── ai-features/       # AST / 代码医生 / 翻译 / AgentTab
│   │   ├── layout/            # EditorArea / Sidebar / RightPanel / BottomPanel
│   │   ├── editor/            # CodeEditor（Monaco + AI 选区 + 补全）Outline
│   │   ├── file-system/       # 文件树（FileTree / FileTreeNode）
│   │   ├── git/               # GitPanel / GitDiffDialog / ChangeGroup
│   │   ├── settings/          # ApiSettings（多厂商管理）
│   │   ├── terminal/          # 终端面板 + 会话选择
│   │   ├── search/            # 全局搜索
│   │   ├── common/            # 菜单栏 / 状态栏 / 标题栏 / 分隔条
│   │   └── diagnostics/       # 错误面板
│   ├── stores/                # Pinia：project / editor / agent / git / preview / outline / translation
│   ├── services/              # agentService / aiService / aiCompletionService / snippetService 等
│   ├── constants/             # providerConfig（8 厂商）/ apiPaths / eventNames / langMap
│   ├── composables/           # usePipelineStream / useEditorLayout / useASTParser 等
│   ├── config/                # editorTheme.js（Monaco 主题）
│   ├── styles/                # palette.css（原始色值层）+ theme.css（语义层）
│   └── utils/                 # http / pathHelper / fileTreeBuilder / sound 等
│
├── python/                    # Python 后端（FastAPI）
│   ├── main.py                # 入口（CORS 仅限本机 localhost/127.0.0.1）
│   ├── config.py              # 端口/服务配置（cache/server_config.json）
│   ├── orchestrator/          # AI 编码流水线（核心）
│   │   ├── engine.py          # 主引擎：阶段编排 + run() 入口
│   │   ├── stages.py          # 阶段表 + 配置常量
│   │   ├── design_phases.py   # 设计阶段（需求/UX/规划/架构）
│   │   ├── development.py     # 开发阶段（按架构师清单执行 / 分块 / 续写）
│   │   ├── verification.py    # 验证与修复（冒烟 / QA 测试 / Debugger）
│   │   ├── tail_phases.py     # 收尾阶段（沙箱 / 部署 / 打包）
│   │   ├── context.py         # 上下文构建与压缩
│   │   ├── security.py        # 安全校验（路径/命令/脚本）
│   │   ├── router.py          # 任务/聊天/补全/选区/计划预览等 API
│   │   ├── llm.py             # LLM 客户端（多服务商 + FIM 补全）
│   │   ├── intent.py          # 意图判定（chat / plan / dev）
│   │   ├── task_manager.py    # 后台任务状态管理（task_id → 状态）
│   │   ├── tech_stack.py      # 技术栈识别
│   │   ├── plan_preview.py    # 计划报告预览
│   │   ├── events.py          # 任务事件定义
│   │   ├── triage.py          # 前置分诊器（按体量分级 T1-T4，本地规则零 token；T2 起含架构师清单环节）
│   │   ├── snapshot.py        # Shadow 快照（改前备份 + 单步回滚）
│   │   ├── changelog.py       # 变更日志（changelog.jsonl 追加记录）
│   │   ├── usage_tracker.py   # Token 用量记账（真实 usage / 估算兜底）
│   │   ├── syntax_gate.py     # 语法门禁（写盘前校验）
│   │   ├── tools.py           # 写盘工具（write_files / apply_patches）
│   │   ├── config.py          # API 配置读取
│   │   ├── utils.py           # 通用工具
│   │   ├── agent_skills.py    # 角色技能注入（coding-skills 方法论挂载）
│   │   └── code_context.py    # RAG 代码上下文注入
│   ├── agents/                # LLM 服务商实现（deepseek/baidu/tencent/volcengine/mock）
│   │   ├── loader.py          # Agent 加载器（递归加载各角色 skills/ 技能目录）
│   │   ├── coordinator_agent.py  # 总协调官
│   │   ├── chat_facade_agent.py  # Chat 前端门面
│   │   └── codeagent/         # 多角色 Agent 定义（19 个角色，agent.yaml + prompt.md + skills/ 技能）
│   │       ├── Coordinator/   # 总协调官：流程推进 + 智能路由
│   │       ├── Requirement/   # 需求分析师
│   │       ├── UXDesigner/    # 用户体验设计师
│   │       ├── Planner/       # 任务规划师
│   │       ├── Architect/     # 架构师（文件树 + 架构 + 大纲 + 最终文件清单 file_plan，超限打回重写）
│   │       ├── Frontend/      # 前端开发
│   │       ├── Backend/       # 后端开发
│   │       ├── Debugger/      # 调试修复专家（3 轮熔断）
│   │       ├── Reviewer/      # 代码审查官
│   │       ├── QA/            # 测试工程师
│   │       ├── Acceptance/    # 验收负责人
│   │       ├── SandboxExecutor/  # 沙箱执行官
│   │       ├── DevOps/        # 运维工程师（Docker/部署）
│   │       ├── Packager/      # 打包师（EXE 打包）
│   │       ├── Manager/       # 项目经理
│   │       └── Plugin Agent/  # 翻译官 / 插件检查师
│   ├── code_rag/              # 代码 RAG 检索（DDD 分层）
│   │   ├── application/       # index_service（增量索引）
│   │   ├── domain/            # chunker / bm25 / embedder / tokenizer
│   │   ├── infrastructure/    # parser（tree-sitter）/ vector_store
│   │   ├── interface/         # cli.py（命令行入口）
│   │   └── tests/             # 测试 + fixtures
│   ├── routers/               # 基础功能路由
│   │   ├── scan.py            # 目录扫描（.gitignore 过滤）
│   │   ├── parse.py           # AST 语法解析
│   │   ├── translate.py       # 代码翻译
│   │   ├── doctor.py          # 代码医生
│   │   ├── file.py            # 文件操作（带路径安全校验）
│   │   ├── image.py           # 图片生成（生图）
│   │   └── test_connection.py # API 连接测试
│   ├── core/                  # gitignore 解析 / tree-sitter 解析 / AST 遍历
│   ├── doctors/               # 代码医生引擎（flake8 等）
│   ├── utils/                 # 日志 / 文件工具
│   └── cache/                 # 运行时生成（port.txt / server_config.json / errors.log）
│
├── index.html                 # Vite HTML 模板
├── package.json               # 前端依赖
├── vite.config.js             # Vite 配置（含 monaco ESM alias）
├── .gitignore
├── .env.example
├── start.bat                  # Windows 一键启动
└── error-window.html          # 错误窗口 HTML
```

## 🔌 后端路由

### 基础路由

| 路由 | 方法 | 功能 |
|---|---|---|
| /health | GET | 健康检查 |
| /scan/ | POST | 扫描目录文件树（.gitignore 过滤） |
| /parse/ | POST | AST 语法解析 |
| /translate/ | POST | 代码翻译（大白话 JSON） |
| /doctor/format | POST | 代码格式化 |
| /doctor/reset | POST | 重置诊断状态 |
| /file/create | POST | 创建文件 |
| /folder/create | POST | 创建文件夹（可嵌套） |
| /file/delete | POST | 删除文件/文件夹 |
| /file/rename | POST | 重命名文件/文件夹 |
| /test-connection | POST | API 服务商连接测试 |

### Orchestrator 路由（AI 流水线）

| 路由 | 方法 | 功能 |
|---|---|---|
| /orchestrator/chat | POST | Agent 对话（SSE 流式，意图分流 chat/plan/dev） |
| /orchestrator/classify | POST | 意图判定（dev 时返回 needs_tech_stack） |
| /orchestrator/tech-stack | POST | 技术栈识别 |
| /orchestrator/plan-preview | POST | 项目计划报告预览 |
| /orchestrator/submit-task | POST | 提交开发任务（返回 taskId + tier 分诊档位，异步执行） |
| /orchestrator/package-task | POST | 打包任务（EXE） |
| /orchestrator/cancel-task | POST | 取消任务 |
| /orchestrator/pause-task | POST | 暂停任务 |
| /orchestrator/resume-task | POST | 恢复任务 |
| /orchestrator/task-status/{taskId} | GET | 查询任务状态 |
| /orchestrator/task-stream/{taskId} | GET | SSE 任务进度流 |
| /orchestrator/restore-step | POST | 单步回滚（恢复指定快照） |
| /orchestrator/snapshots | POST | 查询快照列表 |
| /orchestrator/snapshots/clear | POST | 清理快照（按任务/全部） |
| /orchestrator/complete | POST | AI 代码补全（FIM 幽灵文本） |
| /orchestrator/ai-edit | POST | AI 选区操作（explain/optimize/refactor/fix） |
| /orchestrator/project-context | POST | 项目上下文（RAG 注入） |

## 🔗 通信链路

**主通道（推荐）**：渲染进程 → preload（contextBridge）→ IPC → main.js → Python HTTP

```js
window.electronAPI.callPythonAPI('/scan', { path: '/project/path' })
```

**开发备用**：渲染进程 → `src/utils/http.js` 直接请求 `http://127.0.0.1:8765`

**终端**：渲染进程 → IPC → main.js → node-pty（真实 PTY，非 WebSocket）

**任务进度**：前端轮询 `/task-status/{id}` 或 SSE `/task-stream/{id}`

## ⚖️ 前置分诊（Tier 链路）

提交任务时由 `orchestrator/triage.py` 先做本地规则分诊（零 token 消耗），按需求体量选择链路档位，避免小项目也跑完整 Agent 分析链。

| 档位 | 触发条件 | 执行阶段 | 适用示例 |
|---|---|---|---|
| T1 快捷链路 | 需求含「单文件 / 一个HTML / 单页 / one file」等强信号，或用户选 small | 开发（1 个阶段） | 单 HTML 计算器 |
| T2 轻量链路 | 简短需求（≤50 字）/ 桌面小工具信号 / 用户选 slim | 需求 + 架构 + 开发 + 测试（4 个阶段） | 锁屏计时器、记事本 |
| T3 标准链路 | 完整框架技术栈（Vue/React/Flask 等）或普通完整项目 | 现行标准链路（不含部署） | 美容店前端页面 |
| T4 完整链路 | 复杂信号 ≥2（全栈/数据库/支付/多用户等）或用户选 full | 标准链路 + 部署 | 全栈电商平台 |

T1 额外约束：只让一个角色规划文件，且强制「只规划 1 个文件、禁止子目录」；写文件一次写完整（16384 token 预算、超时放宽到 480s）。

**职责分离原则**：流水线各环节严格各司其职——总调度官分诊派活 → 架构师产出文件树/架构/大纲/最终文件清单（清单受规模档位上限硬约束，超限打回重写，重设计仍超则截断兜底）→ 开发只按清单写代码、不自行规划文件 → 出错由 Debugger 点对点补丁修复（读取 RAG 上下文、只改被点名文件的片段、不重写整文件，3 轮熔断请求人类介入），避免责任耦合。

实测对比（真实 API，同一任务「写一个单HTML计算器」）：

| 指标 | 改造前（全链路） | 改造后 T1 / DeepSeek | 改造后 T1 / 豆包 |
|---|---|---|---|
| token | 150,464 | 36,919 | 12,415 |
| LLM 调用 | 20 次 | 3 次 | 2 次 |
| 执行阶段 | 8 个 | 1 个 | 1 个 |
| 耗时 | 336s | 108s | 213s |

前端链路面板按档位显示徽标：T1 绿 / T2 蓝 / T3 橙 / T4 紫。

## 🧰 编码技能体系（coding-skills）

软件内置一套方法论级编码技能，按角色挂载到对应 Agent 的 system prompt，让 Agent 干活时带着规范、不靠自由发挥：

| 技能 | 挂载角色 | 生效场景 |
|---|---|---|
| coding-analyze-codebase | Architect / Backend / Frontend / Reviewer | 技能库挂载 |
| coding-design-solution | Architect | 架构设计阶段注入 |
| coding-develop-backend-features | Backend | 写后端代码时注入 |
| coding-develop-frontend-features | Frontend | 写前端代码时注入 |
| coding-review-code | Reviewer | 代码审查阶段注入 |
| coding-develop-unit-tests | QA | 测试阶段注入 |
| coding-diagnose-and-fix-bugs | Debugger | 修 bug 时注入 |
| coding-optimize-performance | Backend / Frontend | 技能库挂载 |

机制要点：

- `agents/loader.py` 递归加载各角色 `skills/` 子目录（`<技能名>/SKILL.md`），references 按设计不注入
- `orchestrator/agent_skills.py` 按角色把主技能全文拼进 system prompt；未找到技能返回空串，绝不阻断主流程
- **Token 克制**：只注入角色主工作技能（1-2 个，约 1.8K 字符/次），references 与辅助技能不注入

## 🧭 共绘蓝图模式（Map-Hand Mode）

**定位**：独立于总调度官链路的新模式（决策层独立，执行层复用）。用户（人）替代总调度官，与架构师 AI 直接多轮对话构思——界面交互、核心业务、软件架构、文件结构；构思阶段**不写代码、不落盘**。

**触发**：向 Agent 发送开发需求（如「帮我写一个锁屏计时器」）后，弹出模式确认——「是，先构思」进入共绘蓝图；「否，直接开发」走现有流程。

**流程**：

```text
用户需求 → 模式选择（共绘蓝图 / 直接开发）
  └─ 共绘蓝图：构思对话（架构师只读，多轮讨论）→ 完成构思
       └─ 选项目文件夹 → LLM 总结设计文档（架构大纲 + 界面交互 + 核心业务 + file_plan 最终文件清单）
            └─ 写入 <项目>/.mycode/design.json → 用户确认规模档位 + 开工
                 └─ 下游执行链完全复用：开发按清单写 → 审查 → 修复 → 测试 → 验收
```

**设计要点**：

- **独立通道**：后端 `python/map_hand/` 包（路由 `/map-hand/chat` SSE 构思对话、`/map-hand/finalize` 总结设计文档），不耦合 orchestrator 流水线业务文件；Electron IPC 独立事件通道 `map-hand-event`，与主对话 `agent-event` 隔离。
- **架构师注入点**：`orchestrator/engine.py` 架构阶段检测项目内 `.mycode/design.json`——存在则直接采用（跳过架构师 LLM 再设计，省 token）；文件清单是「用户+架构师」共同确认的产物，超规模上限时**截断兜底、不重设计**。
- **各司其职**：构思只讨论设计；file_plan 是最终文件清单，开发只按清单写代码，不自行规划；下游 Debugger 仍按「读 RAG 上下文 → 点对点改片段 → 不重写整文件」修复。
- **Token 友好**：架构师阶段零 LLM 调用（直接用 design.json）；构思对话不触发任何开发动作，纯聊天也零成本进入。

## 🚀 启动方式

**方式 1**：双击 `start.bat`（一键启动 Python 后端 + Electron）

**方式 2**：分别启动

```bash
# Python 后端
cd python
python main.py --port 8765

# 前端开发（另一终端）
npm run dev

# 或 Electron + Vite 一并启动
npm run electron:dev
```

## ⚙️ API 配置

设置面板（设置 → API 设置）配置后保存到 `%APPDATA%/my-ide/api-config.json`。

支持服务商（**每家独立保存自己的 API Key**，切换厂商不会串 key）：

| 服务商 | 默认模型 |
|---|---|
| DeepSeek | deepseek-v4-flash（V4.1） |
| 火山引擎（豆包） | doubao-seed-evolving |
| 通义千问 | qwen3.8-max |
| 腾讯混元 | hunyuan-turbos-latest |
| 百度文心 | ernie-4.5-turbo-128k |
| MiniMax | MiniMax-M3 |
| Kimi（月之暗面） | kimi-k3 |
| OpenAI | gpt-4o |

Agent 面板左下角的模型标签跟随设置实时切换。

## 🧪 常用调试命令

```bash
# 健康检查
curl http://127.0.0.1:8765/health

# 连接测试
curl -X POST http://127.0.0.1:8765/test-connection \
  -H "Content-Type: application/json" \
  -d '{"provider": "deepseek"}'

# 扫描目录
curl -X POST http://127.0.0.1:8765/scan/ \
  -H "Content-Type: application/json" \
  -d '{"path": "D:/path/to/project"}'

# 代码翻译
curl -X POST http://127.0.0.1:8765/translate/ \
  -H "Content-Type: application/json" \
  -d '{"code": "print(\"hello\")", "mode": "full"}'

# 代码 RAG 索引（增量）
cd python
python -m code_rag.interface.cli index --path D:/path/to/project

# 代码 RAG 检索
python -m code_rag.interface.cli query --path D:/path/to/project --query "解析配置的函数"

# 后端测试
cd python && python -m pytest code_rag\tests\ tests\ -q
```

## 📦 依赖清单

**前端**（详见 `package.json`）：vue@3.5 / element-plus@2.14 / monaco-editor@0.56 / pinia@3 / axios@1.20 / xterm / node-pty

**后端**（详见 `python/requirements.txt`）：fastapi@0.141 / uvicorn / pydantic@2.13 / httpx / tree-sitter（c/html/js/python/typescript 语言包）

## 🧾 任务追溯与审计

AI 修改代码前自动建立可追溯机制，产物落盘后仍可回滚：

- **Shadow 快照**：每次写盘前在 `.mycode/shadow/` 备份被覆盖文件，附带 meta.json（路径/时间/操作），单快照目录设大小上限，超限清理最老；不污染用户主 git 仓库
- **变更日志**：`changelog.jsonl` 追加记录每次文件变更（路径/行号/摘要/耗时），与快照一一对应
- **Token 记账**：每次 LLM 调用解析 usage 记入 `usage_tracker`，任务状态带 `token_usage`（prompt/completion/total/calls），API 缺失时按文本长度估算并标记
- **单步回滚**：`/orchestrator/restore-step` 按快照恢复，`/orchestrator/snapshots` 查询、`/orchestrator/snapshots/clear` 清理

## 📊 执行明细与写盘协议

- **执行明细.txt**：每个任务结束在项目根目录落盘一次，内容 = 需求 / 分诊档位 / 总耗时 / LLM 调用次数 / Token 总计 / 每个阶段的摘要 / 每次 LLM 调用的耗时·Token·输出摘要（含推理模型空烧记录）——token 花在哪，打开文件就知道
- **纯代码写盘协议**：写文件时 LLM 直接输出代码正文 + 行尾 `__MYCODE_END__` 结束标记（不再要求 JSON 外壳，避免转义纠结与截断半壳），解析器按 结束标记 → JSON → 截断剥离 三级兼容
- **空烧识别与记账**：deepseek-v4-flash 等推理模型可能把预算全花在 reasoning 上（输出 0 字符）——已识别并记入执行明细，重试保持原预算、不降预算（降预算对推理模型是反效果）

## 🗂 内部目录（自动隐藏）

软件在项目内自动创建三个内部目录，均带 Windows 隐藏属性（`attrib +h`），资源管理器与文件树默认不可见，打开系统「显示隐藏文件」才可见：

| 目录 | 用途 |
|---|---|
| `.mycode/` | Shadow 快照、changelog.jsonl、Map-Hand design.json |
| `.memory/` | 项目记忆 PROJECT_MEMORY.md（跨任务上下文） |
| `.code_rag/` | 代码 RAG 索引库 index.db |

每次任务开始引擎会统一兜底加隐藏属性，已存在的旧项目目录也会被处理；不污染用户主 git 仓库。

## 🔒 安全说明

- **路径白名单**：文件读写、删除、目录创建、扫描转发均经过 `electron/utils/path-guard.js` 校验，越权路径直接拒绝
- **CORS 收紧**：后端仅允许 `localhost` / `127.0.0.1` 来源访问
- **终端安全**：已移除无鉴权 WebSocket 终端接口，终端统一走 Electron 主进程 node-pty
- **路径穿越检测**：orchestrator 的 `security.py` 对生成代码的路径映射做安全校验（拦截 `../` 逃逸）
- **日志脱敏**：IPC 层不记录代码正文、消息内容与翻译响应全文
- **API Key 独立存储**：各服务商 Key 分字段保存，不互相覆盖

## 📝 文档信息

- 文档版本：3.3.0（对齐当前代码结构）
- 最后更新：2026-09-15
- Python 端口：8765（自动探测，可被占用时顺延）

## 📦 打包到 release（闭源版）

### 闭源原则
- **核心编排逻辑**（orchestrator/ 下的 engine.py / development.py / verification.py / tools.py 等）→ 编译成 core.bin
- **agent prompt**（agents/codeagent/ 下的 prompt.md）→ 不直接暴露
- **code_rag 核心算法** → 编译进 core.bin
- **开放部分**（main.py / config.py / routers/ / utils/ / core/）→ 保留源码

### 打包步骤
1. 用 cython 把 orchestrator/ 核心文件编译成 core.bin
2. 复制开放部分源码到 release/python/
3. release/python/core.bin 放编译后的闭源文件
4. release/python/agents/ 只放 agent 目录结构，不暴露 prompt.md
5. release/README.md 只写功能怎么用 + 更新日志，不写内部链路

### 验证清单
- [ ] release/python/orchestrator/ 下没有 .py 源码
- [ ] release/python/core.bin 存在
- [ ] release/agents/ 下没有 prompt.md
- [ ] release/README.md 不写内部链路

### 打包流程（本次实操记录）
1. 运行 python build_core_bin.py → 生成 python/core.bin（372KB，44 个模块）
2. 复制前端源码（src/ electron/ public/）到 release/
3. 复制 Python 开放部分（main.py config.py core_shield.py dns_fallback.py core/ routers/ utils/ agents/ map_hand/ mirror/ debugger/）到 release/python/
4. 复制 core.bin 到 release/python/
5. 删掉 release/python/orchestrator/*.py（核心已编译进 core.bin）
6. 删掉 release/python/agents/**/prompt.md（prompt 也编译进 core.bin）
7. 删掉 release/python/code_rag/*.py（RAG 核心也编译进 core.bin）
8. 写 release/README.md（只写功能用法 + 更新日志，不写内部链路）
