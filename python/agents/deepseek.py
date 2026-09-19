# python/agents/deepseek.py
from typing import Dict, Optional
import httpx
import json
from .base import BaseAgent, TranslationResult


class DeepSeekAgent(BaseAgent):
    """DeepSeek API Agent"""
    
    def __init__(self, config: Dict):
        super().__init__(config)
        self.provider = "deepseek"
        self.api_key = config.get("api_key", "")
        self.base_url = config.get("base_url", "https://api.deepseek.com/v1")
        self.model = config.get("model", "deepseek-v4-flash")
    
    async def translate(self, code: str, language: str = "", context: Optional[Dict] = None) -> TranslationResult:
        """翻译代码"""
        if not self.api_key:
            return TranslationResult(
                success=False,
                content="",
                error="请先在设置中配置 DeepSeek API Key",
                provider=self.provider,
            )
        
        try:
            # 构造请求
            system_prompt = self._get_system_prompt()
            user_prompt = f"语言类型: {language or '未知'}\n\n代码:\n```\n{code}\n```"
            
            async with httpx.AsyncClient(timeout=120.0) as client:
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
                            {"role": "user", "content": user_prompt},
                        ],
                        "temperature": 0.3,
                        "max_tokens": 4096,
                    }
                )
                
                if response.status_code != 200:
                    return TranslationResult(
                        success=False,
                        content="",
                        error=f"API 请求失败: {response.status_code} - {response.text}",
                        provider=self.provider,
                    )
                
                data = response.json()
                content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
                
                # 验证是否是合法 JSON
                try:
                    json.loads(content)
                except json.JSONDecodeError:
                    # 尝试提取 JSON
                    import re
                    json_match = re.search(r'\{[\s\S]*\}', content)
                    if json_match:
                        content = json_match.group()
                    else:
                        return TranslationResult(
                            success=False,
                            content="",
                            error="返回内容不是合法 JSON",
                            provider=self.provider,
                        )
                
                return TranslationResult(
                    success=True,
                    content=content,
                    provider=self.provider,
                )
                
        except httpx.TimeoutException:
            return TranslationResult(
                success=False,
                content="",
                error="请求超时，请稍后重试",
                provider=self.provider,
            )
        except Exception as e:
            return TranslationResult(
                success=False,
                content="",
                error=str(e),
                provider=self.provider,
            )