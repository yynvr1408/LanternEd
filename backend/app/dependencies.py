from fastapi import Depends, Request
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.core.exceptions import ForbiddenError, UnauthorizedError
from app.db.models.enums import UserRole, UserStatus
from app.db.models.user import User
from app.db.session import get_db

__all__ = ["get_db", "get_settings", "get_current_user", "get_optional_user", "extract_token_from_request"]


def extract_token_from_request(request: Request, cookie_name: str) -> str | None:
    """Extracts session or admin token from Authorization header (Bearer), custom headers, or cookie.
    Guarantees reliable authentication across cross-origin deployments (e.g. Vercel SPA + Render API)
    where third-party cookies are blocked by modern browsers (Safari ITP, Chrome Privacy Sandbox),
    as well as inside native desktop (Tauri) and mobile (Capacitor) webviews."""
    # 1. Bearer token in standard Authorization header
    auth_header = request.headers.get("authorization")
    if auth_header:
        scheme, _, param = auth_header.partition(" ")
        if scheme.lower() == "bearer" and param.strip():
            return param.strip()

    # 2. Custom header fallback for webviews / API clients
    if cookie_name == "lanterned_admin_session":
        admin_header = request.headers.get("x-admin-token")
        if admin_header and admin_header.strip():
            return admin_header.strip()
    else:
        session_header = request.headers.get("x-session-token")
        if session_header and session_header.strip():
            return session_header.strip()

    # 3. Cookie fallback
    cookie_val = request.cookies.get(cookie_name)
    if cookie_val and cookie_val.strip():
        return cookie_val.strip()

    return None


def get_optional_user(
    request: Request,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> User | None:
    token = extract_token_from_request(request, settings.session_cookie_name)
    if not token:
        return None

    from app.services.auth_service import get_user_from_session_token

    return get_user_from_session_token(db, token)


def get_current_user(user: User | None = Depends(get_optional_user)) -> User:
    if user is None:
        raise UnauthorizedError("Authentication required.")
    if user.status != UserStatus.active:
        raise UnauthorizedError("This account is not active.")
    if user.role == UserRole.admin:  # an admin session never works on the student/teacher API
        raise UnauthorizedError("Authentication required.")
    return user


ADMIN_CSRF_HEADER = "x-lanterned-admin"


def require_admin_csrf(request: Request) -> None:
    """State-changing admin requests must carry a custom header. A cross-site form or image cannot add one,
    and a cross-origin fetch that does is stopped by the CORS preflight (only our frontend origin is allowed)."""
    if request.method not in ("GET", "HEAD", "OPTIONS") and request.headers.get(ADMIN_CSRF_HEADER) != "1":
        raise ForbiddenError("Missing admin request header.", code="CSRF_REJECTED")


def get_current_admin(
    request: Request,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
    _csrf: None = Depends(require_admin_csrf),
) -> User:
    token = extract_token_from_request(request, settings.admin_cookie_name)
    if not token:
        raise UnauthorizedError("Authentication required.")

    from app.services.admin_service import get_admin_from_session_token

    # Admin-specific validation (not the generic get_user_from_session_token): also enforces the
    # idle timeout that backs the single-active-admin-session login policy.
    user = get_admin_from_session_token(db, token)
    if user is None or user.status != UserStatus.active:
        raise UnauthorizedError("Authentication required.")
    return user
