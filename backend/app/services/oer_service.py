"""Offline OER / Kiwix ZIM Library Catalog and Portable `.lanternpack.zip` Bundle Exporter."""

from __future__ import annotations

import hashlib
import io
import json
import zipfile
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.exceptions import NotFoundError
from app.db.base import utcnow
from app.db.models.classroom import Class
from app.db.models.course import Course
from app.db.models.lesson import Lesson
from app.db.models.summary import LectureSummary

CURATED_OER_CATALOG: list[dict[str, Any]] = [
    {
        "id": "oer-stem-wikipedia-mini",
        "title": "STEM Core Encyclopedia Micro-Pack (Physics, Math, CS)",
        "provider": "Kiwix / OpenZIM Curated Extract",
        "format": "lanternpack-oer",
        "subject": "Science & Engineering",
        "grade_level": "Undergraduate / Senior Secondary",
        "estimated_kb": 48,
        "language": "en",
        "description": "Offline encyclopedia primer covering Newton's Laws, Ohm's Law, Data Structures, Algorithms, and Thermodynamics.",
        "lessons": [
            {
                "id": "oer-stem-l1",
                "title": "Classical Mechanics & Ohm's Law Fundamentals",
                "content": (
                    "Newton's Second Law states that net force F equals mass m multiplied by acceleration a (F = m * a). "
                    "In electrical circuits, Ohm's Law is defined as V = I * R, where V is potential difference in Volts, "
                    "I is current in Amperes, and R is electrical resistance in Ohms. Power dissipated equals V * I."
                ),
            },
            {
                "id": "oer-stem-l2",
                "title": "Binary Search, Queues & Graph Complexity",
                "content": (
                    "Binary search locates a target inside a sorted array in O(log n) worst-case comparisons by halving the search interval. "
                    "Breadth-First Search (BFS) uses a FIFO Queue and visits vertices in O(V + E) time, finding shortest paths in unweighted graphs."
                ),
            },
        ],
    },
    {
        "id": "oer-phet-circuits-optics",
        "title": "PhET Style Interactive Concepts: Circuits & Optics",
        "provider": "Open Educational Resources (OER Commons)",
        "format": "lanternpack-oer",
        "subject": "Physics Lab",
        "grade_level": "B.Sc / Diploma / Class 12",
        "estimated_kb": 36,
        "language": "en",
        "description": "Self-contained lab notes, formulas, and self-check problems for series/parallel resistors and thin lens equations.",
        "lessons": [
            {
                "id": "oer-phet-l1",
                "title": "Series vs Parallel Resistor Networks",
                "content": (
                    "Resistors in series share identical current and sum their resistances: R_total = R1 + R2 + ... + Rn. "
                    "Resistors in parallel share equal potential difference: 1/R_total = 1/R1 + 1/R2 + ... + 1/Rn."
                ),
            }
        ],
    },
    {
        "id": "oer-spoken-python-c",
        "title": "Spoken Tutorial Foundation: Python & C Problem Solving",
        "provider": "Open Curriculum Foundation",
        "format": "lanternpack-oer",
        "subject": "Computer Programming",
        "grade_level": "First-Year Engineering",
        "estimated_kb": 42,
        "language": "en",
        "description": "Zero-internet coding reference covering standard I/O, recursion, time complexity, and memory pointers.",
        "lessons": [
            {
                "id": "oer-code-l1",
                "title": "Standard Input/Output & Recursion Patterns",
                "content": (
                    "Every recursive algorithm requires a base case to terminate and a recursive step moving toward that base case. "
                    "In Python, sys.stdin.read() reads multi-line input quickly for competitive and exam harnesses."
                ),
            }
        ],
    },
]


