# 一键构筑 Git 推送脚本

## 用法

### 一键执行（推荐）
双击 `一键构筑并推送.bat`

自动执行：
1. 编译 core.bin（核心编排黑盒）
2. 打包 core_assets.bin（Agent 资产）
3. 复制开放源码到 release/
4. 生成改动快照
5. Git 增量推送到 GitHub

---

### 分步执行

| 脚本 | 作用 |
|------|------|
| `1-build.ps1` | 只编译打包，不推送 |
| `2-push.ps1` | 只推送已编译的改动 |

---

## 快照机制

- 每次推送自动生成快照：`快照/YYYYMMDD-HHmmss.md`
- 快照记录本次改动了哪些文件
- 下次推送只更新改动的文件，不全量推

---

## 闭源保护

以下内容编译为 bin，不暴露源码：
- `core.bin`：核心编排（orchestrator + code_rag + agents 主逻辑）
- `core_assets.bin`：Agent 定义（agent.yaml + skills/）

开放部分只推：
- 前端源码（src/ electron/）
- Python 入口（main.py + core_shield.py + routers/）
- 第三方依赖（vendor/tree_sitter）
