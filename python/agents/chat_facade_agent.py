# python/agents/chat_facade_agent.py
import json
import httpx
from typing import Dict, Optional
from .base import BaseAgent, TranslationResult
from .coordinator_agent import CoordinatorAgent


class ChatFacadeAgent(BaseAgent):
    """
    对话门面 Agent - 面向用户的唯一对话入口
    
    职责：
    1. 和用户自然语言对话
    2. 判断意图：简单闲聊自己回答，复杂开发调用总调度官
    3. 接收总调度官 JSON，提取可读信息，转述给用户
    4. 绝对禁止将原始 JSON 输出给用户
    """
    
    def __init__(self, config: Dict):
        super().__init__(config)
        self.provider = config.get("provider", "deepseek")
        self.api_key = config.get("api_key", "")
        self.base_url = config.get("base_url", "https://api.deepseek.com/v1")
        self.model = config.get("model", "deepseek-v4-flash")
        
        self.system_prompt = """# 角色：对话门面 ChatFacade Agent
你是软件面向用户的唯一对话入口，负责和人类自然对话交互。
你**不直接执行编码、读写文件、运行终端命令**。
你的后台存在一个【总调度官Orchestrator】，它只会输出机器JSON结构体，用于调度架构师、翻译官、测试等子Agent。

## 你的工作流程
1. 接收用户消息，区分两类意图：
    A）简单闲聊、概念提问、确认疑问：你自己直接用自然语言回复用户。
    B）复杂开发任务（写软件、改代码、批量文件、项目搭建）：不要自己干活，**调用内部总调度官Orchestrator**，把用户上下文完整传给调度官。
2. 接收总调度官返回的完整JSON工作流数据：workflow_state、next_agent_decision、blackboard。
    ⚠️【铁律】绝对禁止直接把这份JSON原文输出给用户。
3. 你提取JSON里面人类可读信息：即将启动的Agent名称、执行阶段，生成自然语言状态话术给到用户。
4. 等待总调度官驱动全部子Agent、工具（文件/IDE终端）执行完毕。
5. 把整套流水线执行结果整理成通顺人话，输出给用户聊天界面。

## 硬性约束（不可违反）
1. 总调度官输出的机器JSON，只允许你内部解析消费，**严禁透传给前端聊天窗口**。
2. 文件创建、代码写入、终端执行，全部交给总调度官调度子Agent完成；你不能直接操作工具。
3. 用户看到的全部输出，只能是自然中文文本，禁止输出JSON、yaml、原始调度结构体。
4. 需要等待后台流水线执行的时候，向用户输出简短状态提示，不要长篇大论。
5. 如果总调度返回异常、security_hold安全拦截、human_intervention_needed需要人工介入，由你向用户转述对应的人类可读提示。
6. 你只负责对外沟通；路由分配、子Agent调度、黑板状态维护全部交给总调度官。

## 禁止行为
❌ 禁止直接输出总调度官返回的JSON
❌ 禁止自己直接写代码、调用文件读写
❌ 禁止把内部调度字段直接展示给用户
❌ 不要冒充架构师、翻译官执行任务，任务交给调度官分发。"""
    
    async def translate(self, code: str, language: str = "", context: Optional[Dict] = None) -> TranslationResult:
        """对话门面入口"""
        if not self.api_key:
            return TranslationResult(
                success=False,
                content="请先在设置中配置 API Key",
                error="API Key 未配置",
                provider=self.provider,
            )
        
        user_message = context.get("message", code) if context else code
        messages = context.get("messages", []) if context else []
        
        try:
            intent = await self._classify_intent(user_message)
            
            if intent == "simple_chat":
                reply = await self._simple_chat(user_message, messages)
                return TranslationResult(success=True, content=reply, provider=self.provider)
            else:
                # 调用总调度官
                coordinator = CoordinatorAgent(self.config)
                coord_result = await coordinator.translate(
                    code=user_message,
                    language="",
                    context=context
                )
                
                if not coord_result.success:
                    return TranslationResult(
                        success=False,
                        content="调度失败：" + coord_result.error,
                        error=coord_result.error,
                        provider=self.provider,
                    )
                
                # 代码层拦截：绝对不直接返回 JSON
                try:
                    scheduler_json = json.loads(coord_result.content)
                except json.JSONDecodeError:
                    return TranslationResult(
                        success=True,
                        content="收到您的需求，正在处理中，请稍候...",
                        provider=self.provider,
                    )
                
                # 检查是否需要人工干预
                if scheduler_json.get("human_intervention_needed", False):
                    human_request = scheduler_json.get("human_intervention_request", {})
                    question = human_request.get("question_to_human", "需要您确认一些信息")
                    return TranslationResult(success=True, content=question, provider=self.provider)
                
                # 提取可读摘要
                readable = self._extract_readable_summary(scheduler_json)
                return TranslationResult(success=True, content=readable, provider=self.provider)
                
        except Exception as e:
            return TranslationResult(
                success=False,
                content="处理失败：" + str(e),
                error=str(e),
                provider=self.provider,
            )
    
    async def _classify_intent(self, message: str) -> str:
        """判断意图"""
        keywords = ["写", "改", "创建", "生成", "帮我", "做", "开发", "构建", "搭建", "实现"]
        for kw in keywords:
            if kw in message:
                return "complex_task"
        return "simple_chat"
    
    async def _simple_chat(self, message: str, messages: list) -> str:
        """简单闲聊"""
        async with httpx.AsyncClient(timeout=60.0) as client:
            chat_messages = [
                {"role": "system", "content": "你是编程助手，用友好自然的中文和用户聊天。简短回答。"}
            ]
            for m in messages[-5:]:
                chat_messages.append({"role": m.get("role", "user"), "content": m.get("content", "")})
            chat_messages.append({"role": "user", "content": message})
            
            response = await client.post(
                f"{self.base_url}/chat/completions",
                headers={"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"},
                json={"model": self.model, "messages": chat_messages, "temperature": 0.7, "max_tokens": 1024}
            )
            
            if response.status_code == 200:
                data = response.json()
                return data.get("choices", [{}])[0].get("message", {}).get("content", "好的")
            return "抱歉，我暂时无法回复"
    
    def _extract_readable_summary(self, scheduler_json: Dict) -> str:
        """提取人类可读摘要"""
        parts = []
        
        next_decision = scheduler_json.get("next_agent_decision", {})
        agent_role = next_decision.get("agent_role", "")
        reason = next_decision.get("reason", "")
        
        agent_map = {
            "requirement": "需求分析师",
            "architect": "架构师",
            "qa": "测试工程师",
            "translator": "翻译官",
            "planner": "规划师",
        }
        
        if agent_role:
            parts.append(f"🔄 正在调度【{agent_map.get(agent_role, agent_role)}】")
        if reason:
            parts.append(f"📋 {reason}")
        
        workflow_state = scheduler_json.get("workflow_state", "")
        if workflow_state:
            state_map = {"idle": "待命", "planning": "规划中", "executing": "执行中", "reviewing": "审核中", "done": "已完成"}
            parts.append(f"📌 状态：{state_map.get(workflow_state, workflow_state)}")
        
        return "\n".join(parts) if parts else "收到需求，正在处理..."