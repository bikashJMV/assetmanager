from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Optional


@dataclass(frozen=True)
class HookContext:
    """
    Service-layer hook context.

    Keep this stable so we can plug in notifications/webhooks later without router changes.
    """

    request_id: Optional[str]
    actor_sub: Optional[str]
    actor_employee_id: Optional[str]


class ServiceHooks:
    """
    Hook facade for side effects (email, webhooks, event buses).

    Default implementation is a no-op; can be swapped via dependency injection later.
    """

    async def on_asset_assigned(self, *, ctx: HookContext, payload: dict[str, Any]) -> None:
        return

    async def on_asset_returned(self, *, ctx: HookContext, payload: dict[str, Any]) -> None:
        return

    async def on_employee_created(self, *, ctx: HookContext, payload: dict[str, Any]) -> None:
        return


service_hooks = ServiceHooks()

