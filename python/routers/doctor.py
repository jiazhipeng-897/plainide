import os
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List, Dict, Any

from doctors.doctor_engine import CodeDoctor
from utils.logger import Logger

router = APIRouter(prefix="/doctor", tags=["代码医生"])


class DoctorRequest(BaseModel):
    file_path: str


class DoctorResponse(BaseModel):
    success: bool
    message: str
    has_errors: bool
    errors: List[Dict[str, Any]]
    autopep8_ok: bool


# 单例（保持缓存状态）
_doctor_instance = None


def get_doctor() -> CodeDoctor:
    global _doctor_instance
    if _doctor_instance is None:
        _doctor_instance = CodeDoctor()
    return _doctor_instance


@router.post("/format")
async def doctor_format(req: DoctorRequest) -> DoctorResponse:
    """执行代码医生格式化"""
    try:
        file_path = req.file_path

        if not os.path.exists(file_path):
            return DoctorResponse(
                success=False,
                message=f"文件不存在: {file_path}",
                has_errors=True,
                errors=[],
                autopep8_ok=False,
            )

        Logger.info(f"代码医生请求: {file_path}", source="doctor")

        doctor = get_doctor()
        result = doctor.auto_format(file_path)

        return DoctorResponse(
            success=result["success"],
            message=result["message"],
            has_errors=result["has_errors"],
            errors=result["errors"],
            autopep8_ok=result["autopep8_ok"],
        )

    except Exception as e:
        Logger.error(f"代码医生失败: {str(e)}", source="doctor", stack=True)
        return DoctorResponse(
            success=False,
            message=f"❌ 执行失败: {str(e)}",
            has_errors=True,
            errors=[],
            autopep8_ok=False,
        )


@router.post("/reset")
async def doctor_reset():
    """重置缓存状态（当用户手动修改代码后调用）"""
    doctor = get_doctor()
    doctor.is_perfect = False
    doctor.last_hash = None
    Logger.info("代码医生缓存已重置", source="doctor")
    return {"success": True, "message": "缓存已重置"}