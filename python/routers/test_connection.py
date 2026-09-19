# python/routers/test_connection.py
"""连接测试：验证前端保存的 API 服务商配置是否可连通（不泄露 API Key）"""
from fastapi import APIRouter
from pydantic import BaseModel
import os
import json
from pathlib import Path
import httpx

router = APIRouter(tags=["连接测试"])


class TestConnectionRequest(BaseModel):
    provider: str = "deepseek"


def _load_config(provider=None):
    """读取前端保存的 API 配置（按厂商分组），返回当前/指定厂商的扁平配置"""
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
        try:
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
                return {
                    'provider': current,
                    'api_key': prov.get('api_key', ''),
                    'model': prov.get('model', ''),
                    'base_url': prov.get('base_url', ''),
                }
        except Exception:
            return {}
    return {}
@router.post("/test-connection")
async def test_connection(req: TestConnectionRequest):
    """测试所选服务商的连通性"""
    config = _load_config(req.provider or None)
    provider = config.get("provider", "deepseek")
    api_key = config.get("api_key", "")
    base_url = config.get("base_url", "").rstrip("/")
    model = config.get("model", "")

    # 各厂商默认模型（model 为空时的 fallback，防止串用其他厂商模型名）
    _DEFAULT_MODELS = {
        "deepseek": "deepseek-v4-flash",
        "openai": "gpt-4o",
        "volcengine": "doubao-seed-evolving",
        "qwen": "qwen3.8-max",
        "tencent": "hunyuan-turbos-latest",
        "baidu": "ernie-4.5-turbo-128k",
        "minimax": "MiniMax-M3",
        "kimi": "kimi-k3",
    }

    if provider == "mock":
        return {"success": True, "message": "模拟模式无需测试"}

    if not api_key:
        return {"success": False, "error": "尚未配置 API Key，请先在设置中保存"}

    # OpenAI 兼容协议（deepseek / openai / 火山 / 千问 / 混元 / 千帆 / MiniMax / Kimi）
    if provider in ("deepseek", "openai", "volcengine", "qwen", "tencent", "baidu", "minimax", "kimi"):
        url = f"{base_url}/chat/completions" if base_url else "https://api.deepseek.com/v1/chat/completions"
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.post(
                    url,
                    headers={
                        "Authorization": f"Bearer {api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": model or _DEFAULT_MODELS.get(provider, "deepseek-v4-flash"),
                        "messages": [{"role": "user", "content": "ping"}],
                        "max_tokens": 1,
                    },
                )
            if resp.status_code == 200:
                return {"success": True, "message": "连接成功"}
            # 尝试解析服务端返回的错误详情（如模型未开通、配额不足等），便于用户定位
            err_detail = ""
            try:
                _data = resp.json()
                _err = _data.get("error", {}) or {}
                if isinstance(_err, dict):
                    err_detail = str(_err.get("message") or _err.get("code") or "")
                elif isinstance(_err, str):
                    err_detail = _err
            except Exception:
                err_detail = ""
            if err_detail:
                err_detail = f": {err_detail[:300]}"
            if resp.status_code in (401, 403):
                return {"success": False, "error": f"API Key 无效或已过期 (HTTP {resp.status_code}){err_detail}"}
            return {"success": False, "error": f"服务端返回异常: HTTP {resp.status_code}{err_detail}"}
        except httpx.TimeoutException:
            return {"success": False, "error": "请求超时，请检查网络或 API 地址"}
        except Exception as e:
            return {"success": False, "error": f"连接失败: {str(e)}"}

    # 其他厂商（协议不同，暂不做深度探测）
    if not base_url:
        return {"success": False, "error": f"未配置 {provider} 的 API 地址"}
    return {"success": True, "message": f"配置已保存，{provider} 请直接尝试翻译验证"}
