# Debugger / 修复 Agent 业界调研 & 自家缺陷诊断报告

> 调研日期：2026-09-16
> 调研对象：Cursor、Claude Code、Cline、OpenHands、SWE-agent、Aider、Codex CLI、opencode、TRAE
> 自家代码：`python/orchestrator/verification.py` + `python/orchestrator/tools.py`

---

## 一、9 款产品横向对比表

| 产品 | 错误获取 | 诊断方式 | 修复工具（编辑格式） | 命令执行 / 超时 | GUI / 长驻进程冒烟 | RAG / 代码检索 | 熔断 / 防空转 | 编辑安全 |
|---|---|---|---|---|---|---|---|---|
| **Cursor** | 用户贴报错 + 终端输出 + linter 自动反馈 | Debug Mode：插桩→人工复现→运行时日志→精准修复 | sketch 格式（`// ... existing code ...`），双模型（主模型画草图+笨模型 apply），有 reapply | 集成终端，`is_background` 参数，超时未公开 | **不自动冒烟**，让用户自己复现，Agent 收日志 | **语义 embedding 索引**（codebase_search）+ grep + 模糊文件名 | linter 修复循环≤3次；用户审批门；reapply 重试 | inline diff 审批；写前必读 |
| **Claude Code** | 终端 stdout/stderr + LSP 类型错误 + Monitor 盯日志 | Glob→Grep→Read 漏斗 + Explore 子 Agent（只读 Haiku） | 精确字符串替换 old/new_string，逐字符匹配且唯一 | 集成终端，默认 2min / 最长 10min，`run_in_background`，Monitor 盯输出流 | run_in_background 起服务 + curl/Monitor 自己组合，无内建浏览器 | **无向量索引**，四层 Agentic RAG（预注入小模型+模型驱动搜索+Explore子Agent） | max_turns / max_budget 可选；compacting 3次失败停；**空转熔断（3次小输出<500token）**；Esc 随时停 | 必须先读再改；文件自读后变动则 Edit 失败；LSP 后检；无内置备份 |
| **Cline** | 终端输出 + VS Code diagnostics 自动反馈 + 浏览器 console | 正则搜索 + tree-sitter AST 切片 + 无头浏览器截图 | SEARCH/REPLACE block（git conflict 风格），**4层匹配 fallback** | VS Code Shell Integration，"Proceed While Running" 后台机制 | **内置无头浏览器**（Playwright），截图+console log+点击交互自动验证 | **无语义搜索**，tree-sitter AST 切片 + 正则 + 上下文管理器 | 人工审批门（每步）；apply_diff 3次失败转全量重写；**Checkpoint 快照可回滚**；CLI --timeout | VS Code diff editor 审批；4层匹配 fallback；checkpoint 回滚；diagnostics 自动反馈 |
| **OpenHands** | GitHub Issue + bash stdout/exit_code + IPython 报错 | CodeActAgent 边跑边推理，无单独诊断 Agent | old/new 字符串替换（FileEditAction）+ FileWrite 全量 | **Docker 容器**，每 action 带 timeout（resolver 300s，hard_timeout 600+100×重试） | 有端口分配机制 + BrowseInteractiveAction（无头 Chromium），无内置 supervisor | **无 embedding**，AGENTS.md 全文注入 + Skills 懒加载 + bash grep | OPENHANDS_MAX_ITER；Condenser 历史压缩（>80条事件用小模型摘要）；安全确认 Hook | git diff 出 patch 可审查；无内置语法门禁 |
| **SWE-agent** | Issue 文本 + 复现脚本输出 | 专用 ACI：search_dir→search_file→open→goto 三级放大 | **行号区间整段替换**（edit 起行:止行），改完自动滚到新代码 | **Docker**（SWE-bench 预构建镜像），评测侧 1800s/实例 | **未设计该场景**（SWE-bench 全是 CLI Python 库） | **完全不用**，专用有上限关键词搜索（结果太多不给，逼模型写更具体关键词） | 步数/成本预算；旧观察自动折叠（保留最近5条）；格式错误重试；lint 报错提示"DO NOT re-run" | **改完立刻 flake8，语法错整体回滚**，同时回喂错误类型+改后快照+原快照（消融证明三样缺一不可） |
| **Aider** | `/run` 输出 + `/test` 仅失败时回喂 | 人在环，你说一句它改一轮 | whole / diff / udiff 多种编辑块格式，模型按约定输出 | **无沙箱**，直接本机 git 仓库，超时未公开 | **不设计该场景**（假定人当司机） | **tree-sitter AST + PageRank 图排序的 repo map**，贪心填 token 窗口（默认1k） | 回合制（你说一句它改一轮）；Ctrl-C 随时打断；auto-test 无内置失败熔断 | **每次改动自动 git commit**，`/undo` 一键回滚；编辑锚点不唯一则回喂重写 |
| **Codex CLI** | 终端 stdout/stderr 直接喂回 + web_search + MCP | 通用 ReAct 循环，模型自己推理 | **apply_patch（V4A diff 格式）**，Lark 语法解析器解析成结构化 FileOp | **本地内核级沙箱**（Linux bwrap / macOS Seatbelt / Windows 受限Token），规则 DSL 审批，硬编码黑名单 | 无内建浏览器，沙箱默认隔离网络，起服务走受控代理桥 | **基本不用**，list_dir + shell grep + MCP，无 repo map | 有 interrupt / steer（飞行中注入指令）；Hooks pre_tool_use 可 block；无内建 doom-loop | apply_patch 上下文锚点匹配，匹配不上该 FileOp 失败；审批层可设 on-request |
| **opencode** | shell 流式输出 + **LSP diagnostics 实时回灌** | explore 只读子 agent + grep/glob + LSP goToDefinition/references | edit 精确字符串替换（不靠行号）+ applyPatch + write | 本地 bash，默认 120s / 最大 600s，**`run_in_background` 后台 fork（task_id）** | run_in_background 起服务，无内建浏览器，靠 MCP（Playwright）冒烟 | **混合**：grep/glob + 实验性 LSP 符号级检索 + repo_overview，无向量嵌入 | **硬编码 doom-loop=3**（同工具同参数连续3次停下来要授权）；每 agent steps 可配；上下文预留 20000 token | oldString 必须精确匹配否则 throw；每文件信号量锁串行；返回 diff |
| **TRAE** | IDE：自然语言+预览 console；CLI：bash 输出+sentinel banner 抓 exit code | IDE：SOLO 自动规划；CLI：sequentialthinking 结构化思考（5-25步） | CLI：str_replace（唯一匹配）+ create（不覆盖）+ insert（按行） | CLI：**Docker 容器**（DockerToolExecutor），bash 120s 超时；IDE：sandbox.json 策略 | **IDE/SOLO 内建 webview**，直接点元素+读 console+实时调试（最强）；CLI 无 | **基本不用**，CLI 靠 bash grep，IDE 靠自身代码索引 | CLI：max_steps 硬上限（示例200）；必须显式 task_done；max_retries=10 | str_replace 要求唯一匹配；--must-patch 强制 git diff；测试目录过滤防乱改 |

