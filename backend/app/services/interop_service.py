"""Standards interoperability: SCORM 1.2/2004, H5P, xAPI (LRS), and LTI 1.3 launch primitives."""

from __future__ import annotations

import base64
import hashlib
import hmac
import io
import json
import mimetypes
import posixpath
import uuid
import xml.etree.ElementTree as ET
import zipfile
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.core.exceptions import AppError, ForbiddenError, NotFoundError, ValidationFailedError
from app.db.base import utcnow
from app.db.models.course import Course
from app.db.models.enums import UserRole
from app.db.models.interop import InteropPackage, XapiStatement
from app.db.models.user import User
from app.integrations.object_storage import LocalObjectStorage, get_storage

MAX_PACKAGE_ARCHIVE_BYTES = 64 * 1024 * 1024
MAX_PACKAGE_ENTRIES = 500


def _safe_zip_member(raw_name: str) -> str | None:
    norm = posixpath.normpath((raw_name or "").replace("\\", "/")).lstrip("/")
    if not norm or norm == "." or norm.startswith("../") or "/../" in norm:
        return None
    return norm


def _inspect_scorm_manifest(xml_bytes: bytes) -> tuple[str, str, dict[str, Any]]:
    text = xml_bytes.decode("utf-8", errors="replace")
    if "<!DOCTYPE" in text.upper() or "<!ENTITY" in text.upper():
        raise ValidationFailedError("Unsafe XML DOCTYPE/ENTITY declarations are not permitted in imsmanifest.xml.")
    root = ET.fromstring(text)

    def _local(tag: str) -> str:
        return tag.split("}", 1)[-1].lower()

    title = "SCORM Learning Module"
    entry_point = "index.html"
    schema_version = "scorm_1_2"

    for el in root.iter():
        lname = _local(el.tag)
        if lname == "schemaversion" and el.text and "2004" in el.text:
            schema_version = "scorm_2004"
        elif lname == "title" and el.text and el.text.strip() and title == "SCORM Learning Module":
            title = el.text.strip()
        elif lname == "resource":
            href = el.attrib.get("href")
            if href and entry_point == "index.html":
                safe = _safe_zip_member(href)
                if safe:
                    entry_point = safe

    return schema_version, title, {"schema_version": schema_version, "entry_point": entry_point, "title": title}


def _inspect_h5p_manifest(json_bytes: bytes) -> tuple[str, dict[str, Any]]:
    data = json.loads(json_bytes.decode("utf-8", errors="replace"))
    if not isinstance(data, dict):
        raise ValidationFailedError("Invalid h5p.json manifest.")
    title = str(data.get("title") or data.get("mainLibrary") or "H5P Interactive Content")
    return title, {
        "mainLibrary": data.get("mainLibrary"),
        "language": data.get("language", "en"),
        "preloadedDependencies": data.get("preloadedDependencies", []),
        "title": title,
    }


def _put_storage_bytes(storage_key: str, data: bytes, content_type: str) -> None:
    storage = get_storage()
    if hasattr(storage, "put_bytes"):
        storage.put_bytes(storage_key, data, content_type=content_type)
        return
    if isinstance(storage, LocalObjectStorage):
        path = storage._path(storage_key)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        return
    import tempfile
    from pathlib import Path

    with tempfile.NamedTemporaryFile(delete=False) as tmp:
        tmp.write(data)
        tmp_path = Path(tmp.name)
    try:
        storage.upload_file(tmp_path, storage_key, content_type=content_type)
    finally:
        tmp_path.unlink(missing_ok=True)


def read_storage_bytes(storage_key: str) -> bytes:
    storage = get_storage()
    if hasattr(storage, "get_bytes"):
        return storage.get_bytes(storage_key)
    if isinstance(storage, LocalObjectStorage):
        path = storage._path(storage_key)
        if not path.is_file():
            raise NotFoundError("Package asset not found.")
        return path.read_bytes()
    import tempfile
    from pathlib import Path

    with tempfile.NamedTemporaryFile(delete=False) as tmp:
        tmp_path = Path(tmp.name)
    try:
        storage.fetch_to_path(storage_key, tmp_path)
        return tmp_path.read_bytes()
    finally:
        tmp_path.unlink(missing_ok=True)


