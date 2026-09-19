from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, Dict, Any
import asyncio

from agents import get_agent
from config import get_api_config
from utils.logger import Logger

router = APIRouter(prefix="/translate", tags=["Agent翻译"])


class TranslateRequest(BaseModel):
    code: str
    mode: str = "full"  # full | selection
    context: Optional[Dict] = None


class TranslateResponse(BaseModel):
    success: bool
    result: Optional[Dict] = None
    error: Optional[str] = None


@router.post("/")
async def translate_code(req: TranslateRequest) -> TranslateResponse:
    """翻译代码为大白话"""
    try:
        # 获取用户配置的 API 设置
        api_config = get_api_config()
        provider = api_config.get("provider", "mock")  # 默认模拟模式

        Logger.info(f"翻译请求: mode={req.mode}, provider={provider}", source="translate")

        # 获取 Agent
        agent = get_agent(provider, api_config)

        # 执行翻译
        result = await agent.translate(
            code=req.code,
            mode=req.mode,
            context=req.context,
        )

        if result.success:
            return TranslateResponse(
                success=True,
                result=result.to_dict(),
            )
        else:
            return TranslateResponse(
                success=False,
                error=result.error or "翻译失败",
            )

    except Exception as e:
        Logger.error(f"翻译失败: {str(e)}", source="translate", stack=True)
        return TranslateResponse(
            success=False,
            error=str(e),
        )