---

## 二、关键设计取舍："为什么这么做"

### 2.1 错误获取：别把环境噪音当代码错误

| 做法 | 代表产品 | 解决什么问题 |
|---|---|---|
| **LSP diagnostics 自动回灌** | Claude Code、opencode | 类型错误、语法错误不跑命令就能进模型视野，比跑测试快得多 |
| **仅失败时回喂测试输出** | Aider `/test` | 测试通过了就不打扰模型，省 token，避免"绿了还在修" |
| **退出码 + 输出分流** | 所有成熟产品 | exit=0 是成功，exit≠0 才看输出；超时（exit=-1）是另一类问题，不能和代码错误混为一谈 |
| **Monitor 盯日志流** | Claude Code | 长驻程序的错误是异步出现的，不是跑完一次命令就有 |

**我方问题**：`_call_debugger` 不区分 exit_code，把超时提示、pip 日志原样当代码错误喂 LLM（缺陷 2.1）。

### 2.2 编辑格式：从"全量重写"到"带门禁的 patch"

演进路线：
1. **全量重写**（Aider whole / Write）——简单但大文件费 token，容易丢未改动部分
2. **精确字符串替换**（Claude Code / opencode / OpenHands）——old_string 必须唯一匹配，匹配不上就报错，本身就是门禁
3. **SEARCH/REPLACE block + 多层 fallback**（Cline）——精确匹配→行级 trim→块锚点→全文搜索，容错率高
4. **行号区间替换**（SWE-agent）——配合文件查看器的行号窗口，模型改完立刻看到结果
5. **结构化 diff + 语法解析器**（Codex CLI apply_patch V4A）——Lark 解析器把 patch 变成 FileOp，比纯字符串多一层形式化校验
6. **sketch + 双模型**（Cursor）——主模型只画草图，笨模型负责 apply，apply 错了 reapply

