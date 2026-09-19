# python/agents/coordinator_agent.py
import json
import httpx
import re
from typing import Dict, Optional
from .base import BaseAgent, TranslationResult
from .loader import get_agent_loader


class CoordinatorAgent(BaseAgent):
    """总协调官 - 流程控制、上下文管理、智能路由、异常处理"""
    
    def __init__(self, config: Dict):
        super().__init__(config)
        self.provider = config.get("provider", "deepseek")
        self.api_key = config.get("api_key", "")
        self.base_url = config.get("base_url", "https://api.deepseek.com/v1")
        self.model = config.get("model", "deepseek-v4-flash")
        
        # 加载 Coordinator 配置
        loader = get_agent_loader()
        self.coordinator_config = loader.get_coordinator()
        
        if not self.coordinator_config:
            print("[CoordinatorAgent] 警告: 未找到 Coordinator 配置")
    
    def _get_system_prompt(self) -> str:
        """返回 Coordinator 的系统提示词（从 prompt.md 加载）"""
        if self.coordinator_config and self.coordinator_config.get('prompt'):
            return self.coordinator_config['prompt']
        
        # 如果没加载到 prompt，用默认
        return "你是总协调官，负责调度所有 Agent 并控制流程。"
    
    def _get_routing_table(self) -> str:
        """返回路由表"""
        if self.coordinator_config and self.coordinator_config.get('routing'):
            return self.coordinator_config['routing']
        return ""
    
    async def translate(self, code: str, language: str = "", context: Optional[Dict] = None) -> TranslationResult:
        """执行协调任务"""
        if not self.api_key:
            return TranslationResult(
                success=False,
                content="",
                error="请先在设置中配置 API Key",
                provider=self.provider,
            )
        
        try:
            # 从 context 中提取用户消息
            user_message = context.get("message", "") if context else code
            
            # 构建系统提示词（包含路由表）
            system_prompt = self._get_system_prompt()
            routing_table = self._get_routing_table()
            
            if routing_table:
                system_prompt += f"\n\n## 路由表\n\n{routing_table}"
            
            # 构建用户输入
            user_input = f"""
用户消息: {user_message}

当前上下文:
{json.dumps(context or {}, ensure_ascii=False, indent=2)[:2000]}

请根据路由表决定下一步操作，输出 JSON 格式的决策。
"""
            
            async with httpx.AsyncClient(timeout=180.0) as client:
                response = await client.post(
                    f"{self.base_url}/chat/completions",
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": self.model,
                        "messages": [
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": user_input},
                        ],
                        "temperature": 0.3,
                        "max_tokens": 4096,
                    }
                )
                
                if response.status_code != 200:
                    return TranslationResult(
                        success=False,
                        content="",
                        error=f"API 请求失败: {response.status_code}",
                        provider=self.provider,
                    )
                
                data = response.json()
                content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
                
                # 提取 JSON
                json_match = re.search(r'\{[\s\S]*\}', content)
                if json_match:
                    content = json_match.group()
                
                return TranslationResult(
                    success=True,
                    content=content,
                    provider=self.provider,
                )
                
        except httpx.TimeoutException:
            return TranslationResult(
                success=False,
                content="",
                error="请求超时",
                provider=self.provider,
            )
        except Exception as e:
            return TranslationResult(
                success=False,
                content="",
                error=str(e),
                provider=self.provider,
            )
    
    async def call_sub_agent(self, agent_role: str, context: str) -> str:
        """
        调用子 Agent，返回自然语言回复
        
        Args:
            agent_role: Agent 角色名称（如 'code_expert', 'reviewer' 等）
            context: 传递给子 Agent 的上下文信息（用户输入）
        
        Returns:
            子 Agent 的自然语言回复
        """
        if not self.api_key:
            return "错误: 请先在设置中配置 API Key"
        
        loader = get_agent_loader()
        agent_config = loader.get_agent(agent_role)
        
        if not agent_config:
            return f"错误: 未找到 Agent '{agent_role}'"
        
        system_prompt = agent_config.get('prompt', '')
        
        if not system_prompt:
            return f"错误: Agent '{agent_role}' 没有配置 prompt"
        
        print(f"[CoordinatorAgent] 调用子 Agent: {agent_role}")
        print(f"[CoordinatorAgent] context: {context[:200]}..." if len(context) > 200 else f"[CoordinatorAgent] context: {context}")
        
        try:
            async with httpx.AsyncClient(timeout=180.0) as client:
                response = await client.post(
                    f"{self.base_url}/chat/completions",
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": self.model,
                        "messages": [
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": context},
                        ],
                        "temperature": 0.3,
                        "max_tokens": 4096,
                    }
                )
                
                if response.status_code != 200:
                    error_msg = f"API 请求失败: {response.status_code}"
                    print(f"[CoordinatorAgent] ❌ {error_msg}")
                    return f"错误: {error_msg}"
                
                data = response.json()
                content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
                
                print(f"[CoordinatorAgent] 子 Agent 回复长度: {len(content)}")
                return content
                
        except httpx.TimeoutException:
            return "错误: 请求超时"
        except Exception as e:
            print(f"[CoordinatorAgent] ❌ 调用子 Agent 异常: {e}")
            return f"错误: {str(e)}"