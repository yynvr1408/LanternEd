from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from app.db.models.user import User
from app.dependencies import get_current_user, get_db
from app.schemas.common import UtcDatetime
from app.services import notification_service

router = APIRouter(prefix="/notifications", tags=["notifications"])


class NotificationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    kind: str
    title: str
    body: str | None
    link: str | None
    created_at: UtcDatetime
    read_at: UtcDatetime | None


class NotificationList(BaseModel):
    items: list[NotificationOut]
    unread: int


class MarkRead(BaseModel):
    ids: list[str] | None = Field(default=None, max_length=200, description="Omit to mark everything read.")


@router.get("", response_model=NotificationList)
def my_notifications(
    limit: int = Query(30, ge=1, le=100), unread_only: bool = False, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    return NotificationList(
        items=notification_service.list_for_user(db, user.id, limit=limit, unread_only=unread_only),
        unread=notification_service.unread_count(db, user.id),
    )


@router.post("/read")
def mark_notifications_read(payload: MarkRead, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return {"marked": notification_service.mark_read(db, user.id, payload.ids)}