**共同底线**：没有任何一款成熟产品让 LLM 直接 `write_text()` 覆盖文件而不做任何校验。**我方 Debugger 的 write_file/edit_file/delete_file 全是裸操作**（缺陷 3.4），这是最大的安全漏洞。

### 2.3 命令执行：沙箱不是必须的，但"进程管理"是必须的

| 维度 | 做法 |
|---|---|
| **沙箱隔离** | Codex CLI（内核级）、OpenHands/SWE-agent/TRAE（Docker）、Cline/Claude Code/opencode/Aider（无沙箱，直接本机） |
| **超时** | 几乎都有明确超时（2min/120s/300s），且超时后**必须能拿到已输出的内容** |
| **后台进程** | Claude Code `run_in_background`、opencode `run_in_background`+task_id、Cursor `is_background`、Cline "Proceed While Running"——都有明确的后台原语 |
| **取消时杀进程** | 所有产品的取消都会清理子进程（这是基本要求） |

**我方问题**：
- 普通命令超时分支 `wait_for` 把已读 stdout 全丢了（缺陷 1.1）
- 长驻命令 EOF（自己崩溃退出）无脑返回 exit=0（缺陷 3.1）
- 没有 `finally` 杀进程，取消时子进程变孤儿（缺陷 3.2）

### 2.4 GUI / 长驻进程冒烟：这是业界公认的难题，分三派

| 派别 | 代表 | 做法 | 优劣 |
|---|---|---|---|
| **人在环** | Cursor Debug Mode、Aider | 让用户自己复现，Agent 收日志/插桩 | 最准，但不自动 |
| **无头浏览器** | Cline、TRAE SOLO、OpenHands | 内置 Playwright/Chromium，截图+读 console+点元素 | Web 场景强，桌面 GUI（PySide6/Tkinter）覆盖不了 |
| **后台起服务+自己探活** | Claude Code、opencode、Codex CLI | run_in_background 起服务，然后 curl/Monitor 盯端口日志 | 通用但需要模型自己组合，没有封装 |

**关键发现**：**没有任何一款产品用"超时=启动成功"来判定 GUI 程序**。我方 `_is_run_ok` 的"超时+源码扫到 import PySide6=成功"是独一份的脆弱设计（缺陷 1.4）。

正确做法应该是：**后台启动 → 检测启动标志（日志关键字/端口监听/进程存活 N 秒）→ 判定 → 用完 kill**。

### 2.5 RAG / 代码检索：分三派，但没有一派用"纯向量"

