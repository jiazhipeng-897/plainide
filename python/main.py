import sys
import os
from pathlib import Path

# 添加项目根目录到 Python 路径
sys.path.insert(0, str(Path(__file__).parent))

# 上架版（Open Core）：存在 core.bin 时注入黑盒核心；开发版无 core.bin 走明文源码
try:
    import core_shield
    core_shield.install()
except Exception:
    pass

# DNS 兜底：部分网络环境解析 LLM 域名失败（getaddrinfo failed），
# 仅当系统 DNS 解析失败时才注入直连 IP 映射（网络正常时完全无感）
try:
    import dns_fallback
    dns_fallback.install_if_needed()
except Exception:
    pass

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import argparse

from config import get_port, load_config, save_config
from utils.logger import Logger

# 创建 FastAPI 应用
app = FastAPI(
    title="My Code IDE - Python Backend",
    version="1.0.0",
    description="统一后端服务：AST解析 / 翻译 / 代码医生",
)

# CORS：仅允许本机来源（localhost / 127.0.0.1 任意端口），
# 避免任意网页跨域调用本机后端（体检 TOP2 修复）
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_methods=["*"],
    allow_headers=["*"],
)


# ========== 健康检查 ==========
@app.get("/health")
async def health():
    return {"status": "ok", "port": get_port()}


# ========== 路由挂载 ==========
# terminal（WebSocket 终端）已下线：前端实际使用 Electron node-pty 终端，
# 该无鉴权 WS 接口存在本机命令执行风险（体检 TOP2 修复），待清理阶段删除文件
from routers import scan, parse, translate, doctor, agent, file, test_connection, image
app.include_router(scan.router)
app.include_router(parse.router)
app.include_router(translate.router)
app.include_router(doctor.router)
app.include_router(agent.router)
app.include_router(file.router)
app.include_router(test_connection.router)
app.include_router(image.router)

# ========== 多 Agent 工作链路编排（独立包，与旧链路解耦） ==========
from orchestrator.router import router as orchestrator_router
app.include_router(orchestrator_router)

# ========== 共绘蓝图模式（Map-Hand Mode，独立新通道） ==========
# 决策层独立：用户（人）替代总调度官与架构师构思，产出设计文档注入架构师阶段，
# 下游执行链完全复用，不耦合流水线文件
from map_hand.router import router as map_hand_router
from mirror.router import router as mirror_router
app.include_router(map_hand_router)
app.include_router(mirror_router)

# ========== 项目入门分析（onboard：接手陌生项目先生成大纲） ==========
from onboarder.router import router as onboard_router
app.include_router(onboard_router)

# ========== 调试器（debugpy DAP） ==========
from debugger import router as debug_router
app.include_router(debug_router)


# ========== 启动 ==========
if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=None)
    args = parser.parse_args()

    # 优先用命令行的端口，没有才读 config
    if args.port is not None:
        port = args.port
    else:
        port = get_port()

    # ===== 保存端口到 server_config.json（保持一致） =====
    config = load_config()
    config["port"] = port
    save_config(config)

    # ===== 把端口号写入文件，供前端读取 =====
    port_file = Path(__file__).parent / "cache" / "port.txt"
    port_file.parent.mkdir(exist_ok=True)
    with open(port_file, "w", encoding="utf-8") as f:
        f.write(str(port))

    Logger.info(f"🚀 启动 FastAPI 服务，端口: {port}", source="system")

    uvicorn.run(
        app,
        host="127.0.0.1",
        port=port,
        log_level="info",
    )