def import_zip_package(
    db: Session,
    *,
    course_id: str,
    user: User,
    filename: str,
    raw_bytes: bytes,
    override_title: str | None = None,
) -> InteropPackage:
    course = db.get(Course, course_id)
    if not course:
        raise NotFoundError("Course not found.")
    if len(raw_bytes) == 0 or len(raw_bytes) > MAX_PACKAGE_ARCHIVE_BYTES:
        raise ValidationFailedError("Package archive must be between 1 byte and 64 MB.")

    checksum = hashlib.sha256(raw_bytes).hexdigest()
    pkg_id = str(uuid.uuid4())
    storage_prefix = f"interop/{course_id}/{pkg_id}"

    try:
        zf = zipfile.ZipFile(io.BytesIO(raw_bytes))
    except zipfile.BadZipFile as exc:
        raise ValidationFailedError("Uploaded file is not a valid ZIP/SCORM/H5P archive.") from exc

    with zf:
        infos = [info for info in zf.infolist() if not info.is_dir()]
        if len(infos) > MAX_PACKAGE_ENTRIES:
            raise ValidationFailedError(f"Package archive exceeds {MAX_PACKAGE_ENTRIES} file limit.")

        total_uncompressed = sum(info.file_size for info in infos)
        if total_uncompressed > MAX_PACKAGE_ARCHIVE_BYTES:
            raise ValidationFailedError("Extracted archive contents exceed 64 MB safety cap.")

        entries: dict[str, bytes] = {}
        for info in infos:
            safe_rel = _safe_zip_member(info.filename)
            if not safe_rel:
                raise ValidationFailedError("Unsafe relative path detected in archive.")
            entries[safe_rel] = zf.read(info.filename)

    standard = "scorm_1_2"
    title = override_title or filename or "Interactive Learning Package"
    entry_point = "index.html"
    manifest: dict[str, Any] = {"files": sorted(entries.keys())}

    if "imsmanifest.xml" in entries:
        standard, scorm_title, scorm_meta = _inspect_scorm_manifest(entries["imsmanifest.xml"])
        title = override_title or scorm_title
        entry_point = scorm_meta["entry_point"]
        manifest.update(scorm_meta)
    elif "h5p.json" in entries:
        standard = "h5p"
        h5p_title, h5p_meta = _inspect_h5p_manifest(entries["h5p.json"])
        title = override_title or h5p_title
        manifest.update(h5p_meta)
        if "index.html" in entries:
            entry_point = "index.html"
        elif "content/content.json" in entries:
            entry_point = "content/content.json"
            try:
                manifest["content_preview"] = json.loads(entries["content/content.json"].decode("utf-8", errors="replace"))
            except Exception:
                pass
    else:
        html_candidates = [name for name in sorted(entries.keys()) if name.lower().endswith(".html")]
        if html_candidates:
            entry_point = html_candidates[0]

    for rel_path, blob in entries.items():
        mime, _ = mimetypes.guess_type(rel_path)
        _put_storage_bytes(f"{storage_prefix}/{rel_path}", blob, mime or "application/octet-stream")

    pkg = InteropPackage(
        id=pkg_id,
        course_id=course_id,
        uploaded_by=user.id,
        standard=standard,
        title=title[:255],
        storage_prefix=storage_prefix,
        entry_point=entry_point,
        launch_url=f"/api/v1/interop/packages/{pkg_id}/content/{entry_point}",
        manifest_json=manifest,
        checksum_sha256=checksum,
    )
    db.add(pkg)
    db.commit()
    db.refresh(pkg)
    return pkg