| 派别 | 代表 | 做法 |
|---|---|---|
| **语义索引派** | Cursor | embedding 索引整个代码库，codebase_search 语义检索 |
| **Repo Map 派** | Aider | tree-sitter 抽符号 + PageRank 图排序 + 贪心填 token 窗口 |
| **Agentic 搜索派** | Claude Code、OpenHands、SWE-agent、opencode、Codex CLI、TRAE | 不用向量，靠 grep/glob/LSP/专用搜索工具，模型自己决定搜什么 |

**共识**：
- 修复场景下，**符号级/函数级粒度**比文件级或 chunk 级更有用
- 纯向量检索容易返回注释、测试、废弃代码（Cursor 的 codebase_search 也被吐槽过）
- LSP（goToDefinition / references / diagnostics）是被低估的利器——Claude Code 和 opencode 都在用

**我方**：有 `_collect_related_files` 和 LSP 符号上下文，方向是对的，但喂给检索的 error_text 被污染了（缺陷 5.1），垃圾进垃圾出。

### 2.6 熔断 / 防空转：每家都有，而且都是"多层防护"

| 机制 | 代表产品 | 说明 |
|---|---|---|
| **总轮次/总步数硬上限** | SWE-agent（max_steps）、TRAE（max_steps=200）、OpenHands（MAX_ITER）、Claude Code（max_turns 可选） | 最基础的兜底 |
| **总时长/总预算** | Claude Code（max_budget_usd）、Cline CLI（--timeout） | 花钱/花时间的上限 |
| **重复调用检测（doom-loop）** | opencode（硬编码=3，同工具同参数连续3次停下来要授权） | 防"read_file 同一文件 10 次" |
| **空转检测** | Claude Code（连续3次工具调用且每次新内容<500token → 停下来问用户） | 防"在打转但参数微变" |
| **上下文压缩熔断** | Claude Code（compacting 连续失败3次就停，血泪教训：1279个session连续压缩失败50+次，每天浪费25万次API调用） | 防上下文撑爆后死循环 |
| **每轮 await 包超时** | 所有成熟产品的实现方式 | **不是在循环开头看表，是把每次 await 包进 wait_for** |
| **中途取消** | 全部产品 | Esc/Ctrl-C/停止按钮，且取消会清理子进程 |

**我方问题**：240s 熔断是"循环开头检查点"式的，一次永不返回的 `await llm.chat()` 就能把它死死压住（缺陷 4.1）；同步文件 IO 堵死事件循环导致取消请求排不进来（缺陷 4.2）；重复检测只挡完全相同参数，挡不住"同一文件不同 offset"（缺陷 4.3）。

### 2.7 编辑安全：git 是最便宜的安全网

| 做法 | 代表 |
|---|---|
| **每次改动自动 git commit** | Aider（`/undo` 一键回滚） |
| **Checkpoint 快照系统** | Cline（每步拍工作区快照，可 compare/restore） |
| **改完立刻语法校验，错了回滚** | SWE-agent（flake8 门禁，三样回喂：错误类型+改后快照+原快照） |
| **LSP 后检** | Claude Code、Cline（改完自动报类型/linter 错误） |
| **写前必读 + 文件变动检测** | Claude Code（必须先读过才能改，读后磁盘变了则 Edit 失败） |

**我方**：落盘器主路径（ArtifactWriter / apply_patches）有 `validate_content` 语法门禁 + 快照 + 变更日志，做得不错。**但 Debugger 工具循环里的 write/edit/delete 完全绕过了这些护栏**（缺陷 3.4），两条路径安全等级不一致。

---

## 三、我方缺陷清单（对照 6 个维度）

### 维度一：错误获取与判定

