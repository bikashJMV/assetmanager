from __future__ import annotations

from typing import Literal, Optional

from fastapi import HTTPException, Request, status

from core.authnexus import EmployeeContext

Role = Literal["employee", "admin", "it_ops"]


def get_current_employee(request: Request) -> Optional[EmployeeContext]:
    employee = getattr(request.state, "employee", None)
    return employee if isinstance(employee, EmployeeContext) else employee


def require_authenticated(request: Request) -> EmployeeContext:
    employee = get_current_employee(request)
    if not employee:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing bearer token.")
    return employee


def require_privileged(request: Request) -> EmployeeContext:
    employee = require_authenticated(request)
    if employee.role not in {"admin", "it_ops"}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin or IT Ops role required.")
    return employee


def require_admin(request: Request) -> EmployeeContext:
    employee = require_authenticated(request)
    if employee.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin role required.")
    return employee


def require_it_ops(request: Request) -> EmployeeContext:
    employee = require_authenticated(request)
    if employee.role != "it_ops":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="IT Ops role required.")
    return employee
