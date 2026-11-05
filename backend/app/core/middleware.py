import re
import uuid
from urllib.parse import urlsplit

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

# A client-supplied id is echoed into response headers, error bodies and logs, so only a short,
# plain token is accepted; anything else is replaced rather than reflected.
_REQUEST_ID = re.compile(r"^[A-Za-z0-9._-]{1,64}$")
_UNSAFE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}


class RequestIdMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        supplied = request.headers.get("x-request-id", "")
        request_id = supplied if _REQUEST_ID.fullmatch(supplied) else str(uuid.uuid4())
        request.state.request_id = request_id
        response = await call_next(request)
        response.headers["x-request-id"] = request_id
        return response


class OriginCheckMiddleware(BaseHTTPMiddleware):
    """CSRF defence for the cookie-authenticated API. The session cookie may be SameSite=None
    (the SPA and API live on different sites), so a hostile page could otherwise submit a
    bodyless form POST that carries it. Browsers always attach `Origin` to a cross-site
    mutating request; one that names neither the frontend nor this server is refused.
    Requests with no Origin (server-to-server callers such as the LiveKit webhook, curl, tests)
    are not browser-borne CSRF and pass."""

    def __init__(self, app, *, allowed_origin: str):
        super().__init__(app)
        self.allowed_origins = [o.strip().rstrip("/") for o in allowed_origin.split(",") if o.strip()]

    async def dispatch(self, request: Request, call_next):
        if request.method in _UNSAFE_METHODS:
            origin = request.headers.get("origin")
            if origin is not None and not self._is_allowed(request, origin):
                return JSONResponse(
                    status_code=403,
                    content={
                        "error": {
                            "code": "ORIGIN_NOT_ALLOWED",
                            "message": "Cross-site request refused.",
                            "request_id": getattr(request.state, "request_id", None),
                            "details": {},
                        }
                    },
                )
        return await call_next(request)

    def _is_allowed(self, request: Request, origin: str) -> bool:
        origin = origin.rstrip("/")
        if origin in self.allowed_origins:
            return True
        if any("vercel.app" in o for o in self.allowed_origins) and (
            origin.endswith(".vercel.app") or origin.startswith("https://lanterned")
        ):
            return True
        # Same-origin deployments (the SPA served by the same host as the API, as in the
        # self-hosted Caddy setup) send an Origin equal to the request's own host.
        host = request.headers.get("host")
        parts = urlsplit(origin)
        return bool(host) and parts.scheme in {"http", "https"} and parts.netloc == host
