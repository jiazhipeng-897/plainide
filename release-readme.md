# My Code IDE

轻量级 AI 代码编辑器（IDE）—— **Electron + Vue 3 + FastAPI** 构建，内置多 Agent 协作的 AI 编码流水线。

> 说一句话：给 AI 一个需求，它从需求分析到交付跑完整条链路，边写你边看，小任务秒出、大任务全程可视化。

![platform](https://img.shields.io/badge/platform-Windows-blue)
![license](https://img.shields.io/badge/license-MIT%20%2B%20Core%20Closed-orange)
![python](https://img.shields.io/badge/python-3.11-green)
![node](https://img.shields.io/badge/node-18%2B-green)

---

## 目录（TOC）

- [功能概览](#功能概览)
- [快速开始](#快速开始)
- [术语表](#术语表)
- [目录结构](#目录结构)
- [API 参考](#api-参考)
- [安全说明](#安全说明)
- [依赖与版本](#依赖与版本)
- [构建与上架](#构建与上架)
- [常见问题](#常见问题)

---

## 功能概览

### AI 编码能力

| 能力 | 说明 |
|---|---|
| **AI 编码流水线（orchestrator）** | 多角色 Agent 协作：需求分析 → UX 设计 → 任务规划 → 架构设计 → 前后端开发 → 调试修复 → 代码审查 → 测试验证 → 验收交付 → 沙箱/部署/打包。任务异步执行，SSE 实时推送进度 |
| **前置分诊（Tier）** | 按需求体量自动分级：T1 单文件 / T2 精简 / T3 标准 / T4 完整链路。小任务跳过重分析链，省 Token 省时间 |
| **计划报告卡片 + 规模档位** | 提交任务前先出「计划报告」，用户选规模（精简 / 标准 / 完整）并确认后才执行 |
| **Chat AI 双通道** | 自由聊天（讨论方案）与任务触发分离；写代码、改代码都走 Agent 链路 |
| **共绘蓝图模式（Map-Hand）** | 用户与架构师 AI 直接对话构思架构，产出设计文档后交给下游执行链。意图分类支持"先构思 / 先聊聊"等说法自动进入该模式 |
| **构思核心（Mirror）** | 打开任意代码文件，点「构思核心」即可看到人类可读的白话说明；想改就说你的想法，AI 评估后给出修改预览，确认后以流式补丁的方式改在文件里，不整文件重写。大白话会随代码更新而更新 |
| **项目代码检索（code_rag）** | 自动为项目代码建立索引，AI 能快速找到相关代码片段，项目越大优势越明显 |
| **AI 代码补全** | 输入时自动补全，Tab 接受；支持跨文件联想，越写越快 |
| **AI 选区操作** | 选中代码 → 浮动条（解释 / 优化 / 重构 / 找 Bug）→ 结果可一键应用到编辑器 |

### 编码工具

| 能力 | 说明 |
|---|---|
| Monaco Editor + 多语言高亮 | 支持 Python / JS / TS / HTML / C 等 |
| 文件树扫描与过滤 | 支持 `.gitignore`，自动忽略软件内部目录 |
| Python AST 语法解析 | 语法树可视化、节点可复制 |
| 代码翻译 / 代码医生 | 多服务商翻译；诊断与修复 |
| 终端 | node-pty 真实 PTY（命令自动代理到 Python 后端） |
| Git 面板 | 变更查看 / Diff 确认 |

### 安全与审计

| 能力 | 说明 |
|---|---|
| Shadow 快照 | AI 改代码前自动备份，单步回滚 |
| 变更日志 + Token 记账 | 每次任务生成「执行明细.txt」：任务关键步骤、每次模型调用的耗时 / Token，花多少一清二楚 |
| 路径安全 | 路径白名单校验，防路径穿越 |
| CORS 限制 | 后端仅允许本机（localhost / 127.0.0.1）来源访问 |

---

## 快速开始

### 前置要求（Prerequisites）

| 依赖 | 版本 | 说明 |
|---|---|---|
| Windows | 10/11 | 当前上架版仅支持 Windows x64 |
| Node.js | **18+** | 安装时勾选 "Add to PATH" |
| Python | **3.11.x** | 核心黑盒模块（core.bin）与 3.11 字节码绑定，**其他版本不可用** |

### 一键启动（推荐）

双击 `start.bat`：

```
[1/3] 自动探测 Python 3.11（版本不符会明确提示）
[2/3] 缺 Python 依赖 → 自动 pip install
[3/3] 缺前端依赖 → 自动 npm install
→ 自动拉起 Vite + Python 后端 + Electron 窗口
```

首次运行会自动下载依赖（Electron 较大，约需几分钟），之后启动即秒开。

### 手动启动（开发调试）

```bash
# 1. Python 后端（端口 8765，被占用自动顺延）
cd python
pip install -r requirements.txt
python main.py

# 2. 前端 + Electron（另开一个终端）
npm install
npm run dev          # Vite 开发服务器（端口 5173）
npx electron .       # 桌面窗口（会自动连接已就绪的 Python 后端）
```

> Windows 路径建议用正斜杠展示，如 `D:/mycode/my-ide`；实际运行时两种分隔符均可。

### 首次使用

1. 打开「设置」→「模型」→ 选择服务商（DeepSeek / 豆包 / 通义 / 腾讯 / 百度 / MiniMax / Kimi）
2. 填入该服务商的 **API Key**（各厂商独立存储，互不影响）
3. 在 Chat 面板输入需求，例如："帮我写一个计算器"
4. 确认计划报告 → 选择目标文件夹 → AI 开始编码

---

## 术语表

| 术语 | 含义 |
|---|---|
| **orchestrator** | AI 编码流水线引擎：多角色 Agent 的编排、调度、重试、容错 |
| **Map-Hand Mode（共绘蓝图模式）** | 用户替代总调度官、与架构师 AI 直接对话构思架构的新模式 |
| **code_rag** | 项目代码检索：为代码建立索引，AI 改代码前能快速找到相关代码片段 |
| **Tier（分诊档位）** | 按需求体量自动分级的执行链路档位（T1 单文件 → T4 完整链路） |
| **FIM** | Fill-In-Middle，补全模型在代码中间位置生成补丁的机制 |
| **SSE** | Server-Sent Events，服务端单向推送事件流（用于任务进度实时推送） |

---

## 目录结构

```
my-code-ide/
├── start.bat                 # 一键启动（自动装依赖）
├── package.json              # 前端依赖（Vite / Electron / Vue3）
├── electron/                 # Electron 主进程 + preload（IPC 通道）
├── src/                      # Vue 3 前端源码（MIT 开源）
├── python/
│   ├── main.py               # FastAPI 入口（端口 8765）
│   ├── core.bin              # ★ 核心黑盒：orchestrator/code_rag/map_hand/mirror/agents 加密字节码
│   ├── core_shield.py        # 黑盒加载器（框架，无业务逻辑）
│   ├── orchestrator/         # （开发版可见源码；上架版已加密进 core.bin）
│   ├── code_rag/             # 同上
│   ├── map_hand/             # 同上
│   ├── agents/               # Agent 编排 + 加密资产 core_assets.bin
│   ├── routers/              # AST / 翻译 / 医生 / 文件 / 连接测试等 API
│   └── requirements.txt
└── LICENSE / LICENSE.core    # MIT（开源外围）+ 核心闭源声明
```

### 软件内部目录（自动生成，已加入 .gitignore）

| 目录 | 用途 |
|---|---|
| `.mycode/` | 任务中间产物（设计文档、快照、变更日志、语义大纲 mirror.json） |
| `.memory/` | 项目记忆（供后续任务注入上下文） |
| `.code_rag/` | 项目代码检索索引（自动生成） |
| `python/cache/` `python/temp/` | 运行时缓存 |

> 以上目录在 Windows 上自动带隐藏标记，**不会被提交到 Git**（`.gitignore` 已覆盖）。

---

## API 参考

基础地址：`http://127.0.0.1:8765`（Electron 主进程会自动探测可用端口，前端经 IPC 读取）

### 路由总表

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/health` | 健康检查，返回当前端口 |
| POST | `/orchestrator/classify` | 意图分类（chat / dev / plan / continue / map_hand） |
| POST | `/orchestrator/tech-stack` | 技术栈推荐 |
| POST | `/orchestrator/plan-preview` | 计划报告预览（卡片数据） |
| POST | `/orchestrator/project-context` | 读取项目上下文 |
| POST | `/orchestrator/submit-task` | 提交开发任务（异步），返回 `taskId` |
| GET | `/orchestrator/task-stream/{task_id}` | **SSE 事件流**（进度推送） |
| GET | `/orchestrator/task-status/{task_id}` | 轮询式任务状态 |
| POST | `/orchestrator/cancel-task` | 取消任务 |
| POST | `/orchestrator/pause-task` / `resume-task` | 暂停 / 恢复任务 |
| POST | `/orchestrator/package-task` | 打包任务 |
| POST | `/orchestrator/restore-step` | 单步回滚（Shadow 快照） |
| POST | `/orchestrator/snapshots` | 快照列表 / 清空 |
| POST | `/orchestrator/ai-edit` | AI 编辑文件（选区操作） |
| POST | `/orchestrator/complete` | AI 代码补全 |
| POST | `/orchestrator/chat` | Chat AI 聊天（文本流） |
| POST | `/map-hand/chat` | 共绘蓝图模式对话 |
| POST | `/map-hand/finalize` | 共绘模式定稿（产出设计文档 + 文件清单） |
| POST | `/mirror/translate` | 构思核心：把当前代码文件翻译成大白话 |
| POST | `/mirror/evaluate` | 构思核心：评估用户修改意见，返回修改预览 |
| POST | `/mirror/apply` | 构思核心：确认后应用修改，并同步更新大白话 |
| POST | `/scan/` | 扫描目录文件树 |
| POST | `/parse/` | Python AST 语法解析 |
| POST | `/translate/` | 代码翻译 |
| POST | `/doctor/format` `/doctor/reset` | 代码医生 |
| POST | `/agent/translate` `/agent/chat` | 旧 Agent 接口 |
| GET | `/agent/agents` | 可用 Agent 列表 |
| POST | `/file/create` `/folder/create` `/file/delete` `/file/rename` | 文件操作 |
| POST | `/test-connection` | 模型 API 连接测试 |
| POST | `/image/generate` | AI 生图（seedream） |

> 路径风格以 FastAPI 定义为准：`/scan/`、`/parse/` 带尾随斜杠，`/orchestrator/*` 不带。调用时保持与表中一致。

### 最小示例：提交任务

```bash
curl -X POST http://127.0.0.1:8765/orchestrator/submit-task \
  -H "Content-Type: application/json" \
  -d '{"requirement":"帮我写一个计算器","projectPath":"D:/projects/calc","provider":"deepseek","model":"deepseek-v4-flash"}'
```

响应：

```json
{ "taskId": "46f82fcb78a8", "tier": "t2", "mode": "full", "scale": "slim" }
```

### SSE 进度流（推荐）

任务提交后，用 `EventSource` 订阅进度（事件类型：`pipeline_started` / `stage_started` / `file_written` / `chat_reply` / `pipeline_completed`）：

```js
// 浏览器 / Electron renderer
const es = new EventSource(
  `http://127.0.0.1:8765/orchestrator/task-stream/${taskId}`
)

es.addEventListener('stage_started', (e) => {
  console.log('阶段:', JSON.parse(e.data).stage)   // 如 "开发实现"
})

es.addEventListener('file_written', (e) => {
  const d = JSON.parse(e.data)
  console.log('已写文件:', d.path)                  // 实时刷新文件树
})

es.addEventListener('pipeline_completed', (e) => {
  console.log('完成:', JSON.parse(e.data))
  es.close()                                        // 记得关闭
})

es.onerror = () => {
  // 断线重连策略：EventSource 自带重连，可按需退避
  setTimeout(() => {
    es.close()
    new EventSource(`.../task-stream/${taskId}`)   // 重新订阅
  }, 3000)
}
```

### 轮询式状态查询（备用）

```bash
curl http://127.0.0.1:8765/orchestrator/task-status/46f82fcb78a8
```

```json
{ "status": "running", "currentStage": "开发实现", "files": ["main.py"], "logs": ["..."] }
```

---

## 安全说明

1. **API Key 存储**：各厂商 API Key 保存在 `%APPDATA%/my-ide/api-config.json`（明文 JSON）。建议：
   - 该文件位于系统用户目录，勿加入 Git / 勿与他人共享；
   - 如需更严格保护，可自行用系统凭据管理器（Credential Manager）或加密工具处理该文件；
   - 发布 / CI 环境绝不写入真实 Key。
2. **CORS**：后端默认只允许 `localhost / 127.0.0.1` 来源，防止任意网页跨域调用本机后端。
3. **路径安全**：文件写入有路径白名单校验，拦截 `../` 路径穿越。
4. **Shadow 快照隐私**：`.mycode/` 快照包含 AI 修改前的原文件备份，可能含敏感信息，已加入 `.gitignore`。
5. **生产部署**：本软件定位本地桌面工具，后端不面向公网。若需远程部署，请置于反向代理后并启用 TLS 与鉴权。

---

## 依赖与版本

### Python 后端（python/requirements.txt）

| 依赖 | 版本 | 说明 |
|---|---|---|
| fastapi / uvicorn | 0.141 / 0.52 | Web 框架与 ASGI 服务器 |
| pydantic | 2.13 | 请求/响应模型 |
| tree-sitter | 0.25 | 语法解析（**有预编译 wheel，无需本地编译**） |
| tree-sitter-python / javascript / typescript / c / html | 0.23~0.25 | 各语言语法包（pip 直接安装） |
| numpy | 1.26 | 向量化（兼容 Python 3.11） |
| debugpy | 1.8 | 调试器（DAP） |
| ddgs | 9.16 | 联网搜索代理（免 Key） |

> tree-sitter 各语言包均为 pip 可装的预编译 wheel，**不需要手动编译原生模块**。若极少数平台下载失败，可换用国内镜像源：`pip install -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple`

### 前端（package.json）

| 依赖 | 版本 |
|---|---|
| Electron | 44.x |
| Vite | 7.x |
| Vue | 3.5.x |
| Element Plus | 2.14.x |
| Monaco Editor | 0.56.x |
| node-pty / xterm | 终端 |

### 端口约定

| 服务 | 端口 | 说明 |
|---|---|---|
| Vite 前端 | 5173 | 被占用自动顺延（5174…） |
| Python 后端 | 8765 | 被占用自动顺延；Electron 探测后写入 `python/cache/port.txt` |

---

## 构建与上架

本项目遵循 **Open Core** 模式：

- **开源（MIT）**：`src/` 前端、`electron/` 壳、`python/` 下非核心辅助模块（routers / utils / core 等）
- **闭源（核心黑盒）**：`python/orchestrator/`、`code_rag/`、`map_hand/`、`mirror/`、`agents/` —— 上架版以 `core.bin`（加密字节码）与 `core_assets.bin`（加密资产）分发，源码不开放

开发版源码仓库中，运行根目录 `python build_release.py` 即可重新生成上架版（`release/`）：

```bash
python build_release.py
# 产物：release/ —— 开源壳 + core.bin 黑盒 + 一键 start.bat
```

> 要求 Python 3.11（core.bin 与 3.11 字节码绑定）；`release/` 内容即 GitHub 发布内容。

---

## 常见问题

**Q：双击 start.bat 后窗口一闪而过？**
A：新版 start.bat 已改为纯 ASCII + goto 结构，任何错误都会 `pause` 停住并显示原因。请确认报错内容：常见为未装 Node.js / Python 3.11 / 网络问题导致依赖下载失败。

**Q：提示 "Core module requires Python 3.11"？**
A：core.bin 是 Python 3.11 编译的加密字节码，必须使用 3.11.x。请安装 [Python 3.11.9](https://www.python.org/downloads/release/python-3119/) 并勾选 "Add to PATH"。

**Q：npm install 很慢？**
A：Electron 二进制较大。可设置国内镜像加速：
```bash
npm config set registry https://registry.npmmirror.com
npm config set electron_mirror https://npmmirror.com/mirrors/electron/
```

**Q：需要自己提供 API Key 吗？**
A：是的。软件不内置任何模型服务，请在「设置 → 模型」中配置你自己的服务商 Key（支持 DeepSeek / 豆包 / 通义 / 腾讯 / 百度 / MiniMax / Kimi）。

---

## License

- 开源外围：**MIT License**（见 [LICENSE](LICENSE)）
- 核心模块：**闭源**（见 [LICENSE.core](LICENSE.core)，禁止反编译 / 逆向 / 商用二次分发）

如需商用授权或源码许可，请联系作者。