| # | 缺陷 | 位置 | 严重度 | 业界参考 |
|---|---|---|---|---|
| 1.1 | 普通命令超时分支 `wait_for` 把已读 stdout 全丢了，output 只剩"[命令超时]"，GUI 启动日志全部蒸发 | `tools.py` run_command L1321-1332 | **P0** | 长驻分支自己 readline 攒 buf，超时能带 `buf[-2000:]`；所有产品超时后都能拿到已输出内容 |
| 1.2 | `_is_gui_or_interactive` 不排除 `.venv`/`node_modules`，`[:40]` 全是 venv 文件导致漏检；每个文件只读前 4000 字符 | `verification.py` L441-450 | **P1** | `_serve_smoke` L70 老老实实排除了 node_modules/.git，这里漏了 |
| 1.3 | `'Error:' in out` / `'Exception' in out` 裸子串匹配，且排在 GUI 检测前面——Qt 警告、pip 日志直接判失败 | `verification.py` _is_run_ok L404-406 | **P1** | Aider 仅失败时回喂；所有产品都做 exit_code 分流 |
| 1.4 | "超时=GUI 成功"没有任何真启动证据，启动即死锁的程序和正常启动表现一样 | `verification.py` L408-409 | **P2** | 没有任何产品用"超时=成功"；正确做法是后台启动→检测启动标志→判定→kill |

### 维度二：诊断上下文注入

| # | 缺陷 | 位置 | 严重度 | 业界参考 |
|---|---|---|---|---|
| 2.1 | **不区分 exit_code**，超时提示、pip 日志、端口占用提示统统截末尾 3000 字当"代码错误"喂 Debugger | `verification.py` _call_debugger L288 | **P0** | Aider `/test` 仅失败时回喂；所有产品都按 exit_code 分流 |
| 2.2 | 错误只取末尾 3000，编译型错误（tsc/gcc）根因在中间会被丢掉 | `verification.py` L288 | P2 | — |

### 维度三：工具集设计

| # | 缺陷 | 位置 | 严重度 | 业界参考 |
|---|---|---|---|---|
| 3.1 | 长驻命令进程自己崩溃退出（EOF）也返回 `exit_code: 0`，崩溃=冒烟通过 | `tools.py` run_command L1298-1317 | **P0** | 所有产品 EOF 后都看 returncode |
| 3.2 | **没有 `finally` 杀进程**，外部取消（CancelledError）不进 TimeoutError 分支，子进程变孤儿占端口 | `tools.py` L1320-1332 / L1283-1317 | **P0** | 所有产品取消都会清理子进程 |
| 3.3 | Debugger 工具循环里的 run_command 绕过 `validate_command` 命令白名单，`_BLOCKED_PATTERNS` 不生效 | `tools.py` execute_debugger_tool L962-977 | **P1** | 冒烟主路径 L115 老老实实调了 validate_command |
| 3.4 | **Debugger 的 write_file/edit_file/delete_file 全是裸操作**：不做语法校验、不留快照、不记变更日志 | `tools.py` L891-938 | **P1** | 落盘器主路径有 validate_content+快照+ChangeLogger；所有产品编辑都有门禁 |
| 3.5 | edit_file 的 `_fuzzy_apply` 只取第一处匹配，不检查重复片段；而 `apply_incremental_patch` 有 `occurrences>1→拒绝`，安全标准不统一 | `tools.py` L918-925 / L554-571 | **P1** | Claude Code old_string 必须唯一匹配；SWE-agent 行号区间 |
| 3.6 | stderr 全合并进 stdout，错误栈和正常输出混在一起，`Error:` 关键词更容易误命中 | `tools.py` L1276 | P2 | — |

### 维度四：熔断与取消（实测"卡死9分钟"的根因）

