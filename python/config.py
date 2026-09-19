import os
import json
from pathlib import Path
from typing import Optional

CONFIG_DIR = Path(__file__).parent / "cache"
CONFIG_DIR.mkdir(exist_ok=True)

CONFIG_FILE = CONFIG_DIR / "server_config.json"
ERROR_LOG_FILE = CONFIG_DIR / "errors.log"


def load_config() -> dict:
    """加载服务端配置"""
    if CONFIG_FILE.exists():
        try:
            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return {}
    return {}


def save_config(config: dict):
    """保存服务端配置"""
    with open(CONFIG_FILE, "w", encoding="utf-8") as f:
        json.dump(config, f, indent=2, ensure_ascii=False)


def get_port() -> int:
    """获取端口，默认8765"""
    config = load_config()
    return config.get("port", 8765)


def set_port(port: int):
    """设置端口"""
    config = load_config()
    config["port"] = port
    save_config(config)


def get_api_config(provider=None) -> dict:
    """获取API配置（前端设置的Key等，按厂商分组，Electron userData）"""
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


def save_api_config(api_config: dict):
    """保存API配置"""
    config = load_config()
    config["api"] = api_config
    save_config(config)


def log_error(error: dict):
    """记录错误到日志文件（供错误窗口消费）"""
    import json
    from datetime import datetime
    entry = {
        "timestamp": datetime.now().isoformat(),
        **error
    }
    with open(ERROR_LOG_FILE, "a", encoding="utf-8") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")