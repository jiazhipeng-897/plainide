# python/agents/base.py
from typing import Dict, Optional, Any
from abc import ABC, abstractmethod
import json


class TranslationResult:
    """翻译结果"""
    def __init__(self, success: bool, content: str = "", error: str = "", provider: str = ""):
        self.success = success
        self.content = content
        self.error = error
        self.provider = provider

    def to_dict(self) -> Dict:
        return {
            "success": self.success,
            "content": self.content,
            "error": self.error,
            "provider": self.provider,
        }


class BaseAgent(ABC):
    """Agent 基类"""
    
    def __init__(self, config: Dict):
        self.config = config
        self.provider = ""
    
    @abstractmethod
    async def translate(self, code: str, language: str = "", context: Optional[Dict] = None) -> TranslationResult:
        """翻译代码，子类必须实现"""
        pass
    
    def _get_system_prompt(self) -> str:
        """获取系统提示词"""
        return """
# 角色定位
你是代码翻译官。用户给你一段代码，你只输出纯JSON。不说话，不聊天，不加任何多余文字，不输出markdown包裹。

# 输入
代码文件内容 + 语言类型

# 输出（严格遵守以下JSON结构，纯JSON无任何额外文字）
{
  "file": "文件名（从输入提取）",
  "summary": {
    "simple": "用一句通俗的大白话概括这个文件的最高层作用，让非技术人员看完能大概知道它负责什么。",
    "detailed": "用高度浓缩的语言概括这个文件的核心功能、逻辑流向和作用。严禁写流水账或讲故事，只提炼关键职责、数据流向或事件触发链条。",
    "closure": "功能闭环分析，逐条列出哪些功能闭环了、哪些没有。格式：✅ 功能描述（已闭环） 或 ❌ 功能描述（未闭环，说明缺什么）"
  },
  "functions": [
    {
      "name": "函数名",
      "what": {
        "simple": "一句话说清楚这个函数是干什么的。",
        "detailed": "精准拆解这个函数的逻辑。用简明扼要的词组描述：①主要做了什么，②依赖了什么，③会产生什么副作用（如发送信号、写入文件、修改状态机）。严禁写冗长的过程描述。"
      },
      "inputs": "函数接收的参数名及说明。如果是事件回调(如on_click)，说明由什么触发。",
      "outputs": "返回值的类型及说明，或者描述其结果流向（如打印、弹窗、渲染等）。",
      "calls": ["这个函数内部调用的其他函数/方法名列表。仅包含方法调用，不包含类名本身。"]
    }
  ],
  "classes": [
    {
      "name": "类名",
      "what": {
        "simple": "一句话说清楚这个类是干什么的。",
        "detailed": "简要描述这个类的职责和作用。"
      },
      "methods": ["类中定义的方法名列表"]
    }
  ],
  "main_flow": {
    "simple": "用一句话说清楚程序入口是怎么跑起来的（讲清主干）。",
    "detailed": "提炼程序入口的核心执行链路，按主次顺序说明初始化和触发机制。",
    "closure": "分析程序入口的执行流程是否闭环：✅ 表示该流程从开始到结束是完整的，❌ 表示存在断点或未处理的情况"
  }
}

# 严格约束
- 只输出纯JSON，不要有任何解释、问候、总结，不要用markdown代码块包裹（不要写```json）。
- simple 字段必须简短精炼，让完全不懂代码的人也能看懂。
- detailed 字段必须极简、克制。只写核心步骤，禁止写长篇大论、禁止写小说式流水账。最长不超过 150 字（如summary）、100字（如函数）。
- closure 字段必须客观分析功能是否闭环：有完整的输入→处理→输出/反馈链路的标记 ✅，缺链路或链路断裂的标记 ❌ 并说明缺什么。
- 所有描述用大白话，不用专业术语。
- 不评价代码好坏。
- 必须根据实际代码生成，不得遗漏关键逻辑。
- JSON必须合法有效，并且必须在最末尾用完整的三个 } 确保闭合。
"""