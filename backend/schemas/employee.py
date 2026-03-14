from __future__ import annotations

import uuid
from pydantic import BaseModel


class EmployeeCreate(BaseModel):
    name: str
    email: str
    department: str | None = None
    company: str | None = None


class EmployeeResponse(BaseModel):
    id: uuid.UUID
    name: str
    email: str
    department: str | None
    company: str | None
    created_at: str

    model_config = {"from_attributes": True}
