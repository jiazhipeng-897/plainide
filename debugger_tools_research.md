# Debugger 工具与技能插件清单对比报告

> 调研日期：2026-09-16
> 核心问题：我们是不是缺少致命的 agent 插件？debugger 技能太少、工具太少了？
> 我方基准：7 个工具（read_file / write_file / edit_file / delete_file / list_files / run_command / ask_user），位于 `python/orchestrator/tools.py` execute_debugger_tool

---

## 一、10 款产品横向对比表

| 产品 | 工具总数 | 关键工具清单（浓缩） | 技能/插件体系 | 编辑安全 | 检索/诊断 |
|---|---|---|---|---|---|
| **我方** | **7** | read_file / write_file / edit_file / delete_file / list_files / run_command / ask_user | agent.yaml + skills/ 目录（generic-debugger-skill / debug-investigation / coding-diagnose-and-fix-bugs），无 MCP | edit_file 模糊替换无唯一匹配校验；write/edit/delete 无语法门禁无快照 | 无 grep/glob；靠外部 _collect_related_files + LSP 符号；无浏览器 |
| **Cline** | 14 | execute_command / read_file / write_to_file / replace_in_file / search_files / list_files / list_code_definition_names / browser_action / use_mcp_tool / access_mcp_resource / ask_followup_question / attempt_completion / new_task / plan_mode_respond | MCP 一等公民 + Marketplace；.clinerules/.cursorrules 兼容；Skills + Hooks；子代理 SubagentRunner | SEARCH 块精确匹配；**shadow git 快照**每步可回滚；写前必读；审批门 | search_files(ripgrep) + list_code_definition_names(AST概览)；**browser_action 无头浏览器**截图+console |
| **Aider** | 43 命令 | /add /drop /run /test /lint /commit /diff /undo /git /map /web /voice /model /clear /save /load 等 43 条斜杠命令 + 7 种编辑格式(whole/diff/udiff/diff-fenced/editor-diff) | MCP 客户端(.aider.conf.yml)；无插件市场；三模型分工(主/editor/weak)；config 文件 | **每次改动自动 git commit**，/undo 一键回滚；/lint 自动修；old_string 唯一匹配写在提示词里 | tree-sitter **repo map**(PageRank 图排序)；/test 自动跑；无 LSP 无浏览器 |
| **Cursor** | 13 | codebase_search / read_file / write / search_replace / delete_file / list_dir / glob_file_search / grep / run_terminal_cmd / web_search / read_lints / edit_notebook / todo_write | MCP(mcp.json)；Cursor Rules(.cursor/rules/.mdc)；无插件市场 | search_replace old_string 唯一匹配硬校验；写前必读；linter 修复≤3次熔断；无独立回滚工具 | **codebase_search 语义索引** + grep(ripgrep) + glob；read_lints(LSP diagnostics 只读)；无浏览器 |
| **opencode** | 17 | shell / read / write / edit / patch(apply_patch) / grep / glob / task / question / todowrite / skill / webfetch / websearch / lsp(实验性) / plan(实验性) / execute(实验性) / invalid | MCP 完整支持；**Skills 原生加载**(.opencode/skills/)；自定义工具(.opencode/tools/*.ts)；插件 API + 钩子事件；子代理可定义 | edit 精确字符串替换；patch 走 diff；权限粒度 allow/deny/ask；.ignore 覆盖；无 lint 回滚 | grep(ripgrep) + glob；**lsp 完整能力**(goToDefinition/references/hover/call hierarchy)；无浏览器(靠 MCP) |
| **Claude Code** | 45 | Read / Write / Edit / MultiEdit / Bash / PowerShell / Glob / Grep / LSP / Agent / TaskCreate/List/Update/Stop / TodoWrite / WebFetch / WebSearch / **Monitor** / AskUserQuestion / EnterPlanMode/ExitPlanMode / **EnterWorktree/ExitWorktree** / Skill / Workflow / NotebookEdit/Read / ListAgents / SendMessage / CronCreate/Delete/List / ScheduleWakeup / PushNotification / ReportFindings / Artifact / EndConversation / ToolSearch / ListMcpResources / ReadMcpResource / WaitForMcpServers 等 | MCP(.mcp.json)；**Subagents**(.claude/agents/*.md，含 Explore 只读子代理)；**Hooks**(10+ 生命周期事件)；CLAUDE.md；Skills；Plugins 打包体系 | Edit old_string 唯一匹配；**EnterWorktree 隔离**；PreToolUse hook 可拦截；LSP 编辑后自动报类型错；无内置 lint 回滚 | Grep + Glob；**LSP 完整集成**(编辑后自动 diagnostics)；**Monitor 盯日志流**；无内置浏览器(靠 MCP) |
| **Codex CLI** | 19 | read_file / list_dir / glob_file_search / rg / git / **apply_patch**(V4A) / shell_command / web_search / tool_search / view_image / image_gen / update_plan / spawn_agent / send_input / wait_agent / close_agent / resume_agent / spawn_agents_on_csv / multi_tool_use.parallel | MCP 完整支持；**Hooks**(10 事件，v0.124 稳定)；AGENTS.md；Skills(--skill)；config.toml 功能开关；自定义工具靠 MCP | **apply_patch V4A + Lark 语法解析器**；TUI 彩色 diff 预览；approval_policy 三档；sandbox_mode 限制；无 worktree | rg(ripgrep) + glob + list_dir + git 结构化；无 LSP(靠 MCP)；无浏览器(靠 MCP)；无 Monitor |
| **SWE-agent** | 10 | open / goto / scroll_up / scroll_down / create / edit / search_file / search_dir / find_file / submit | 无 MCP 无 skills；**ACI 可重写**(YAML 定义 shell 函数，可换命令集) | **行号区间替换 + flake8 即时回滚**：改完立刻 lint，语法错从备份回滚，回喂错误类型+改后快照+原快照 | search_file/search_dir/find_file(有上限防灌爆)；无 LSP 无语义检索无浏览器 |
| **OpenHands** | ~15 | CmdRunAction / CmdKillAction / FileReadAction / FileWriteAction / FileEditAction / IPythonRunCellAction / BrowseURLAction / BrowseInteractiveAction / MessageAction / AgentDelegateAction / AddTaskAction / ModifyTaskAction / ChangeAgentStateAction / CondensationAction / MCPToolAction | **Skills**(.openhands/skills/ + 官方共享库 GitHub OpenHands/skills)；AGENTS.md；MCP(MCPToolAction)；V1 hooks | FileEdit str_replace 唯一匹配；Docker 沙箱；UserRejectObservation 拒绝；无 flake8 回滚 | 搜索靠 bash grep/rg；**BrowseInteractiveAction 无头 Chromium**(Playwright)；code-explorer 子代理；无 LSP |
| **Trae-agent** | 6+MCP | bash / str_replace_based_edit_tool(view/create/str_replace/insert) / json_edit_tool / sequentialthinking / task_done / **ckg**(代码知识图谱) | MCP **运行时动态发现**(list_tools 注册)；DockerToolExecutor 隔离；无内置 skills | str_replace 精确匹配(不唯一失败)；路径绝对路径校验；Docker 隔离；无 lint 回滚 | 搜索靠 bash；**ckg 代码知识图谱**(类/函数建图)；无 LSP 无浏览器 |
| **Cody** | 6 命令+搜索 | /ask /edit /explain /doc /test /smell + 自定义命令(.vscode/cody.json) | Commands(JSON 自定义)；**OpenCtx**(MCP 前身)；官方 MCP server；Deep Search(企业版) | 不自动改文件，diff 后 Smart Apply 逐条 Accept/Undo；人审默认 | **Sourcegraph 代码搜索引擎**(跨仓库+符号跳转+找引用+code graph)；远程仓库直接读 |

---

## 二、工具数量排行（从少到多）

| 排名 | 产品 | 数量 | 说明 |
|---|---|---|---|
| 1 | Trae-agent | 6+MCP | 极简，靠 MCP 动态扩展 |
| 2 | **我方** | **7** | 比 Trae 多一个 ask_user，比 SWE-agent 少 3 个 |
| 3 | SWE-agent | 10 | ACI 专用命令，刻意收窄 |
| 4 | Cody | 6 命令 | 不是 function-calling 形态，是命令+搜索引擎 |
| 5 | Cursor | 13 | 靠 IDE 上下文注入省工具数 |
| 6 | Cline | 14 | 带浏览器+影子 git |
| 7 | OpenHands | ~15 | 动作集，含浏览器+Python kernel |
| 8 | opencode | 17 | 含实验性工具 |
| 9 | Codex CLI | 19 | V4A patch + 多代理编排 |
| 10 | Aider | 43 命令 | 斜杠命令，非 tool-use |
| 11 | Claude Code | 45 | 全家桶，LSP/Monitor/worktree/cron/跨会话通信 |

**关键发现：工具数量不是决定性因素。** SWE-agent 只有 10 个工具但在 SWE-bench 上表现顶尖，因为它的工具**设计极度克制且每个都有 guardrail**（flake8 回滚、搜索有上限、文件查看器 100 行窗口）。Trae-agent 只有 6 个工具但拿了 SWE-bench 冠军。**我方 7 个工具数量不算最少，但质量和护栏差。**

---

## 三、「我们缺什么」清单

### 🔴 致命缺口（直接导致修复失败或空转）

| # | 缺什么 | 为什么致命 | 业界谁有 | 改动量级 |
|---|---|---|---|---|
| 1 | **grep / glob 搜索工具** | Debugger 只能 read_file + list_files，想搜一个函数名/错误关键词只能让 LLM 猜文件然后逐个读，**这是"连续 read_file 同一文件空转"的直接原因之一**。没有 grep，LLM 定位根因的效率低一个数量级 | 全部产品都有（Cline search_files、Cursor grep、opencode grep/glob、Claude Code Grep/Glob、Codex rg/glob、SWE-agent search_file/search_dir、OpenHands bash grep） | ~30 行，加两个工具函数 |
| 2 | **编辑唯一匹配校验 + 语法门禁** | edit_file 的 _fuzzy_apply 只取第一处匹配，不检查重复片段；write/edit/delete 全是裸操作无 validate_content。**LLM 改错位置或写出语法错误的代码，系统不拦，直接落盘**，然后冒烟又失败，恶性循环 | SWE-agent(flake8回滚)、Claude Code(old_string唯一+LSP后检)、Cursor(唯一匹配硬校验)、Cline(精确匹配+shadow git)、opencode(精确匹配throw) | ~50 行，复用已有 validate_content |
| 3 | **错误分流：不把环境噪音当代码错误** | 这不是工具缺口，是**工具使用方式**的缺口。run_command 返回的 output 不区分 exit_code，pip 日志/超时提示直接喂 debugger。缺一个"错误分类器"工具或前置过滤 | Aider(/test 仅失败回喂)、所有产品都做 exit_code 分流 | ~20 行，在 _call_debugger 入口加分流 |

### 🟡 重要缺口（明显影响效率和正确性）

| # | 缺什么 | 影响 | 业界谁有 | 改动量级 |
|---|---|---|---|---|
| 4 | **todo / task 管理工具** | 多步修复任务没有进度跟踪，LLM 容易忘记自己修到哪一步、重复探索 | Claude Code(TaskCreate/List/Update)、Codex(update_plan)、Cursor(todo_write)、opencode(todowrite)、OpenHands(AddTask/ModifyTask) | ~20 行，加一个 todo_write 工具 |
| 5 | **LSP diagnostics 工具（不只是符号上下文）** | 我方有 LSP 符号上下文注入，但没有让 Debugger **主动查询** LSP 的工具（goToDefinition / findReferences / diagnostics）。改完代码后不能自动查类型错误 | Claude Code(LSP 完整)、opencode(lsp 实验性)、Cursor(read_lints) | 中等，需封装 LSP client |
| 6 | **git 回滚 / 快照机制** | Debugger 的 write/edit/delete 不留快照，删了就没了。改坏了无法一键回滚 | Aider(自动 commit+/undo)、Cline(shadow git checkpoint)、Claude Code(EnterWorktree) | ~30 行，复用已有 snapshot_before |
| 7 | **后台进程管理（起/查/杀）** | run_command 只能同步等结果或超时杀，没有"启动后台服务→查询状态→停止"的原语。GUI/dev server 冒烟无法做 | Claude Code(run_in_background + TaskStop)、opencode(run_in_background + task_id)、Cursor(is_background)、Cline(Proceed While Running)、OpenHands(CmdKillAction) | ~40 行，加 start_background/check_status/stop_command |
| 8 | **MCP 支持** | 无法接入外部工具（Playwright 浏览器、数据库、API），工具集只能靠自己硬编码 | 全部产品都支持 MCP（Cline/Cursor/opencode/Claude Code/Codex/OpenHands/Trae） | 大，需实现 MCP client |

### 🟢 可选增强（有了更好，没有也能活）

| # | 缺什么 | 说明 | 业界谁有 |
|---|---|---|---|
| 9 | **浏览器/无头调试工具** | Web 项目冒烟验证利器，但桌面 GUI(PySide6)覆盖不了 | Cline(browser_action)、OpenHands(BrowseInteractiveAction)、TRAE SOLO(webview) |
| 10 | **Monitor 盯日志工具** | 长驻程序的异步错误捕获 | Claude Code(Monitor) |
| 11 | **子代理 / task 委派** | 复杂搜索派发给只读子代理，省主上下文 | Claude Code(Agent/Explore)、Codex(spawn_agent)、opencode(task)、OpenHands(AgentDelegateAction)、Cline(SubagentRunner) |
| 12 | **web_search / web_fetch** | 查文档、查错误信息 | 大部分产品有 |
| 13 | **代码知识图谱 / repo map** | 全仓骨架概览，帮 LLM 知道该读哪个文件 | Aider(tree-sitter+PageRank)、Trae(ckg)、Cursor(codebase_search) |
| 14 | **sequentialthinking 结构化思考** | 强制 LLM 先想后做，减少盲目编辑 | Trae(sequentialthinking) |
| 15 | **plan_mode 先方案后执行** | 大改动先出方案给用户审 | Claude Code(EnterPlanMode)、Cline(plan_mode_respond) |
| 16 | **json_edit_tool** | 精确改 JSON 配置文件 | Trae(json_edit_tool) |

---

## 四、技能/插件体系对比

| 产品 | MCP | 内置 Skills | 自定义工具 | 钩子/Hooks | 子代理 |
|---|---|---|---|---|---|
| **我方** | ❌ 无 | ✅ skills/ 目录(3个技能) | ❌ 无 | ❌ 无 | ❌ 无（routing 算轻量分流） |
| Cline | ✅ 一等公民+Marketplace | ✅ Skills | ⚠️ 仅 SDK/CLI | ✅ Hooks | ✅ SubagentRunner |
| Aider | ✅ 客户端 | ❌ 无 | ❌ 无 | ❌ 无 | ❌ 无（architect 双模型） |
| Cursor | ✅ mcp.json | ✅ Cursor Rules | ❌ 无 | ❌ 无 | ❌ 无 |
| opencode | ✅ 完整 | ✅ 原生 skill 工具 | ✅ .opencode/tools/*.ts | ✅ 插件 API+事件 | ✅ 可定义子代理 |
| Claude Code | ✅ .mcp.json | ✅ Skill 工具 | ✅ Plugins | ✅ 10+ 事件 | ✅ Subagents(含 Explore) |
| Codex CLI | ✅ 完整 | ✅ --skill | ⚠️ 靠 MCP | ✅ 10 事件 | ✅ spawn_agent 全家桶 |
| SWE-agent | ❌ 无 | ❌ 无 | ✅ ACI 可重写 | ❌ 无 | ❌ 无 |
| OpenHands | ✅ MCPToolAction | ✅ Skills+官方共享库 | ⚠️ 靠 MCP | ✅ V1 hooks | ✅ AgentDelegateAction |
| Trae-agent | ✅ 动态发现 | ❌ 无 | ⚠️ 靠 MCP | ❌ 无 | ❌ 无 |
| Cody | ✅ 官方 MCP | ❌ 无 | ✅ Commands JSON | ❌ 无 | ❌ 无 |

**我方技能体系现状**：有 skills/ 目录（generic-debugger-skill、debug-investigation、coding-diagnose-and-fix-bugs），方向是对的，但：
1. 技能只是 markdown 提示词，**没有工具扩展能力**——技能不能注册新工具
2. 没有 MCP，工具集只能硬编码在 tools.py 里
3. 没有钩子系统，无法在工具调用前后加门控（比如"编辑前自动跑语法校验"）

---

## 五、结论

**我们 debugger 的工具数量（7个）不算最少——Trae-agent 只有 6 个但拿了 SWE-bench 冠军，SWE-agent 只有 10 个。问题不在"太少"，而在"缺了最关键的几个 + 现有的几个没有护栏"。**

**最致命缺的是三样东西：**
1. **grep/glob 搜索工具**——没有它，LLM 只能盲读文件，这是空转的直接原因（~30行可补）
2. **编辑唯一匹配校验 + 语法门禁**——现有 edit_file/write_file 是裸操作，改错位置、写出语法错都不拦，直接落盘然后冒烟又失败（~50行，复用已有 validate_content）
3. **错误分流**——不把 pip 日志/超时提示当代码错误喂 debugger（~20行）

这三样加起来约 100 行代码，修完后 Debugger 的"总是出问题"能消掉大半。**工具数量不是瓶颈，工具质量和护栏才是。** SWE-agent 用 10 个带 guardrail 的工具打赢了一堆有 40 个工具的产品，这就是证据。

---

## 附录：主要来源

- Cline：泄露系统提示(elifuzz.github.io/awesome-system-prompts/cline)；官方文档 docs.cline.bot/tools-reference；GitHub src/core/prompts/system-prompt/tools/
- Aider：官方 aider.chat/docs/usage/commands.html（43条命令全表）；edit-formats.html；DeepWiki aider/commands.py
- Cursor：泄露系统提示(leaked-system-prompts.com/prompts/cursor/cursor-2.0_20251029，13个函数签名)；官方 cursor.com/docs/cli/using
- opencode：源码 packages/opencode/src/tool/registry.ts；官方 opencode.ai/docs/tools/ /skills/ /plugins/
- Claude Code：官方 code.claude.com/docs/en/tools-reference（45个工具全表）；hooks；sub-agents
- Codex CLI：codex.danielvaughan.com/2026/06/03/codex-cli-built-in-tool-surface-complete-reference（v0.136 19工具）；hooks；config.toml
- SWE-agent：论文 arXiv:2405.15793 Table 4；官方配置 swe-agent.com/latest/usage/coding_challenges/
- OpenHands：论文 arXiv:2407.16741；官方 docs.openhands.dev；源码 openhands/events/action/
- Trae-agent：GitHub bytedance/trae-agent（trae_agent/tools/__init__.py）；DeepWiki；论文 arXiv:2510.16786
- Cody：Sourcegraph 官方文档 5.2/6.5（Commands、Chat）；about.sourcegraph.com/blog
