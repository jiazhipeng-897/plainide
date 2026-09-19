# python/routers/agent.py
from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse
import json
import os
from pathlib import Path
from agents import get_agent
from agents.loader import get_agent_loader

router = APIRouter(prefix="/agent", tags=["agent"])


def get_api_config(provider=None):
    """读取前端保存的 API 配置（按厂商分组），返回当前/指定厂商的扁平配置"""
    try:
        appdata = os.environ.get('APPDATA')
        home = os.environ.get('HOME')
        config_path = None
        if appdata:  # Windows
            config_path = Path(appdata) / 'my-ide' / 'api-config.json'
        elif home:  # macOS / Linux
            macos_path = Path(home) / 'Library' / 'Application Support' / 'my-ide' / 'api-config.json'
            if macos_path.exists():
                config_path = macos_path
            else:
                config_path = Path(home) / '.config' / 'my-ide' / 'api-config.json'
        if config_path and config_path.exists():
            print(f"[agent.py] 读取配置: {config_path}")
            with open(config_path, 'r', encoding='utf-8') as f:
                raw = json.load(f)
                providers = raw.get('providers')
                is_legacy = not isinstance(providers, dict) or not providers
                if is_legacy:
                    p = raw.get('provider', 'deepseek')
                    providers = {p: {
                        'api_key': raw.get('api_key', ''),
                        'model': raw.get('model', ''),
                        'base_url': raw.get('base_url', ''),
                    }}
                current = provider or raw.get('current') or (raw.get('provider', 'deepseek') if is_legacy else 'deepseek')
                prov = providers.get(current, {}) if isinstance(providers, dict) else {}
                cfg = {
                    'provider': current,
                    'api_key': prov.get('api_key', ''),
                    'model': prov.get('model', ''),
                    'base_url': prov.get('base_url', ''),
                }
                print(f"[agent.py] 配置内容: provider={cfg['provider']}, model={cfg['model']}")
                return cfg
        else:
            print(f"[agent.py] 配置文件不存在，使用默认配置")
    except Exception as e:
        print(f'[agent.py] 读取配置失败: {e}')
    return {}

@router.post("/translate")
async def translate(request: Request):
    data = await request.json()
    code = data.get("code", "")
    language = data.get("language", "")
    provider = data.get("provider", "mock")
    
    print(f"[agent.py] ========== 收到翻译请求 ==========")
    print(f"[agent.py] provider: {provider}")
    print(f"[agent.py] language: {language}")
    print(f"[agent.py] code length: {len(code)}")
    
    config = get_api_config()
    
    if provider and provider != "mock":
        config["provider"] = provider
    elif not config.get("provider"):
        config["provider"] = "mock"
    
    print(f"[agent.py] 最终配置 provider: {config.get('provider')}")
    
    agent = get_agent(config.get("provider", "mock"), config)
    result = await agent.translate(code, language)
    
    print(f"[agent.py] 翻译结果 success: {result.success}")
    if result.success:
        print(f"[agent.py] 结果内容长度: {len(result.content)}")
        return result.content
    else:
        print(f"[agent.py] 错误: {result.error}")
        return {"error": result.error}


# ============================================================
# 新增：通用 Agent 对话接口（走 Coordinator）
# ============================================================
@router.post("/chat")
async def chat(request: Request):
    try:
        data = await request.json()
        print(f"[agent.py] ========== 收到 Agent Chat 请求 ==========")
        print(f"[agent.py] 完整数据: {json.dumps(data, ensure_ascii=False, indent=2)}")
        
        messages = data.get("messages", [])
        message = data.get("message", "")
        model = data.get("model", "deepseek-v4-flash")
        
        print(f"[agent.py] message: {message[:100]}..." if len(message) > 100 else f"[agent.py] message: {message}")
        print(f"[agent.py] model: {model}")
        
        # 读取前端保存的配置
        config = get_api_config()
        
        # 如果前端传了 model，用前端的覆盖
        if model:
            config["model"] = model
        if not config.get("provider"):
            config["provider"] = "deepseek"
        if not config.get("api_key"):
            config["api_key"] = ""
        
        print(f"[agent.py] 最终配置 provider: {config.get('provider')}")
        
        # 使用 Coordinator Agent（总控）
        provider = data.get("provider", "chat_facade")
        config["provider"] = provider
        
        agent = get_agent(provider, config)
        print(f"[agent.py] Agent 创建成功: {type(agent).__name__}")
        
        # Coordinator 的 translate 方法接收 context
        result = await agent.translate(
            code=message,  # 把用户消息当 code 传
            language="",
            context={
                "message": message,
                "messages": messages,
                "model": model,
            }
        )
        
        print(f"[agent.py] Chat 结果 success: {result.success}")
        if not result.success:
            print(f"[agent.py] 错误: {result.error}")
            return {
                "success": False,
                "error": result.error,
            }
        
        # ========== 解析 Coordinator 返回的 JSON，调用子 Agent ==========
        try:
            scheduler_json = json.loads(result.content)
            print(f"[agent.py] 解析调度 JSON 成功: {json.dumps(scheduler_json, ensure_ascii=False, indent=2)}")
            
            # 提取 next_agent_decision
            next_decision = scheduler_json.get("next_agent_decision", {})
            agent_role = next_decision.get("agent_role", "")
            context_for_sub = next_decision.get("input_context", message)  # 如果没有则用原始消息
            
            if not agent_role:
                # 如果调度器没有指定子 Agent，直接返回其原始输出
                print("[agent.py] 调度器未指定子 Agent，直接返回原始输出")
                return {
                    "success": True,
                    "content": result.content,
                }
            
            print(f"[agent.py] 调用子 Agent: {agent_role}")
            print(f"[agent.py] 传递给子 Agent 的上下文: {context_for_sub[:200]}..." if len(context_for_sub) > 200 else f"[agent.py] 传递给子 Agent 的上下文: {context_for_sub}")
            
            # 调用子 Agent
            sub_reply = await agent.call_sub_agent(agent_role, context_for_sub)
            
            print(f"[agent.py] 子 Agent 回复长度: {len(sub_reply)}")
            return {
                "success": True,
                "content": sub_reply,
                "agent_role": agent_role,  # 可选：返回调用了哪个 Agent
            }
            
        except json.JSONDecodeError as e:
            # 如果解析 JSON 失败，说明 Coordinator 返回的不是标准 JSON，直接返回
            print(f"[agent.py] JSON 解析失败: {e}，直接返回原始内容")
            return {
                "success": True,
                "content": result.content,
            }
        except Exception as e:
            import traceback
            print(f"[agent.py] ❌ 处理子 Agent 调用失败: {e}")
            print(traceback.format_exc())
            # 降级：返回 Coordinator 的原始输出
            return {
                "success": True,
                "content": result.content,
                "error": f"子 Agent 调用失败: {str(e)}",
            }
            
    except Exception as e:
        import traceback
        print(f"[agent.py] ❌ 异常: {e}")
        print(traceback.format_exc())
        return {"success": False, "error": str(e)}


# ============================================================
# 新增：获取所有已加载的 Agent 列表
# ============================================================
@router.get("/agents")
async def list_agents():
    """返回所有已加载的 Agent 名称列表"""
    try:
        loader = get_agent_loader()
        return {
            "success": True,
            "agents": loader.list_agents()
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }