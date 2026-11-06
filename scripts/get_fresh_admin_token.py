import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))

from app.db.session import SessionLocal
from app.services import admin_service
from app.db import models
from app.db.base import utcnow

def get_token():
    db = SessionLocal()
    admin = db.query(models.user.User).filter(models.user.User.role == models.enums.UserRole.admin).first()
    if admin:
        db.query(models.user.UserSession).filter(models.user.UserSession.user_id == admin.id).update({'revoked_at': utcnow()})
        db.commit()

    admin, token = admin_service.authenticate_admin(db, username='Edu2026@', password='Village@2026', client_ip='127.0.0.1')
    print(token)

if __name__ == "__main__":
    get_token()