def list_oer_catalog() -> list[dict[str, Any]]:
    return [
        {
            "id": item["id"],
            "title": item["title"],
            "provider": item["provider"],
            "format": item["format"],
            "subject": item["subject"],
            "grade_level": item["grade_level"],
            "estimated_kb": item["estimated_kb"],
            "language": item["language"],
            "description": item["description"],
            "lesson_count": len(item["lessons"]),
        }
        for item in CURATED_OER_CATALOG
    ]


def _build_lanternpack_zip(bundle_meta: dict[str, Any], payload_files: dict[str, bytes]) -> bytes:
    """Packs JSON/resource files + SHA-256 manifest into a portable `.lanternpack.zip`."""
    manifest_files = []
    for path, raw in sorted(payload_files.items()):
        manifest_files.append(
            {
                "path": path,
                "sha256": hashlib.sha256(raw).hexdigest(),
                "bytes": len(raw),
            }
        )
    manifest = {
        "format": "lanternpack-v1",
        "generated_at": utcnow().isoformat(),
        **bundle_meta,
        "files": manifest_files,
    }
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("manifest.json", json.dumps(manifest, indent=2))
        for path, raw in sorted(payload_files.items()):
            zf.writestr(path, raw)
    return buf.getvalue()


def export_oer_pack_zip(pack_id: str) -> tuple[str, bytes]:
    item = next((p for p in CURATED_OER_CATALOG if p["id"] == pack_id), None)
    if not item:
        raise NotFoundError("OER pack not found in catalog.")

    lessons_bytes = json.dumps(item["lessons"], indent=2).encode("utf-8")
    summary_payload = {
        "overview": item["description"],
        "key_concepts": [lesson["content"] for lesson in item["lessons"]],
        "definitions": [],
        "examples": [],
        "revision_questions": [f"Explain core concepts in {lesson['title']}" for lesson in item["lessons"]],
        "quiz_questions": [],
        "source": "oer_curated",
    }
    summaries_bytes = json.dumps([{"title": item["title"], "content_json": summary_payload}], indent=2).encode("utf-8")
    archive = _build_lanternpack_zip(
        {
            "bundle_id": item["id"],
            "kind": "oer",
            "title": item["title"],
            "subject": item["subject"],
            "provider": item["provider"],
        },
        {
            "lessons.json": lessons_bytes,
            "summaries.json": summaries_bytes,
        },
    )
    return f"{item['id']}.lanternpack.zip", archive


def export_course_lanternpack(db: Session, course_id: str) -> tuple[str, bytes]:
    course = db.get(Course, course_id)
    if not course:
        raise NotFoundError("Course not found.")

    lessons = (
        db.execute(select(Lesson).where(Lesson.course_id == course_id).order_by(Lesson.position))
        .scalars()
        .all()
    )
    classes = db.execute(select(Class).where(Class.course_id == course_id)).scalars().all()
    class_ids = [c.id for c in classes]
    summaries = (
        db.execute(
            select(LectureSummary).where(LectureSummary.class_id.in_(class_ids), LectureSummary.is_approved.is_(True))
        )
        .scalars()
        .all()
        if class_ids
        else []
    )

    lessons_payload = [
        {
            "id": l.id,
            "course_id": l.course_id,
            "title": l.title,
            "content": l.content or "",
            "position": l.position,
        }
        for l in lessons
    ]
    summaries_payload = [
        {
            "id": s.id,
            "class_id": s.class_id,
            "course_id": course_id,
            "content_json": s.content_json or {},
        }
        for s in summaries
    ]

    archive = _build_lanternpack_zip(
        {
            "bundle_id": course.id,
            "kind": "course",
            "course_id": course.id,
            "title": course.title,
            "description": course.description or "",
        },
        {
            "lessons.json": json.dumps(lessons_payload, indent=2).encode("utf-8"),
            "summaries.json": json.dumps(summaries_payload, indent=2).encode("utf-8"),
        },
    )
    slug = "".join(c if c.isalnum() or c in "-_" else "-" for c in course.title.lower()).strip("-") or course.id
    return f"{slug[:40]}.lanternpack.zip", archive