def register_lti_tool(
    db: Session,
    *,
    course_id: str,
    user: User,
    title: str,
    launch_url: str,
    description: str | None = None,
    custom_params: dict[str, Any] | None = None,
) -> InteropPackage:
    course = db.get(Course, course_id)
    if not course:
        raise NotFoundError("Course not found.")
    if not launch_url.startswith(("https://", "http://", "/")):
        raise ValidationFailedError("LTI launch URL must start with https://, http://, or /.")

    pkg = InteropPackage(
        course_id=course_id,
        uploaded_by=user.id,
        standard="lti_1_3",
        title=title.strip()[:255],
        description=description,
        launch_url=launch_url.strip(),
        manifest_json={"custom_params": custom_params or {}, "version": "1.3.0"},
    )
    db.add(pkg)
    db.commit()
    db.refresh(pkg)
    return pkg


def list_course_packages(db: Session, course_id: str) -> list[InteropPackage]:
    return (
        db.execute(
            select(InteropPackage)
            .where(InteropPackage.course_id == course_id)
            .order_by(InteropPackage.created_at.desc())
        )
        .scalars()
        .all()
    )


def get_package_or_404(db: Session, package_id: str) -> InteropPackage:
    pkg = db.get(InteropPackage, package_id)
    if not pkg:
        raise NotFoundError("Interop learning package not found.")
    return pkg


def get_package_asset_bytes(db: Session, package_id: str, asset_path: str) -> tuple[bytes, str]:
    pkg = get_package_or_404(db, package_id)
    if not pkg.storage_prefix:
        raise NotFoundError("This package has no stored archive assets.")
    safe_rel = _safe_zip_member(asset_path)
    if not safe_rel:
        raise ValidationFailedError("Invalid asset path.")
    blob = read_storage_bytes(f"{pkg.storage_prefix}/{safe_rel}")
    mime, _ = mimetypes.guess_type(safe_rel)
    return blob, mime or "application/octet-stream"


def _parse_iso_dt(raw: str | datetime | None) -> datetime:
    if isinstance(raw, datetime):
        return raw.astimezone(timezone.utc).replace(tzinfo=None) if raw.tzinfo else raw
    if isinstance(raw, str) and raw.strip():
        try:
            dt = datetime.fromisoformat(raw.replace("Z", "+00:00"))
            return dt.astimezone(timezone.utc).replace(tzinfo=None) if dt.tzinfo else dt
        except ValueError:
            pass
    return utcnow()


def record_xapi_statements(
    db: Session,
    *,
    user: User,
    statements: list[dict[str, Any]],
    commit: bool = True,
) -> list[XapiStatement]:
    created: list[XapiStatement] = []
    for raw in statements:
        if not isinstance(raw, dict):
            continue
        verb = raw.get("verb") if isinstance(raw.get("verb"), dict) else {}
        verb_id = str(verb.get("id") or raw.get("verb_id") or "http://adlnet.gov/expapi/verbs/experienced")[:255]
        display_map = verb.get("display") if isinstance(verb.get("display"), dict) else {}
        verb_display = str(display_map.get("en-US") or display_map.get("en") or raw.get("verb_display") or verb_id.rsplit("/", 1)[-1])[:120]

        obj = raw.get("object") if isinstance(raw.get("object"), dict) else {}
        obj_id = str(obj.get("id") or raw.get("object_id") or "urn:lanterned:activity")[:255]
        obj_def = obj.get("definition") if isinstance(obj.get("definition"), dict) else {}
        obj_name_map = obj_def.get("name") if isinstance(obj_def.get("name"), dict) else {}
        obj_name = str(obj_name_map.get("en-US") or obj_name_map.get("en") or raw.get("object_name") or obj_id)[:255]
        obj_type = str(obj.get("objectType") or raw.get("object_type") or "Activity")[:80]

        course_id = raw.get("course_id")
        if course_id is not None and not db.get(Course, str(course_id)):
            course_id = None

        row = XapiStatement(
            actor_id=user.id,
            course_id=str(course_id) if course_id else None,
            verb_id=verb_id,
            verb_display=verb_display,
            object_id=obj_id,
            object_name=obj_name,
            object_type=obj_type,
            result_json=raw.get("result") if isinstance(raw.get("result"), dict) else {},
            context_json=raw.get("context") if isinstance(raw.get("context"), dict) else {},
            statement_timestamp=_parse_iso_dt(raw.get("timestamp")),
            stored_at=utcnow(),
        )
        db.add(row)
        created.append(row)

    if commit:
        db.commit()
        for row in created:
            db.refresh(row)
    else:
        db.flush()
    return created


