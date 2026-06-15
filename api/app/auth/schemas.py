from __future__ import annotations

from pydantic import BaseModel, EmailStr, Field

from ..db.models import User


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=72)
    displayName: str | None = Field(default=None, max_length=120)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=72)


class UserOut(BaseModel):
    id: str
    email: str
    displayName: str | None
    role: str
    status: str

    @classmethod
    def from_orm_user(cls, user: User) -> "UserOut":
        return cls(
            id=str(user.id),
            email=user.email,
            displayName=user.display_name,
            role=user.role,
            status=user.status,
        )
