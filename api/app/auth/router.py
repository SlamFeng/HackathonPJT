from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.base import get_db
from ..db.models import User
from ..settings import settings
from . import service
from .deps import get_current_user
from .schemas import LoginRequest, RegisterRequest, UserOut

router = APIRouter(prefix="/v1/auth", tags=["auth"])


def _cookie_attrs() -> tuple[str, bool]:
    """归一化 SameSite / Secure。

    跨站部署（前端在 Vercel、后端在另一域名）需要 SameSite=None；而浏览器规定
    SameSite=None 的 Cookie 必须同时 Secure，否则直接丢弃。这里强制：只要 samesite=none
    就把 secure 提升为 true，避免「配了 None 却没配 Secure 导致登录态下发失败」的坑。
    """
    samesite = (settings.cookie_samesite or "lax").lower()
    secure = settings.cookie_secure or samesite == "none"
    return samesite, secure


def _set_session_cookie(response: Response, token: str) -> None:
    samesite, secure = _cookie_attrs()
    response.set_cookie(
        key=settings.session_cookie_name,
        value=token,
        max_age=settings.session_ttl_hours * 3600,
        httponly=True,
        secure=secure,
        samesite=samesite,
        path="/",
    )


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def register(req: RegisterRequest, response: Response, db: AsyncSession = Depends(get_db)) -> UserOut:
    try:
        user = await service.create_user(
            db, email=req.email, password=req.password, display_name=req.displayName
        )
    except service.AuthError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=e.message)
    token = await service.create_session(db, user=user)
    _set_session_cookie(response, token)
    return UserOut.from_orm_user(user)


@router.post("/login", response_model=UserOut)
async def login(req: LoginRequest, response: Response, db: AsyncSession = Depends(get_db)) -> UserOut:
    try:
        user = await service.authenticate(db, email=req.email, password=req.password)
    except service.AuthError as e:
        code = status.HTTP_403_FORBIDDEN if e.code == "ACCOUNT_DISABLED" else status.HTTP_401_UNAUTHORIZED
        raise HTTPException(status_code=code, detail=e.message)
    token = await service.create_session(db, user=user)
    _set_session_cookie(response, token)
    return UserOut.from_orm_user(user)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(request: Request, response: Response, db: AsyncSession = Depends(get_db)) -> Response:
    token = request.cookies.get(settings.session_cookie_name)
    if token:
        await service.revoke_session(db, token)
    # 删除时属性需与下发时一致，跨站（SameSite=None; Secure）下才能可靠清除
    samesite, secure = _cookie_attrs()
    response.delete_cookie(
        key=settings.session_cookie_name,
        path="/",
        httponly=True,
        secure=secure,
        samesite=samesite,
    )
    response.status_code = status.HTTP_204_NO_CONTENT
    return response


@router.get("/me", response_model=UserOut)
async def me(user: User = Depends(get_current_user)) -> UserOut:
    return UserOut.from_orm_user(user)