| # | 缺陷 | 位置 | 严重度 | 业界参考 |
|---|---|---|---|---|
| 4.1 | **240s 熔断是循环开头检查点式的**，`await llm.chat()` 挂起期间没有协程能查时间，一次永不返回的 LLM 请求就能让熔断永远等不到执行 | `verification.py` _call_debugger L320-339 | **P0** | 所有成熟产品把每轮 await 包进 `wait_for(剩余预算)`，不是循环开头看表 |
| 4.2 | **同步文件 IO 堵死事件循环**：read_file `read_text()`、list_files `iterdir()` 全在 async 函数里直接跑同步 IO，没走 `run_in_executor`。FastAPI 取消请求由同一事件循环调度——循环被堵，取消根本排不进来 | `tools.py` execute_debugger_tool 全文 | **P0** | — |
| 4.3 | 重复调用检测只挡"完全相同参数"，`read_file('main.py', offset=1)` 和 `read_file('main.py', offset=201)` 不算重复，拦不住 | `verification.py` L351-356 | **P1** | opencode doom-loop 检测同工具同参数；Claude Code 空转检测看新内容量 |
| 4.4 | 催办提示第 4 轮才来，前 3 轮 LLM 自由 read_file | `verification.py` L328-333 | P2 | — |
| 4.5 | ask_user 等用户 600s，期间 240s 熔断检查点跑不到，等于熔断豁免窗口 | `verification.py` _ask_user L386 | P2 | — |

### 维度五：RAG / 相关文件收集

| # | 缺陷 | 位置 | 严重度 | 业界参考 |
|---|---|---|---|---|
| 5.1 | 喂给 `_collect_related_files` 的 error_text 已被污染（超时提示/pip日志），检索质量从源头就废了 | `verification.py` L291 | **P1** | 先洗成真正的 Traceback 再检索；Aider repo map 不依赖错误文本 |
| 5.2 | transcript 按"元素个数"裁剪（>7条），不按 token；read_file 一条几万字，保留6条照样撑爆上下文 | `verification.py` L368-369 | P2 | Claude Code 按 token 预算管理；OpenHands Condenser 按事件数+摘要 |

### 维度六：编辑安全

| # | 缺陷 | 位置 | 严重度 | 业界参考 |
|---|---|---|---|---|
| 6.1 | `apply_patches` 返回 `List[Dict]`，只要 patches 非空就恒为 True，**所有补丁全失败也 "算成功" continue** | `verification.py` L192 | **P1** | 应统计 `sum(ok)` ，0个成功就别 continue |
| 6.2 | 最终 fix_patches 应用失败原因不回填给 LLM，工具循环是闭环但最终补丁这一下是开环 | `verification.py` L344-348 | **P1** | SWE-agent 三样回喂（错误类型+改后快照+原快照） |
| 6.3 | apply_patches 语法门禁只管单文件，不校验跨文件影响（改了函数名别处还在调旧名） | `tools.py` L604/L617 | P2 | LSP diagnostics 后检可补 |

### 其他

| # | 缺陷 | 位置 | 严重度 |
|---|---|---|---|
| 7.1 | ModuleNotFoundError 只查 output 子串，`ImportError: DLL load failed` 不命中 | verification.py L165 | P2 |
| 7.2 | Windows 下 `create_subprocess_shell` 经 cmd.exe 包装，returncode 不一定等于真实退出码 | tools.py L1336 | P2 |
| 7.3 | `parse_fix_output(json.dumps({'fix_patches': resp['patches']}))` 多套一层序列化 | verification.py L345 | P3 |
| 7.4 | `sanitize_test_command` 用"空格+中文"截断，中文文件名会被截成裸命令→跳过冒烟 | tools.py L1162 | P2 |

---

## 四、修改建议（按优先级）

### P0 — 必须立刻修（直接导致卡死、误判、孤儿进程）

