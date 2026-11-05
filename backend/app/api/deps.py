"""Dependencies alias module for FastAPI route handlers."""

from app.dependencies import (
    get_current_admin,
    get_current_user,
    get_db,
    require_admin_csrf,
)

__all__ = [
    "get_current_admin",
    "get_current_user",
    "get_db",
    "require_admin_csrf",
]
