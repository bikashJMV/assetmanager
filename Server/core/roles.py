from typing import Literal

Role = Literal["employee", "admin", "it_ops"]
VALID_ROLES = frozenset({"employee", "admin", "it_ops"})
PRIVILEGED_ROLES = frozenset({"admin", "it_ops"})
