# python/routers/image.py
# AI 生图（Seedream 最便宜档，供 APP 界面素材 / 用户随手生图）
# 走火山方舟 OpenAI 兼容 /images/generations 接口，复用设置里保存的豆包 key
import json
import os
from pathlib import Path
import httpx
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/image", tags=["image"])

# 默认生图模型：Seedream 4.0（已验证可用；3.0 需方舟控制台单独开通）
# 想换 4.5/5.0 等，在设置里给厂商配 image_model 即可覆盖（4.5 需要 2K 等参数，暂未适配）
DEFAULT_MODEL = "doubao-seedream-4-0-250828"
DEFAULT_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3"


def get_api_config():
    """读取前端保存的 API 配置（与 routers/agent.py 保持一致），返回当前厂商扁平配置"""
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
                current = raw.get('current') or (raw.get('provider', 'deepseek') if is_legacy else 'deepseek')
                prov = providers.get(current, {}) if isinstance(providers, dict) else {}
                return {
                    'provider': current,
                    'api_key': prov.get('api_key', ''),
                    'model': prov.get('model', ''),
                    'base_url': prov.get('base_url', ''),
                    'image_model': prov.get('image_model', ''),
                }
    except Exception as e:
        print(f'[image.py] 读取配置失败: {e}')
    return {}


class GenerateRequest(BaseModel):
    prompt: str
    size: str = "1024x1024"      # 支持 512x512 / 768x768 / 1024x1024 等方舟允许尺寸
    count: int = 1


@router.post("/generate")
async def generate_image(req: GenerateRequest):
    """文生图：返回 base64 图片列表（前端展示/保存）"""
    prompt = (req.prompt or '').strip()
    if not prompt:
        return {"ok": False, "error": "提示词不能为空"}

    cfg = get_api_config()
    api_key = cfg.get('api_key', '')
    base_url = (cfg.get('base_url') or DEFAULT_BASE_URL).rstrip('/')
    model = cfg.get('image_model') or DEFAULT_MODEL

    if not api_key:
        return {
            "ok": False,
            "error": "未配置豆包（火山方舟）API Key，请到设置中填写",
            "provider": cfg.get('provider', ''),
        }

    try:
        async with httpx.AsyncClient(timeout=180.0) as client:
            response = await client.post(
                f"{base_url}/images/generations",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": model,
                    "prompt": prompt,
                    "size": req.size,
                    "n": max(1, min(req.count, 4)),
                    "response_format": "b64_json",
                    "watermark": False,
                },
            )

            if response.status_code != 200:
                detail = response.text[:300]
                return {
                    "ok": False,
                    "error": f"生图 API 请求失败（{response.status_code}）：{detail}",
                    "model": model,
                }

            data = response.json()
            images = []
            for item in data.get("data", []):
                if item.get("b64_json"):
                    images.append({"b64": item["b64_json"]})
                elif item.get("url"):
                    images.append({"url": item["url"]})
            if not images:
                return {"ok": False, "error": "生图成功但未返回图片数据", "model": model}
            return {"ok": True, "images": images, "model": model, "provider": cfg.get('provider', '')}

    except Exception as e:
        return {"ok": False, "error": f"生图失败：{str(e)}", "model": model}
