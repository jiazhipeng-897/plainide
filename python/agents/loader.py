# python/agents/loader.py
import os
import yaml
from pathlib import Path
from typing import Dict, Optional

# ===== 上架版（release）资产解密 =====
# core_assets.bin = json(zlib(xor(明文))) 由 build_release.py 生成；
# 密钥只存在于本文件（发布时本文件被 PyArmor 加密），实现"黑盒"。
_AGENT_ASSET_NAME = "core_assets.bin"

def _agent_key() -> bytes:
    # "mycodeide-agents-v1" 逐字符拼出，避免明文直现
    _codes = (109, 121, 99, 111, 100, 101, 105, 100, 101, 45,
              97, 103, 101, 110, 116, 115, 45, 118, 49)
    return "".join(chr(c) for c in _codes).encode("utf-8")

def _xor_bytes(data: bytes, key: bytes) -> bytes:
    klen = len(key)
    return bytes(b ^ key[i % klen] for i, b in enumerate(data))

def _decrypt_asset(data: bytes) -> dict:
    import json as _json
    import zlib as _zlib
    return _json.loads(_zlib.decompress(_xor_bytes(data, _agent_key())).decode("utf-8"))


class AgentLoader:
    """加载 codeagent 目录下的所有 Agent 配置。
    release 模式：目录内存在 core_assets.bin（加密资产）时从内存加载，
    明文 prompt/agent.yaml/skills 不落盘；开发模式：直接扫描文件系统。"""

    def __init__(self, base_path: str = None):
        if base_path is None:
            # 默认路径：当前文件所在目录下的 codeagent
            base_path = Path(__file__).parent / "codeagent"
        self.base_path = Path(base_path)
        self.agents: Dict[str, Dict] = {}
        self._asset_mode = False
        if not self._try_load_asset():
            self._load_all_agents()

    def _try_load_asset(self) -> bool:
        """存在加密资产 → 解密加载；返回是否走了资产模式"""
        asset_path = self.base_path / _AGENT_ASSET_NAME
        if not asset_path.exists():
            return False
        try:
            data = _decrypt_asset(asset_path.read_bytes())
        except Exception as e:
            print(f"[AgentLoader] 资产解密失败，回退文件系统: {e}")
            return False
        for name, cfg in (data or {}).items():
            self.agents[name.lower()] = cfg
            print(f"[AgentLoader] 已加载（资产）: {name}")
        self._asset_mode = True
        return True
    
    def _load_all_agents(self):
        """扫描并加载所有 Agent"""
        if not self.base_path.exists():
            print(f"[AgentLoader] 路径不存在: {self.base_path}")
            return
        
        for agent_dir in self.base_path.iterdir():
            if not agent_dir.is_dir():
                continue
            
            agent_name = agent_dir.name
            agent_config = self._load_agent(agent_dir)
            if agent_config:
                self.agents[agent_name.lower()] = agent_config
                print(f"[AgentLoader] 已加载: {agent_name}")
    
    def _load_agent(self, agent_dir: Path) -> Optional[Dict]:
        """加载单个 Agent 的配置"""
        yaml_path = agent_dir / "agent.yaml"
        prompt_path = agent_dir / "prompt.md"
        
        if not yaml_path.exists():
            print(f"[AgentLoader] 跳过 {agent_dir.name}: 缺少 agent.yaml")
            return None
        
        # 加载 YAML
        with open(yaml_path, 'r', encoding='utf-8') as f:
            config = yaml.safe_load(f)
        
        # 加载 prompt
        if prompt_path.exists():
            with open(prompt_path, 'r', encoding='utf-8') as f:
                config['prompt'] = f.read()
        else:
            config['prompt'] = ""
        
        # 加载 routing-table（如果有）
        routing_dir = agent_dir / "routing"
        if routing_dir.exists():
            routing_files = list(routing_dir.glob("*.md")) + list(routing_dir.glob("*.yaml"))
            for rf in routing_files:
                with open(rf, 'r', encoding='utf-8') as f:
                    config['routing'] = f.read()
                break  # 只取第一个
        
        # 加载 skills（递归：一层 *.md 用文件名；子目录只取 <name>/SKILL.md，references 不注入）
        skills_dir = agent_dir / "skills"
        if skills_dir.exists():
            skills = []
            seen = set()
            for skill_file in sorted(skills_dir.rglob("*.md")):
                rel = skill_file.relative_to(skills_dir)
                parts = rel.parts
                if len(parts) == 1:
                    name = skill_file.stem
                else:
                    if parts[-1] != "SKILL.md":
                        continue  # 只加载子目录主文件，references 不单独注入
                    name = parts[0]
                if name in seen:
                    continue
                seen.add(name)
                with open(skill_file, 'r', encoding='utf-8') as f:
                    skills.append({'name': name, 'content': f.read()})
            config['skills'] = skills
        
        return config
    
    def get_agent(self, name: str) -> Optional[Dict]:
        """根据名称获取 Agent 配置"""
        return self.agents.get(name.lower())
    
    def list_agents(self) -> list:
        """列出所有已加载的 Agent"""
        return list(self.agents.keys())
    
    def get_coordinator(self) -> Optional[Dict]:
        """获取 Coordinator（总控）"""
        return self.get_agent("coordinator")


# 单例
_loader = None

def get_agent_loader():
    global _loader
    if _loader is None:
        _loader = AgentLoader()
    return _loader