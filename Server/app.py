"""
Legacy compatibility entrypoint.

Use `main.py` as the canonical FastAPI application. This module re-exports
`main.app` so old run commands still start the same server stack.
"""

from main import app  # noqa: F401