def list_xapi_statements(db: Session, *, user: User, course_id: str | None = None, limit: int = 100) -> list[dict[str, Any]]:
    stmt = select(XapiStatement).order_by(XapiStatement.stored_at.desc()).limit(max(1, min(limit, 500)))
    if course_id:
        stmt = stmt.where(XapiStatement.course_id == course_id)
    if user.role == UserRole.student:
        stmt = stmt.where(XapiStatement.actor_id == user.id)
    rows = db.execute(stmt).scalars().all()
    return [
        {
            "id": r.id,
            "actor": {"objectType": "Agent", "account": {"homePage": "https://lanterned.app", "name": r.actor_id}},
            "verb": {"id": r.verb_id, "display": {"en-US": r.verb_display}},
            "object": {
                "id": r.object_id,
                "objectType": r.object_type,
                "definition": {"name": {"en-US": r.object_name}},
            },
            "result": r.result_json,
            "context": r.context_json,
            "course_id": r.course_id,
            "timestamp": r.statement_timestamp.isoformat(),
            "stored": r.stored_at.isoformat(),
        }
        for r in rows
    ]


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def build_lti_launch_token(db: Session, *, package_id: str, user: User) -> dict[str, Any]:
    """Issues a signed LTI 1.3 HS256 JWT launch token for external lab/curriculum tools."""
    pkg = get_package_or_404(db, package_id)
    if pkg.standard != "lti_1_3" and not pkg.launch_url:
        raise ValidationFailedError("Selected package does not define an LTI launch endpoint.")

    now = datetime.now(timezone.utc)
    exp = now + timedelta(minutes=15)
    role_urn = (
        "http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor"
        if user.role in (UserRole.teacher, UserRole.admin)
        else "http://purl.imsglobal.org/vocab/lis/v2/membership#Learner"
    )
    claims = {
        "iss": get_settings().frontend_origin or "https://lanterned.app",
        "sub": user.id,
        "aud": pkg.launch_url,
        "iat": int(now.timestamp()),
        "exp": int(exp.timestamp()),
        "nonce": str(uuid.uuid4()),
        "name": user.full_name,
        "email": user.email,
        "https://purl.imsglobal.org/spec/lti/claim/message_type": "LtiResourceLinkRequest",
        "https://purl.imsglobal.org/spec/lti/claim/version": "1.3.0",
        "https://purl.imsglobal.org/spec/lti/claim/deployment_id": pkg.id,
        "https://purl.imsglobal.org/spec/lti/claim/target_link_uri": pkg.launch_url,
        "https://purl.imsglobal.org/spec/lti/claim/roles": [role_urn],
        "https://purl.imsglobal.org/spec/lti/claim/context": {"id": pkg.course_id},
        "https://purl.imsglobal.org/spec/lti/claim/resource_link": {"id": pkg.id, "title": pkg.title},
        "https://purl.imsglobal.org/spec/lti-ags/claim/endpoint": {
            "lineitems": f"/api/v1/interop/lti/score-passback",
        },
    }
    header_b64 = _b64url(json.dumps({"alg": "HS256", "typ": "JWT"}, separators=(",", ":")).encode("utf-8"))
    payload_b64 = _b64url(json.dumps(claims, separators=(",", ":")).encode("utf-8"))
    secret = get_settings().session_secret.encode("utf-8")
    sig = hmac.new(secret, f"{header_b64}.{payload_b64}".encode("ascii"), hashlib.sha256).digest()
    token = f"{header_b64}.{payload_b64}.{_b64url(sig)}"
    return {
        "package_id": pkg.id,
        "title": pkg.title,
        "launch_url": pkg.launch_url,
        "id_token": token,
        "expires_at": exp.isoformat(),
    }
