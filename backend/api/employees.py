import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.auth import get_current_user
from backend.core.database import get_db
from backend.models.employee import Employee
from backend.models.user import User
from backend.schemas.employee import EmployeeCreate, EmployeeResponse

router = APIRouter(prefix="/api/employees", tags=["Employees"])


@router.post("", response_model=EmployeeResponse, status_code=status.HTTP_201_CREATED)
async def create_employee(
    body: EmployeeCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new employee record."""
    # Check for duplicate email
    existing = await db.execute(
        select(Employee).where(Employee.email == body.email)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Employee with this email already exists")

    employee = Employee(
        name=body.name,
        email=body.email,
        department=body.department,
        company=body.company,
    )
    db.add(employee)
    await db.commit()
    await db.refresh(employee)

    return EmployeeResponse(
        id=employee.id,
        name=employee.name,
        email=employee.email,
        department=employee.department,
        company=employee.company,
        created_at=str(employee.created_at),
    )


@router.get("", response_model=list[EmployeeResponse])
async def list_employees(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all employees."""
    stmt = select(Employee).order_by(Employee.name)
    result = await db.execute(stmt)
    employees = result.scalars().all()
    return [
        EmployeeResponse(
            id=e.id,
            name=e.name,
            email=e.email,
            department=e.department,
            company=e.company,
            created_at=str(e.created_at),
        )
        for e in employees
    ]
