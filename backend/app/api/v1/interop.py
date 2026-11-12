"""SCORM / H5P / xAPI / LTI 1.3 interoperability endpoints."""

from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, File, Form, Response, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.permissions import require_role
from app.dependencies import get_current_user, get_db
from app.db.models.enums import UserRole
from app.db.models.user import User
from app.services import interop_service

router = APIRouter(prefix="/interop", tags=["interoperability"])


class InteropPackageOut(BaseModel):
    id: str
    course_id: str
    standard: str
    title: str
    description: str | None = None
    entry_point: str | None = None
    launch_url: str | None = None
    manifest_json: dict[str, Any] = {}
    checksum_sha256: str | None = None
    created_at: datetime


class LtiToolCreateRequest(BaseModel):
    course_id: str
    title: str = Field(min_length=2, max_length=255)
    launch_url: str = Field(min_length=2, max_length=1024)
    description: str | None = None
    custom_params: dict[str, Any] = {}


class XapiBatchRequest(BaseModel):
    statements: list[dict[str, Any]] = Field(min_length=1, max_length=50)


def _to_out(pkg) -> InteropPackageOut:
    return InteropPackageOut(
        id=pkg.id,
        course_id=pkg.course_id,
        standard=pkg.standard,
        title=pkg.title,
        description=pkg.description,
        entry_point=pkg.entry_point,
        launch_url=pkg.launch_url,
        manifest_json=pkg.manifest_json or {},
        checksum_sha256=pkg.checksum_sha256,
        created_at=pkg.created_at,
    )


@router.get("/courses/{course_id}/packages", response_model=list[InteropPackageOut])
def list_packages(
    course_id: str,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return [_to_out(p) for p in interop_service.list_course_packages(db, course_id)]


@router.post("/courses/{course_id}/import-package", response_model=InteropPackageOut, status_code=201)
async def upload_scorm_or_h5p_package(
    course_id: str,
    file: UploadFile = File(...),
    title: str | None = Form(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_role(current_user, UserRole.teacher)
    raw_bytes = await file.read()
    pkg = interop_service.import_zip_package(
        db,
        course_id=course_id,
        user=current_user,
        filename=file.filename or "package.zip",
        raw_bytes=raw_bytes,
        override_title=title,
    )
    return _to_out(pkg)


@router.post("/lti/tools", response_model=InteropPackageOut, status_code=201)
def create_lti_tool(
    payload: LtiToolCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_role(current_user, UserRole.teacher)
    pkg = interop_service.register_lti_tool(
        db,
        course_id=payload.course_id,
        user=current_user,
        title=payload.title,
        launch_url=payload.launch_url,
        description=payload.description,
        custom_params=payload.custom_params,
    )
    return _to_out(pkg)


@router.post("/lti/launch/{package_id}")
def generate_lti_launch(
    package_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return interop_service.build_lti_launch_token(db, package_id=package_id, user=current_user)


@router.get("/packages/{package_id}/content/{asset_path:path}")
def serve_package_asset(
    package_id: str,
    asset_path: str,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    blob, media_type = interop_service.get_package_asset_bytes(db, package_id, asset_path)
    return Response(content=blob, media_type=media_type)


@router.post("/xapi/statements", status_code=201)
def ingest_xapi_statements(
    payload: XapiBatchRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rows = interop_service.record_xapi_statements(db, user=current_user, statements=payload.statements)
    return {"stored_count": len(rows), "statement_ids": [r.id for r in rows]}


@router.get("/xapi/statements")
def fetch_xapi_statements(
    course_id: str | None = None,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return {
        "statements": interop_service.list_xapi_statements(db, user=current_user, course_id=course_id, limit=limit)
    }