| 改动 | 涉及文件/函数 | 改动量级 | 说明 |
|---|---|---|---|
| **run_command 加 `try/finally` 确保杀进程** | tools.py run_command（普通分支+长驻分支） | ~15行 | 缺陷 3.2。CancelledError 和 TimeoutError 都必须杀子进程 |
| **普通命令超时改成流式攒 buf** | tools.py run_command L1321-1332 | ~20行 | 缺陷 1.1。不用 `wait_for(communicate())`，改用 `wait_for(readline 循环)`，超时能带 `buf[-3000:]` |
| **长驻命令 EOF 后看 returncode** | tools.py run_command L1298-1317 | ~5行 | 缺陷 3.1。EOF break 后检查 `proc.returncode`，非 0 按失败返回 |
| **熔断改成"每轮 await 包 `asyncio.wait_for(剩余预算)`"** | verification.py _call_debugger L320-339 | ~15行 | 缺陷 4.1。不是循环开头看表，是把 `llm.chat()` 和每个工具调用都包进 `wait_for(deadline - now)` |
| **同步文件 IO 挪到 `run_in_executor`** | tools.py execute_debugger_tool（read_file/list_files/edit_file/write_file/delete_file） | ~30行 | 缺陷 4.2。否则取消请求排不进事件循环 |
| **进 debugger 前按 exit_code 分流** | verification.py _smoke_fix_loop / _call_debugger L288 | ~20行 | 缺陷 2.1。exit=-1（超时/GUI长驻）不叫 debugger；环境错误（pip/端口/依赖）走 need_human；只有真带 Traceback 的才进 debugger |

**P0 总改动量：约 100-120 行，集中在两个文件。**

### P1 — 严重影响正确性和安全性

| 改动 | 涉及文件/函数 | 改动量级 | 说明 |
|---|---|---|---|
| **Debugger 写操作加护栏**：write/edit/delete_file 统一走 validate_content + 快照 + ChangeLogger | tools.py execute_debugger_tool L891-938 | ~40行 | 缺陷 3.4。和落盘器主路径对齐 |
| **Debugger run_command 加命令白名单** | tools.py execute_debugger_tool L962-977 | ~5行 | 缺陷 3.3。调 validate_command |
| **edit_file 加重复片段拒绝** | tools.py _fuzzy_apply L554-571 | ~10行 | 缺陷 3.5。和 apply_incremental_patch 对齐 |
| **修 `_is_gui_or_interactive`**：排除 .venv/venv/node_modules，按文件行数而非前 4000 字 | verification.py L441-450 | ~15行 | 缺陷 1.2 |
| **`_is_run_ok` 错误栈检测收窄**：去掉裸 `'Error:'`/`'Exception'`，改用正则匹配 `^\w+Error:` / `Traceback`，且 GUI 检测提前 | verification.py L404-406 | ~10行 | 缺陷 1.3 |
| **apply_patches 返回值判断修正** | verification.py L192 | ~3行 | 缺陷 6.1。统计 `sum(ok)` |
| **最终 fix_patches 应用失败回填给 LLM** | verification.py L344-348 | ~15行 | 缺陷 6.2。apply 失败时把错误信息作为 tool_result 回填，让 LLM 再试一轮 |
| **重复调用检测按"工具名+归一化路径"去重** | verification.py L351-356 | ~5行 | 缺陷 4.3 |
| **error_text 清洗后再检索** | verification.py L288-291 | ~15行 | 缺陷 5.1。提取真正的 Traceback 段，剥离超时提示/pip 日志 |

**P1 总改动量：约 120-130 行。**

### P2 — 增强项，有空再做

| 改动 | 说明 |
|---|---|
| GUI 冒烟改成"后台启动→检测启动标志→进程存活 N 秒→kill"（缺陷 1.4） | 最大的架构改进，但需要定义"启动标志"配置 |
| transcript 按 token 裁剪而非元素个数（缺陷 5.2） | |
| stderr/stdout 分离（缺陷 3.6） | |
| 催办提示提前到第 2 轮（缺陷 4.4） | |
| ask_user 计入熔断预算（缺陷 4.5） | |
| 跨文件影响校验（LSP diagnostics 后检）（缺陷 6.3） | |
| ModuleNotFoundError 检测扩展（缺陷 7.1） | |
| Windows returncode 修正（缺陷 7.2） | |
| 中文文件名命令截断修正（缺陷 7.4） | |

---

## 五、结论

