# python/agents/mock_agent.py
from typing import Dict, Optional
import json
import asyncio
from .base import BaseAgent, TranslationResult


class MockAgent(BaseAgent):
    """模拟 Agent（测试用）"""
    
    def __init__(self, config: Dict):
        super().__init__(config)
        self.provider = "mock"
    
    async def translate(self, code: str, language: str = "", context: Optional[Dict] = None) -> TranslationResult:
        """模拟翻译"""
        # 模拟延迟
        await asyncio.sleep(0.5)
        
        # 构造模拟的 JSON 输出
        mock_result = {
            "file": "mock_file.py",
            "summary": "这是一个模拟的翻译结果，用于测试流式渲染功能",
            "functions": [
                {
                    "name": "mock_function",
                    "what": "这是一个模拟函数，用来演示翻译效果",
                    "inputs": "无参数",
                    "outputs": "返回模拟数据",
                    "calls": []
                }
            ],
            "classes": [],
            "main_flow": "程序启动后直接调用 mock_function，输出模拟结果"
        }
        
        content = json.dumps(mock_result, ensure_ascii=False, indent=2)
        
        return TranslationResult(
            success=True,
            content=content,
            provider=self.provider,
        )