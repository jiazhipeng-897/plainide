# python/agents/baidu.py
from typing import Dict, Optional
import httpx
import json
from .base import BaseAgent, TranslationResult


class BaiduAgent(BaseAgent):
    """百度文心 API Agent（千帆 ModelBuilder OpenAI 兼容端点）"""

    def __init__(self, config: Dict):
        super().__init__(config)
        self.provider = "baidu"
        self.api_key = config.get("api_key", "")
        # 千帆 v2 兼容端点只需单个 API Key（Bearer 鉴权），不再需要 secret_key
        self.base_url = config.get("base_url", "https://qianfan.baidubce.com/v2")
        self.model = config.get("model", "ernie-4.5-turbo-128k")

    async def translate(self, code: str, language: str = "", context: Optional[Dict] = None) -> TranslationResult:
        """翻译代码（千帆 /chat/completions，OpenAI 兼容）"""
        if not self.api_key:
            return TranslationResult(
                success=False,
                content="",
                error="请先在设置中配置百度千帆 API Key",
                provider=self.provider,
            )

        try:
            system_prompt = self._get_system_prompt()
            user_prompt = f"语言类型: {language or '未知'}\n\n代码:\n```\n{code}\n```"

            async with httpx.AsyncClient(timeout=120.0) as client:
                response = await client.post(
                    f"{self.base_url.rstrip('/')}/chat/completions",
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
                    }
                )

                if response.status_code != 200:
                    return TranslationResult(
                        success=False,
                        content="",
                        error=f"API 请求失败: {response.status_code} {response.text[:200]}",
                        provider=self.provider,
                    )

                data = response.json()
                if data.get("error"):
                    return TranslationResult(
                        success=False,
                        content="",
                        error=f"百度 API 错误: {data.get('error', {}).get('message', str(data['error']))}",
                        provider=self.provider,
                    )

                content = ""
                try:
                    content = data["choices"][0]["message"]["content"]
                except (KeyError, IndexError, TypeError):
                    return TranslationResult(
                        success=False,
                        content="",
                        error="百度 API 返回格式异常，缺少 choices/message/content",
                        provider=self.provider,
                    )

                # 验证 JSON
                try:
                    json.loads(content)
                except json.JSONDecodeError:
                    import re
                    json_match = re.search(r'\{[\s\S]*\}', content)
                    if json_match:
                        content = json_match.group()

                return TranslationResult(
                    success=True,
                    content=content,
                    provider=self.provider,
                )

        except Exception as e:
            return TranslationResult(
                success=False,
                content="",
                error=str(e),
                provider=self.provider,
            )