**我方 Debugger 最致命的根因：熔断和取消机制是"检查点式"的——在 asyncio 单线程里，一次永不返回的 `await llm.chat()` 或一次同步文件 IO 就能把整个事件循环堵死，240s 熔断检查点永远等不到执行，取消请求也排不进来；与此同时，错误获取层不做 exit_code 分流，把超时提示和环境噪音当代码错误喂给 LLM，导致 Debugger 从一开始就在修一个不存在的 bug。**

一句话：**不是 LLM 不行，是护栏漏了——进程管理漏了（孤儿进程+超时丢输出）、熔断漏了（检查点式管不住 await）、错误分流漏了（噪音当 bug）。** 这三个 P0 修完，Debugger 的"总是出问题"能消掉 80%。

---

## 附录：主要来源

### Cursor
- Debug Mode 官方博客：https://cursor.com/blog/debug-mode
- 泄露的 Agent 系统提示+工具 schema：https://gist.github.com/sshh12/25ad2e40529b269a88b80e7cf1c38084
- Agent 概览：https://cursor.com/docs/agent/overview

### Claude Code
- Agent SDK 工具列表：https://platform.claude.com/docs/en/agent-sdk/overview
- 工具行为详解：https://cc.bruniaux.com/guide/tools-reference/
- RAG 四层架构：https://finisky.github.io/en/claude-code-rag/
- max_turns/max_budget：https://code.claude.com/docs/en/agent-sdk/agent-loop
- 压缩熔断源码分析：https://openedclaude.github.io/claude-reviews-claude/chapters/11-compact-system

### Cline
- 架构详解：https://ggprompts.com/architecture/cline/index.html
- 编辑格式 4 层 fallback：https://wuu73.org/blog/infoblogs/coding_file_edits/agents.html
- 系统提示原文：https://gist.github.com/maoxiaoke/cd960ac88e11b08cbb4fa697439ebc68
- CLI 参数：https://docs.cline.bot/cli/cli-reference

### OpenHands
- 论文 arXiv:2407.16741：https://arxiv.org/pdf/2407.16741
- Runtime 架构：https://docs.openhands.dev/openhands/usage/architecture/runtime
- Skills/AGENTS.md：https://docs.openhands.dev/overview/skills
- resolver 源码：https://github.com/OpenHands/OpenHands/blob/0.48.0/openhands/resolver/issue_resolver.py

### SWE-agent
- 论文 arXiv:2405.15793：https://arxiv.org/pdf/2405.15793
- 项目背景：https://swe-agent.com/latest/background/
- SWE-bench 评测：https://www.swebench.com/SWE-bench/faq/

### Aider
- Repo map 官方文档：https://aider.chat/docs/repomap.html
- 命令文档：https://aider.chat/docs/usage/commands.html
- Lint/test 循环：https://aider.chat/docs/usage/lint-test.html
- 编辑格式 FAQ：https://aider.chat/docs/faq.html

### Codex CLI
- 架构/工具/沙箱：https://zylos.ai/research/2026-03-26-openai-codex-cli-architecture-multi-runtime-patterns/
- 沙箱官方文档：https://www.mintlify.com/openai/codex/architecture/sandboxing
- apply_patch V4A：https://codex.danielvaughan.com/2026/03/31/codex-cli-apply-patch-v4a-diff-format/

### opencode
- 源码级架构拆解：https://blog.csdn.net/m0_64005868/article/details/161303464
- 官方工具文档：https://docs.opencode.ai/docs/tools/
- LSP 代码智能：https://opencode.runman.ai/en/5-advanced/19-lsp.html
- 子 agent 文档：https://www.opencode.asia/agents/

### TRAE
- 官方文档：https://docs.trae.ai/docs/what-is-trae
- SOLO 模式：https://docs.trae.ai/ide/solo-mode
- trae-agent 架构（DeepWiki）：https://deepwiki.com/bytedance/trae-agent/1-overview
- trae-agent 论文：https://arxiv.org/pdf/2510.16786
- GitHub：https://github.com/bytedance/trae-agent
