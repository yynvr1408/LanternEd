"""Offline OER Library Catalog and Portable `.lanternpack.zip` Bundle Export Endpoints."""

from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session

from app.dependencies import get_current_user, get_db
from app.db.models.user import User
from app.services import oer_service

router = APIRouter(prefix="/oer", tags=["oer"])


@router.get("/catalog")
def get_oer_catalog(_: User = Depends(get_current_user)):
    return {"packs": oer_service.list_oer_catalog()}


@router.get("/catalog/{pack_id}/export-pack")
def export_curated_oer_pack(pack_id: str, _: User = Depends(get_current_user)):
    filename, archive = oer_service.export_oer_pack_zip(pack_id)
    return Response(
        content=archive,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/courses/{course_id}/export-pack")
def export_course_lanternpack(
    course_id: str,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    filename, archive = oer_service.export_course_lanternpack(db, course_id)
    return Response(
        content=archive,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
