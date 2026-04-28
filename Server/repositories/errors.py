from __future__ import annotations


class RepositoryError(Exception):
    """Base repository error."""


class NotFoundError(RepositoryError):
    """Entity not found."""


class ConflictError(RepositoryError):
    """Unique constraint / conflicting state."""


class ValidationError(RepositoryError):
    """Invalid input for repository operation."""

